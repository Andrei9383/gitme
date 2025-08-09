import { createFileRoute } from '@tanstack/react-router'
import { motion, spring } from 'framer-motion'
import { ThemeToggle } from '@/components/theme-toggle'
// import { GithubInput } from '@/components/github-input'
import { useEffect, useState, type ComponentPropsWithoutRef } from 'react'
import { useMutation } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { client } from '../utils/orpc'
import { addGeneration, clearHistory, listEntries, removeEntry, upsertSnapshot, type RepoFile } from '../utils/history'
import { useTheme } from 'next-themes'
import { CheckCircle2, AlertTriangle } from 'lucide-react'


export const Route = createFileRoute('/home')({
  component: RouteComponent,
})

function RouteComponent() {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  // Secondary theme helpers (used for file list + markdown preview backgrounds)
  const secondaryBg = 'bg-[#efe3c8] dark:bg-gray-800'
  const secondaryBorder = 'border-black/10 dark:border-white/10'
  const inputPrimary = 'bg-white/90 dark:bg-gray-800/90 border-black/20 dark:border-gray-600 text-black dark:text-white placeholder:text-black/50 dark:placeholder:text-gray-400 backdrop-blur-sm'
  const buttonPrimary = 'bg-[#1f1a17] dark:bg-gray-100 text-[#f2dfb2] dark:text-gray-900 hover:bg-black dark:hover:bg-white transition-colors'

  // Github URL validation helpers
  const isValidGithubRepoUrl = (value: string): boolean => {
    if (!value) return false
    try {
      const u = new URL(value)
      if (!/^(www\.)?github\.com$/i.test(u.hostname)) return false
      const segments = u.pathname.split('/').filter(Boolean)
      return segments.length >= 2
    } catch {
      return false
    }
  }

  const [url, setUrl] = useState('')
  const [touched, setTouched] = useState(false)
  const [submittedUrl, setSubmittedUrl] = useState<string | null>(null)

  const [includePatternsText, setIncludePatternsText] = useState('')
  const [excludePatternsText, setExcludePatternsText] = useState('')
  const [model, setModel] = useState('gemini-2.0-flash')
  const [maxChars, setMaxChars] = useState(120_000)
  const [showPrompt, setShowPrompt] = useState(false)
  const [showIncludedFiles, setShowIncludedFiles] = useState(false)
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null)
  const [history, setHistory] = useState(listEntries())
  const [analyzerCollapsed, setAnalyzerCollapsed] = useState(false)

  const isValid = isValidGithubRepoUrl(url)

  type RepoSnapshotLite = { repo: string; fileCount: number; totalSize: number; files: RepoFile[] }
  type PreviewData = { readme: string; prompt?: string; includedFiles?: string[]; usedChars?: number; fileSampleCount?: number }

  useEffect(() => {
    setHistory(listEntries())
  }, [])

  const selectedEntry = selectedRepo ? history.find((h) => h.repo === selectedRepo) : undefined

  const parsePatterns = (text: string) => text.split(',').map((s) => s.trim()).filter((s) => s.length > 0)

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
      })
      setHistory(listEntries())
      setSelectedRepo(entry.repo)
    },
  })

  const generateReadme = useMutation({
    mutationFn: async () => {
      const source = (fetchRepo.data as RepoSnapshotLite | undefined) ?? selectedEntry?.snapshot
      if (!source) throw new Error('No repository data yet')
      return await client.generateReadme({
        repo: source.repo,
        files: source.files.map((f) => ({ path: f.path, size: f.size, content: f.content })),
        includePrompt: true,
        model,
        maxChars,
      })
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
      })
      setHistory(listEntries())
    },
  })

  const unwrapTopLevelFence = (md: string) => {
    const trimmed = md.trim()
    const fenceMatch = trimmed.match(/^```(?:markdown|md|mdx)?\s*\n([\s\S]*?)\n```\s*$/i)
    if (fenceMatch) return fenceMatch[1]
    return md
  }

  const repoData: RepoSnapshotLite | undefined = (fetchRepo.data as RepoSnapshotLite | undefined) ?? selectedEntry?.snapshot
  const preview: PreviewData | undefined = (generateReadme.data as PreviewData | undefined) ?? selectedEntry?.generations?.[0]

  const transition = {
    duration: 0.8,
    delay: 1,
    spring: { type: 'spring', stiffness: 300, damping: 20 },
    // ease: [0, 0.71, 0.2, 1.01],
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#f2dfb2] dark:bg-gray-900 text-[#1f1a17] dark:text-gray-100 transition-colors border-10 border-black dark:border-white rounded-4xl">
      <div className="flex-1">
        <div className="container mx-auto px-4 md:px-8">
          <motion.header
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="flex items-center justify-between py-6"
          >
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-[#1f1a17] dark:bg-gray-100" />
              <span className="text-lg font-semibold tracking-tight">gitme</span>
            </div>
            <ThemeToggle />
          </motion.header>

          <section className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16 items-start py-8 md:py-16">
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
                Paste a repo link. Get a polished, structured README with badges, install steps, usage, and more—without
                the boilerplate. Built for maintainers, contributors, and teams.
              </motion.p>

              {/* History under left text (no cards) */}
              <div className="mt-8 space-y-3 ">
                <h2 className="text-xl font-semibold">History</h2>
                <p className="text-sm text-muted-foreground">Your recently analyzed repositories.</p>
                {history.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No history yet.</p>
                ) : (
                  <div className={`mt-2 rounded-lg border ${secondaryBorder} ${secondaryBg}`}>
                    <ul className="divide-y divide-black/10 dark:divide-white/10">
                      {history.map((h) => (
                        <li key={h.repo} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              className="underline underline-offset-2 hover:opacity-80"
                              onClick={() => {
                                setSelectedRepo(h.repo)
                                setUrl(`https://github.com/${h.repo}`)
                              }}
                            >
                              {h.repo}
                            </button>
                            <span className="text-xs text-muted-foreground">{Math.round(h.snapshot.totalSize / 1024)} KB</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                removeEntry(h.repo)
                                setHistory(listEntries())
                                if (selectedRepo === h.repo) setSelectedRepo(null)
                              }}
                            >
                              Remove
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {history.length > 0 && (
                  <div className="pt-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        clearHistory()
                        setHistory([])
                        setSelectedRepo(null)
                      }}
                    >
                      Clear history
                    </Button>
                  </div>
                )}
              </div>
            </motion.div>

            {/* Right: Analyzer and Generator (no cards) */}
            <motion.div
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.4 }}
              className="md:pt-4"
            >
              <div className="md:sticky md:top-8 space-y-6 ">
                {/* Expand button when analyzer is collapsed */}
                {analyzerCollapsed && (
                  <div className="flex justify-end">
                    <Button type="button" variant="outline" size="sm" onClick={() => setAnalyzerCollapsed(false)}>
                      Show analyzer
                    </Button>
                  </div>
                )}

                {/* Analyzer */}
                {!analyzerCollapsed && (
                  <div>
                    {/* <h2 className="text-xl font-semibold">Analyze GitHub Repository</h2>
                    <p className="text-sm text-muted-foreground">Download the repo archive and load files into memory.</p> */}

                    {/* GithubInput-like form styling with doodles */}
                    <div className="relative mt-4 space-y-3">
                      {/* Animated doodles around the input */}
                      <motion.div
                        initial={{ opacity: 0, rotate: -10 }}
                        animate={{ opacity: 1, rotate: 8 }}
                        transition={{
                          delay: 1,
                          duration: 0.4,
                          scale: { type: "spring", visualDuration: 0.4, bounce: 0.5 },
                        }}
                        className="absolute -top-8 -left-6 pointer-events-none select-none"
                        aria-hidden="true"
                      >
                        <img src="/undraw_arrow.svg" alt="" width={80} height={80} />
                      </motion.div>
                      <motion.div
                        initial={{ opacity: 0, scale: 0, rotate: -10 }}
                        animate={{ opacity: 1, scale: 1, rotate: 8 }}
                        transition={transition}

                        className="absolute -right-4 -top-6 pointer-events-none select-none"
                        aria-hidden="true"
                      >
                        <img src="/undraw_star.svg" alt="" width={30} height={56} />
                      </motion.div>
                      {/* <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 0.95 }}
                        transition={{ duration: 0.5, delay: 1.2 }}
                        className="absolute -bottom-4 left-6 pointer-events-none select-none"
                        aria-hidden="true"
                      >
                        <img src="/undraw_circled-arrow.svg" alt="" width={50} height={22} />
                      </motion.div> */}

                      <div className="text-xs uppercase tracking-wider opacity-70">Paste your GitHub repo URL</div>
                      <form
                        onSubmit={(e) => {
                          e.preventDefault()
                          setTouched(true)
                          if (!isValid) return
                          setSubmittedUrl(url.trim())
                          fetchRepo.mutate()
                        }}
                        className="flex flex-col sm:flex-row items-stretch gap-3"
                      >
                        <label htmlFor="repo" className="sr-only">
                          GitHub repository URL
                        </label>
                        <Input
                          id="repo"
                          type="url"
                          inputMode="url"
                          placeholder="https://github.com/owner/repo"
                          value={url}
                          onChange={(e) => setUrl(e.target.value)}
                          onBlur={() => setTouched(true)}
                          aria-invalid={touched && !isValid}
                          aria-describedby="repo-help"
                          className={inputPrimary}
                        />
                        <Button
                          type="submit"
                          className={buttonPrimary}
                        >
                          Fetch Repo
                        </Button>
                      </form>

                      <div id="repo-help" className="min-h-[24px]">
                        {touched && !isValid ? (
                          <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex items-center gap-2 text-sm text-red-700 dark:text-red-400"
                          >
                            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                            <span>Enter a valid GitHub repo URL, e.g. {'"https://github.com/owner/repo"'}</span>
                          </motion.div>
                        ) : submittedUrl ? (
                          <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex items-center gap-2 text-sm text-emerald-800 dark:text-emerald-400"
                          >
                            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                            <span>Looks good! Loaded: {submittedUrl}</span>
                          </motion.div>
                        ) : (
                          <div className="text-sm opacity-70">Example: {'"https://github.com/vercel/next.js"'}</div>
                        )}
                      </div>
                    </div>

                    {/* Include/Exclude patterns */}
                    <form className="mt-4 flex flex-col gap-3" onSubmit={(e) => e.preventDefault()}>
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="grid gap-2">
                          <Label htmlFor="include-patterns">Include patterns (regex, comma-separated)</Label>
                          <Input
                            id="include-patterns"
                            placeholder="e.g. ^src/, \\.(ts|tsx)$"
                            value={includePatternsText}
                            onChange={(e) => setIncludePatternsText(e.target.value)}
                            className={inputPrimary}
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="exclude-patterns">Exclude patterns (regex, comma-separated)</Label>
                          <Input
                            id="exclude-patterns"
                            placeholder="e.g. node_modules, ^dist/"
                            value={excludePatternsText}
                            onChange={(e) => setExcludePatternsText(e.target.value)}
                            className={inputPrimary}
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
                        <div className={`max-h-64 overflow-y-auto rounded-md border ${secondaryBorder} ${secondaryBg} p-2 text-xs`}>
                          {repoData.files.slice(0, 50).map((f) => (
                            <details key={f.path} className="group">
                              <summary className="cursor-pointer list-none marker:hidden">
                                <span className="font-medium">{f.path}</span>{' '}
                                <span className="text-muted-foreground">({Math.round(f.size)} B)</span>
                              </summary>
                              {f.content && (
                                <pre className={`mt-1 overflow-x-auto whitespace-pre-wrap rounded-md border ${secondaryBorder} ${secondaryBg} p-2`}>
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
                  </div>
                )}

                {/* Generator under Analyzer */}
                {repoData && (
                  <div>
                    <h2 className="text-xl font-semibold">Generator</h2>
                    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                      <div className="grid gap-3 sm:max-w-xl w-full">
                        <div className="grid gap-2">
                          <Label htmlFor="model">Model</Label>
                          <Input id="model" value={model} onChange={(e) => setModel(e.target.value)} className={inputPrimary} />
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
                            className={inputPrimary}
                          />
                        </div>
                      </div>
                      <Button
                        type="button"
                        disabled={generateReadme.isPending || !repoData}
                        onClick={() => {
                          setAnalyzerCollapsed(true)
                          generateReadme.mutate()
                        }}
                        className={buttonPrimary}
                      >
                        {generateReadme.isPending ? 'Generating...' : 'Generate README'}
                      </Button>
                    </div>

                    {generateReadme.isError && (
                      <p className="mt-3 text-sm text-red-500">{(generateReadme.error as Error).message}</p>
                    )}

                    {preview && (
                      <div className="mt-4 space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-semibold">README Preview</h3>
                          <Button type="button" variant="outline" size="sm" onClick={() => setShowPrompt(!showPrompt)}>
                            {showPrompt ? 'Hide Prompt' : 'Show Prompt'}
                          </Button>
                          {preview.includedFiles && (
                            <Button type="button" variant="outline" size="sm" onClick={() => setShowIncludedFiles((v) => !v)}>
                              {showIncludedFiles ? 'Hide Files' : 'Show Files'}
                            </Button>
                          )}
                        </div>
                        {showPrompt && preview.prompt && (
                          <pre className={`max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md border ${secondaryBorder} ${secondaryBg} p-2 text-xs`}>{preview.prompt}</pre>
                        )}
                        {showIncludedFiles && Array.isArray(preview.includedFiles) && (
                          <div className={`rounded-md border ${secondaryBorder} ${secondaryBg} p-2 text-xs`}>
                            <p className="mb-1 font-medium">Included files ({preview.includedFiles.length}):</p>
                            <ul className="grid max-h-40 list-disc gap-1 overflow-y-auto pl-5">
                              {preview.includedFiles.slice(0, 100).map((p) => (
                                <li key={p}>{p}</li>
                              ))}
                              {preview.includedFiles.length > 100 && <li>...and more</li>}
                            </ul>
                          </div>
                        )}
                        <div className={`max-h-[70vh] overflow-y-auto rounded-md border ${secondaryBorder} ${secondaryBg} p-4 text-base`}>
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
                                const blob = new Blob([preview.readme], { type: 'text/markdown;charset=utf-8' })
                                const url = URL.createObjectURL(blob)
                                const a = document.createElement('a')
                                a.href = url
                                a.download = 'README.md'
                                a.click()
                                URL.revokeObjectURL(url)
                              }}
                            >
                              Download README.md
                            </Button>
                          </div>
                          <article className="markdown-body bg-transparent">
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              components={{
                                code({ node, inline, className, children, ...props }: ComponentPropsWithoutRef<'code'> & { inline?: boolean; node?: unknown }) {
                                  const match = /language-(\w+)/.exec(className || '')
                                  return !inline && match ? (
                                    <SyntaxHighlighter {...props} PreTag="div" language={match[1]} style={isDark ? oneDark : oneLight}>
                                      {String(children).replace(/\n$/, '')}
                                    </SyntaxHighlighter>
                                  ) : (
                                    <code className={className} {...props}>
                                      {children}
                                    </code>
                                  )
                                },
                                img({ ...props }) {
                                  return <img {...props} loading="lazy" />
                                },
                                a({ ...props }) {
                                  return <a {...props} target="_blank" rel="noopener" />
                                },
                              }}
                            >
                              {unwrapTopLevelFence(preview.readme)}
                            </ReactMarkdown>
                          </article>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {typeof preview.usedChars !== 'undefined' && <>
                            Used chars: {preview.usedChars} •{' '}
                          </>}
                          Sampled files: {preview.fileSampleCount ?? '—'}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </section>
        </div>
      </div>

      <motion.footer
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 1 }}
        className="border-t border-black/10 dark:border-gray-700 bg-[#f2dfb2] dark:bg-gray-900"
      >
        <div className="container mx-auto px-4 md:px-8 py-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <p className="text-sm opacity-80">© {new Date().getFullYear()} gitme. Generate READMEs in seconds.</p>
            <div className="text-sm opacity-70">Tip: Try {'"https://github.com/vercel/next.js"'}</div>
          </div>
        </div>
      </motion.footer>
    </div>
  )
}
