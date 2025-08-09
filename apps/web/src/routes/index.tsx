import { createFileRoute } from "@tanstack/react-router";
import { client } from "../utils/orpc";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState, type ComponentPropsWithoutRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { addGeneration, clearHistory, listEntries, removeEntry, upsertSnapshot, type RepoFile } from "../utils/history";
import { useTheme } from "next-themes";
import { motion } from "framer-motion";

export const Route = createFileRoute("/")({
  component: HomeComponent,
});

function HomeComponent() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const [url, setUrl] = useState("");
  const [includePatternsText, setIncludePatternsText] = useState("");
  const [excludePatternsText, setExcludePatternsText] = useState("");
  const [model, setModel] = useState("gemini-2.0-flash");
  const [maxChars, setMaxChars] = useState(120_000);
  const [showPrompt, setShowPrompt] = useState(false);
  const [showIncludedFiles, setShowIncludedFiles] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);
  const [history, setHistory] = useState(listEntries());

  type RepoSnapshotLite = { repo: string; fileCount: number; totalSize: number; files: RepoFile[] };
  type PreviewData = { readme: string; prompt?: string; includedFiles?: string[]; usedChars?: number; fileSampleCount?: number };

  useEffect(() => {
    setHistory(listEntries());
  }, []);

  const selectedEntry = selectedRepo ? history.find((h) => h.repo === selectedRepo) : undefined;

  const parsePatterns = (text: string) => text.split(",").map((s) => s.trim()).filter((s) => s.length > 0);

  const fetchRepo = useMutation({
    mutationFn: async () =>
      client.fetchRepo({
        url,
        includePatterns: parsePatterns(includePatternsText),
        excludePatterns: parsePatterns(excludePatternsText),
      }),
    onSuccess: (data) => {
      const entry = upsertSnapshot({
        repo: data.repo,
        url,
        fileCount: data.fileCount,
        totalSize: data.totalSize,
        files: data.files,
      });
      setHistory(listEntries());
      setSelectedRepo(entry.repo);
    },
  });

  const generateReadme = useMutation({
    mutationFn: async () => {
      const source = (fetchRepo.data as RepoSnapshotLite | undefined) ?? selectedEntry?.snapshot;
      if (!source) throw new Error("No repository data yet");
      return await client.generateReadme({
        repo: source.repo,
        files: source.files.map((f) => ({ path: f.path, size: f.size, content: f.content })),
        includePrompt: true,
        model,
        maxChars,
      });
    },
    onSuccess: (data) => {
      addGeneration(data.repo, {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt: Date.now(),
        model: data.model,
        usedChars: data.usedChars,
        fileSampleCount: data.fileSampleCount,
        includedFiles: data.includedFiles,
        prompt: data.prompt,
        readme: data.readme,
      });
      setHistory(listEntries());
    },
  });

  const unwrapTopLevelFence = (md: string) => {
    const trimmed = md.trim();
    const fenceMatch = trimmed.match(/^```(?:markdown|md|mdx)?\s*\n([\s\S]*?)\n```\s*$/i);
    if (fenceMatch) return fenceMatch[1];
    return md;
  };

  const repoData: RepoSnapshotLite | undefined = (fetchRepo.data as RepoSnapshotLite | undefined) ?? selectedEntry?.snapshot;
  const preview: PreviewData | undefined = (generateReadme.data as PreviewData | undefined) ?? selectedEntry?.generations?.[0];

  return (
    <div className=" flex flex-col bg-[#f2dfb2] dark:bg-gray-900 text-[#1f1a17] dark:text-gray-100 transition-colors">
      {/* Hero */}
      <section className="m-10 grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16 items-start py-8 md:py-16">
        {/* Left: Large hero text */}
        <motion.div
          initial={{ opacity: 0, x: -50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="pt-2 md:pt-8"
        >
          <h1
            className={`font-instrument-serif text-4xl sm:text-5xl md:text-6xl lg:text-7xl leading-[1.05] tracking-tight`}
          >
            Generate beautiful, useful READMEs for your GitHub repos.
          </h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.6 }}
            className="mt-6 max-w-xl text-base sm:text-lg md:text-xl opacity-90"
          >
            Paste a repo link. Get a polished, structured README with badges, install steps, usage, and more—without the
            boilerplate. Built for maintainers, contributors, and teams.
          </motion.p>

          {/* History */}
          <div className="mt-6">
            <Card className="!bg-transparent shadow-none font-instrument-serif">
              <CardHeader>
                <CardTitle>History</CardTitle>
                <CardDescription>Your recently analyzed repositories.</CardDescription>
              </CardHeader>
              <CardContent>
                {history.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No history yet.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {history.map((h) => (
                      <div key={h.repo} className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm">
                        <button
                          type="button"
                          className="underline"
                          onClick={() => {
                            setSelectedRepo(h.repo);
                            setUrl(`https://github.com/${h.repo}`);
                          }}
                        >
                          {h.repo}
                        </button>
                        <span className="text-xs text-muted-foreground">{Math.round(h.snapshot.totalSize / 1024)} KB</span>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            removeEntry(h.repo);
                            setHistory(listEntries());
                            if (selectedRepo === h.repo) setSelectedRepo(null);
                          }}
                        >
                          Remove
                        </Button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        clearHistory();
                        setHistory([]);
                        setSelectedRepo(null);
                      }}
                    >
                      Clear history
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </motion.div>

        {/* Right: Top-aligned input with doodles */}
        <motion.div
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="md:pt-4"
        >
          <div className="md:sticky md:top-8">
            {/* Analyzer */}
            <Card className="!bg-transparent shadow-none font-instrument-serif">
              <CardHeader>
                <CardTitle>Analyze GitHub Repository</CardTitle>
                <CardDescription>Download the repo archive and load files into memory.</CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    fetchRepo.mutate();
                  }}
                  className="flex flex-col gap-3"
                >
                  <div className="grid w-full gap-2 md:grid-cols-[1fr_auto] md:items-end md:gap-3">
                    <div className="grid w-full gap-2">
                      <Label htmlFor="repo-url">GitHub URL</Label>
                      <Input
                        id="repo-url"
                        type="url"
                        required
                        placeholder="https://github.com/owner/repo"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                      />
                    </div>
                    <div className="flex">
                      <Button type="submit" className="w-full md:w-auto" disabled={fetchRepo.isPending || !url}>
                        {fetchRepo.isPending ? "Downloading..." : "Fetch Repo"}
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor="include-patterns">Include patterns (regex, comma-separated)</Label>
                      <Input
                        id="include-patterns"
                        placeholder="e.g. ^src/, \\.(ts|tsx)$"
                        value={includePatternsText}
                        onChange={(e) => setIncludePatternsText(e.target.value)}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="exclude-patterns">Exclude patterns (regex, comma-separated)</Label>
                      <Input
                        id="exclude-patterns"
                        placeholder="e.g. node_modules, ^dist/"
                        value={excludePatternsText}
                        onChange={(e) => setExcludePatternsText(e.target.value)}
                      />
                    </div>
                  </div>
                </form>
                {fetchRepo.isError && (
                  <p className="mt-3 text-sm text-red-500">{(fetchRepo.error as Error).message}</p>
                )}
                {repoData && (
                  <div className="mt-4 space-y-2">
                    <p className="text-sm text-muted-foreground">
                      {repoData.repo} • {repoData.fileCount} files • {Math.round(repoData.totalSize / 1024)} KB
                    </p>
                    <div className="max-h-64 overflow-y-auto rounded-md border bg-background p-2 text-xs">
                      {repoData.files.slice(0, 50).map((f) => (
                        <details key={f.path} className="group">
                          <summary className="cursor-pointer list-none marker:hidden">
                            <span className="font-medium">{f.path}</span>{" "}
                            <span className="text-muted-foreground">({Math.round(f.size)} B)</span>
                          </summary>
                          {f.content && (
                            <pre className="mt-1 overflow-x-auto whitespace-pre-wrap rounded-md border bg-card p-2">
                              {f.content.substring(0, 2000)}
                              {f.content.length > 2000 && "\n...truncated"}
                            </pre>
                          )}
                        </details>
                      ))}
                      {repoData.files.length > 50 && (
                        <p className="mt-2 text-muted-foreground">Showing first 50 files.</p>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Generator under Analyzer */}
          {repoData && (
            <div className="mt-6">
              <Card className="!bg-transparent shadow-none font-instrument-serif">
                <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div className="grid gap-3 sm:max-w-xl w-full">
                    <div className="grid gap-2">
                      <Label htmlFor="model">Model</Label>
                      <Input id="model" value={model} onChange={(e) => setModel(e.target.value)} />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="max-chars">Max characters</Label>
                      <Input
                        id="max-chars"
                        type="number"
                        min={1000}
                        max={200000}
                        value={maxChars}
                        onChange={(e) => setMaxChars(Number.parseInt(e.target.value, 10) || 0)}
                      />
                    </div>
                  </div>
                  <Button
                    type="button"
                    disabled={generateReadme.isPending || !repoData}
                    onClick={() => generateReadme.mutate()}
                  >
                    {generateReadme.isPending ? "Generating..." : "Generate README"}
                  </Button>
                </CardHeader>
                <CardContent>
                  {generateReadme.isError && (
                    <p className="mb-3 text-sm text-red-500">{(generateReadme.error as Error).message}</p>
                  )}
                  {preview && (
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold">README Preview</h3>
                        <Button type="button" variant="outline" size="sm" onClick={() => setShowPrompt(!showPrompt)}>
                          {showPrompt ? "Hide Prompt" : "Show Prompt"}
                        </Button>
                        {preview.includedFiles && (
                          <Button type="button" variant="outline" size="sm" onClick={() => setShowIncludedFiles((v) => !v)}>
                            {showIncludedFiles ? "Hide Files" : "Show Files"}
                          </Button>
                        )}
                      </div>
                      {showPrompt && preview.prompt && (
                        <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md border bg-card p-2 text-xs">{preview.prompt}</pre>
                      )}
                      {showIncludedFiles && Array.isArray(preview.includedFiles) && (
                        <div className="rounded-md border bg-background p-2 text-xs">
                          <p className="mb-1 font-medium">Included files ({preview.includedFiles.length}):</p>
                          <ul className="grid max-h-40 list-disc gap-1 overflow-y-auto pl-5">
                            {preview.includedFiles.slice(0, 100).map((p) => (
                              <li key={p}>{p}</li>
                            ))}
                            {preview.includedFiles.length > 100 && <li>...and more</li>}
                          </ul>
                        </div>
                      )}
                      <div className="max-h-96 overflow-y-auto rounded-md border bg-background p-3 text-sm">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => navigator.clipboard.writeText(preview.readme)}
                          >
                            Copy Markdown
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const blob = new Blob([preview.readme], { type: "text/markdown;charset=utf-8" });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement("a");
                              a.href = url;
                              a.download = "README.md";
                              a.click();
                              URL.revokeObjectURL(url);
                            }}
                          >
                            Download README.md
                          </Button>
                        </div>
                        <article className="markdown-body">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              code({ node, inline, className, children, ...props }: ComponentPropsWithoutRef<'code'> & { inline?: boolean; node?: unknown }) {
                                const match = /language-(\w+)/.exec(className || "");
                                return !inline && match ? (
                                  <SyntaxHighlighter {...props} PreTag="div" language={match[1]} style={isDark ? oneDark : oneLight}>
                                    {String(children).replace(/\n$/, "")}
                                  </SyntaxHighlighter>
                                ) : (
                                  <code className={className} {...props}>
                                    {children}
                                  </code>
                                );
                              },
                              img({ ...props }) {
                                return <img {...props} loading="lazy" />;
                              },
                              a({ ...props }) {
                                return <a {...props} target="_blank" rel="noopener" />;
                              },
                            }}
                          >
                            {unwrapTopLevelFence(preview.readme)}
                          </ReactMarkdown>
                        </article>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {typeof preview.usedChars !== "undefined" && <>
                          Used chars: {preview.usedChars} •{" "}
                        </>}
                        Sampled files: {preview.fileSampleCount ?? "—"}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </motion.div>
      </section>
    </div>
  );
}
