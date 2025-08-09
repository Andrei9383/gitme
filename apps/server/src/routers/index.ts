import { publicProcedure } from "../lib/orpc";
import * as JSZipNS from "jszip";
import type { JSZipObject } from "jszip";
import { z } from "zod";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const appRouter = {
  healthCheck: publicProcedure.handler(() => {
    return "OK";
  }),
  fetchRepo: publicProcedure
    .input(
      z.object({
        url: z.string().url().regex(/github.com\/[^/]+\/[^/]+/i, "Must be a GitHub repo URL"),
        maxFileSize: z
          .number()
          .int()
          .positive()
          .max(500_000)
          .default(120_000),
        maxFiles: z.number().int().positive().max(3000).default(600),
        includePatterns: z.array(z.string()).optional(),
        excludePatterns: z.array(z.string()).optional(),
      })
    )
    .handler(async ({ input }) => {
      const { url, maxFileSize, maxFiles, includePatterns, excludePatterns } = input;

      const match = url.match(/github.com\/([^/]+)\/([^/#?]+)(?:|#.*|\?.*)$/i);
      if (!match) {
        throw new Error("Invalid GitHub repository URL");
      }
      const owner = match[1];
      const repo = match[2].replace(/\.git$/, "");

      async function fetchZipFor(branch: string) {
        const archiveUrl = `https://codeload.github.com/${owner}/${repo}/zip/refs/heads/${branch}`;
        const res = await fetch(archiveUrl);
        if (!res.ok) return null;
        return res.arrayBuffer();
      }

      let zipBuffer = await fetchZipFor("main");
      if (!zipBuffer) zipBuffer = await fetchZipFor("master");
      if (!zipBuffer) throw new Error("Failed to download repo archive (tried main & master)");

      const zip = await JSZipNS.loadAsync(zipBuffer);

      const includeRegexes = (includePatterns || []).map((p: string) => new RegExp(p));
      const defaultExcludes = ["node_modules", "dist", "build", "\\.git/", "\\.cache"];
      const excludeRegexes = (excludePatterns || defaultExcludes).map((p: string) => new RegExp(p));

      const files: { path: string; size: number; content?: string }[] = [];
      let count = 0;
      const rootFolder = Object.keys(zip.files)[0]?.split("/")[0];

      const entries = Object.entries(zip.files) as [string, JSZipObject][];
      for (const [fullPath, entry] of entries) {
        if (entry.dir) continue;
        const relPath = rootFolder ? fullPath.replace(new RegExp(`^${rootFolder}/`), "") : fullPath;
        if (!relPath) continue;
        if (excludeRegexes.some((r) => r.test(relPath))) continue;
        if (includeRegexes.length && !includeRegexes.some((r) => r.test(relPath))) continue;

        // Determine size via binary length (safer than private _data)
        let binary: Uint8Array | null = null;
        try {
          binary = await entry.async("uint8array");
        } catch {
          binary = null;
        }
        const size = binary?.byteLength ?? 0;
        if (size > maxFileSize) continue;
        if (count >= maxFiles) break;

        let content: string | undefined;
        if (size <= maxFileSize) {
          try {
            content = await entry.async("text");
          } catch {
            content = undefined;
          }
        }
        files.push({ path: relPath, size, content });
        count++;
      }

      return {
        repo: `${owner}/${repo}`,
        fileCount: files.length,
        totalSize: files.reduce((a, f) => a + f.size, 0),
        files,
      };
    }),
  generateReadme: publicProcedure
    .input(
      z.object({
        repo: z.string(),
        files: z
          .array(
            z.object({
              path: z.string(),
              size: z.number(),
              content: z.string().optional(),
            })
          )
          .min(1),
        maxChars: z.number().int().positive().max(200_000).default(120_000),
        model: z.string().default("gemini-2.0-flash"),
        includePrompt: z.boolean().default(false),
      })
    )
    .handler(async ({ input }) => {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("GEMINI_API_KEY not configured on server");
      }

      const { repo, files, maxChars, model, includePrompt } = input;

      // Lightweight heuristic: prioritize README-like, config, package, src entry points
      const priorityPatterns = [
        /readme/i,
        /package\.json$/i,
        /tsconfig\.json$/i,
        /biome\.json$/i,
        /src\/index\.(t|j)sx?$/i,
        /src\/main\.(t|j)sx?$/i,
        /dockerfile/i,
      ];

      const sorted = [...files].sort((a, b) => {
        const aScore = priorityPatterns.some((r) => r.test(a.path)) ? 0 : 1;
        const bScore = priorityPatterns.some((r) => r.test(b.path)) ? 0 : 1;
        if (aScore !== bScore) return aScore - bScore;
        return a.path.localeCompare(b.path);
      });

      let collected = "";
      const includedFiles: string[] = [];
      for (const f of sorted) {
        if (!f.content) continue;
        const header = `\n\n[FILE] ${f.path} (${f.size} bytes)\n`;
        if (collected.length + header.length + f.content.length + 8 > maxChars) continue;
        collected += `${header}\n\n\`\`\`\n${f.content}\n\`\`\`\n`;
        includedFiles.push(f.path);
      }

      const systemPrompt = `You are an AI that crafts high-quality, comprehensive README.md files for GitHub repositories.\nGenerate a professional README in GitHub-flavored Markdown for the repository ${repo}.\nEmphasize: concise overview, key features, tech stack, setup instructions, usage examples, architecture summary, contribution guidelines, and license placeholder.\nInfer missing context cautiously; clearly mark assumptions. Avoid hallucinations. Prefer facts from the provided files. If something is unknown, state that it is unknown. Provide command examples using Bun where applicable if bun.lock or bunfig appears.`;

      const prompt = `${systemPrompt}\n\nRepository files (excerpts):${collected.slice(0, maxChars)}`;

      const genAI = new GoogleGenerativeAI(apiKey);
      const modelClient = genAI.getGenerativeModel({ model });

      let text = "";
      try {
        // eslint-disable-next-line no-console
        console.info("[generateReadme] sending to model", {
          repo,
          model,
          usedChars: collected.length,
          includedFiles: includedFiles.length,
        });
        const result = await modelClient.generateContent(prompt);
        const response = await result.response;
        text = response.text();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // eslint-disable-next-line no-console
        console.error("[generateReadme] Gemini request failed:", message);
        throw new Error(`Gemini request failed: ${message}`);
      }

      return {
        repo,
        readme: text,
        usedChars: collected.length,
        fileSampleCount: includedFiles.length,
        includedFiles,
        model,
        prompt: includePrompt ? prompt : undefined,
      };
    }),
};
export type AppRouter = typeof appRouter;
