import { createFileRoute } from '@tanstack/react-router'
import { motion } from 'framer-motion'
import { ThemeToggle } from '@/components/theme-toggle'
// import { GithubInput } from '@/components/github-input'
import { useEffect, useMemo, useRef, useState, type ComponentPropsWithoutRef } from 'react'
import SimpleMDE from 'react-simplemde-editor'
import 'easymde/dist/easymde.min.css'
import { useMutation } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Separator } from '../components/ui/separator'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../components/ui/collapsible'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select'
import { client } from '../utils/orpc'
import { addGeneration, clearHistory, getEditedReadme, listEntries, removeEntry, saveEditedReadme, upsertSnapshot, type RepoFile } from '../utils/history'
import { useTheme } from 'next-themes'
import { CheckCircle2, AlertTriangle, ChevronDown, ChevronUp, Settings2, Settings } from 'lucide-react'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { Tabs, TabsContent, TabsContents, TabsList, TabsTrigger } from '@/components/ui/motion-tabs'

export const Route = createFileRoute('/')({
  component: RouteComponent,
})

function RouteComponent() {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  // Secondary theme helpers (used for file list + markdown preview backgrounds)
  // const secondaryBg = 'dark:bg-gray-800'
  // const secondaryBorder = 'border-black/10 dark:border-white/10'
  // const inputPrimary = 'bg-white/90 dark:bg-gray-800/90 border-black/20 dark:border-gray-600 text-black dark:text-white placeholder:text-black/50 dark:placeholder:text-gray-400 backdrop-blur-sm'
  // const buttonPrimary = 'bg-[#1f1a17] dark:bg-gray-100 text-[#f2dfb2] dark:text-gray-900 hover:bg-black dark:hover:bg-white transition-colors'
  const secondaryBg = ''
  const secondaryBorder = ''
  const inputPrimary = ''
  const buttonPrimary = ''
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
  const [advancedCollapsed, setAdvancedCollapsed] = useState(true)

  // New: README editor state and tabs
  const [activeTab, setActiveTab] = useState<'preview' | 'edit'>('preview')
  const [readmeText, setReadmeText] = useState('')
  const readmeAnchorRef = useRef<HTMLDivElement | null>(null)
  const [isClient, setIsClient] = useState(false)

  // Preview options
  const [previewPaperBg, setPreviewPaperBg] = useState(false)
  const [previewScrollable, setPreviewScrollable] = useState(false)

  // Model picker selection
  const [selectedModelId, setSelectedModelId] = useState<string>('gemini-2.0-flash')
  const [provider, setProvider] = useState<'google' | 'openai' | 'deepseek' | 'anthropic' | 'meta' | 'mistral'>('google')

  const isValid = isValidGithubRepoUrl(url)

  type RepoSnapshotLite = { repo: string; fileCount: number; totalSize: number; files: RepoFile[] }
  type PreviewData = { readme: string; prompt?: string; includedFiles?: string[]; usedChars?: number; fileSampleCount?: number }

  useEffect(() => {
    setHistory(listEntries())
  }, [])

  useEffect(() => {
    // Client-only mount flag to avoid SSR issues with SimpleMDE
    setIsClient(true)
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
        model: selectedModelId || model,
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
      // Populate editor with the freshly generated markdown and switch to preview
      setReadmeText(data.readme)
      setActiveTab('preview')
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

  // Old README detection in repo files
  const oldReadmeText = useMemo(() => {
    if (!repoData) return ''
    const patterns = [
      /^readme\.(md|markdown|mdx)$/i,
      /^README$/,
      /^docs\/readme\.(md|markdown|mdx)$/i,
      /^\.github\/readme\.(md|markdown|mdx)$/i,
    ]
    const hit = repoData.files.find((f) => patterns.some((re) => re.test(f.path)))
    return hit?.content ?? ''
  }, [repoData])

  // Sync editor when switching repos or when a stored preview is loaded
  useEffect(() => {
    if (!selectedEntry) return
    // Prefer user's edited text, fall back to latest preview
    const edited = getEditedReadme(selectedEntry.repo)
    if (typeof edited === 'string' && edited.length > 0) {
      setReadmeText(edited)
      setActiveTab('edit')
      return
    }
    if (preview?.readme) {
      setReadmeText(preview.readme)
      setActiveTab('preview')
    }
  }, [selectedEntry?.repo, preview?.readme])

  // Persist edits (debounced by SimpleMDE's internal change cadence is fine here)
  useEffect(() => {
    if (!selectedEntry) return
    saveEditedReadme(selectedEntry.repo, readmeText)
  }, [selectedEntry?.repo, readmeText])

  const transition = {
    duration: 0.8,
    delay: 1,
    spring: { type: 'spring', stiffness: 300, damping: 20 },
    // ease: [0, 0.71, 0.2, 1.01],
  }

  // Provider/model catalog for the picker
  const modelCatalog: Record<string, { label: string; models: { id: string; label: string }[] }> = {
    google: {
      label: 'Google (Gemini)',
      models: [
        { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
        { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
        { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
        { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
        { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
        { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
      ],
    },
    openai: {
      label: 'OpenAI',
      models: [
        { id: 'gpt-4o', label: 'GPT-4o' },
        { id: 'gpt-4o-mini', label: 'GPT-4o mini' },
        { id: 'gpt-4.1', label: 'GPT-4.1' },
        { id: 'o3-mini', label: 'O3 Mini' },
        { id: 'o4-mini', label: 'O4 Mini' },
      ],
    },
    deepseek: {
      label: 'DeepSeek',
      models: [
        { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner' },
        { id: 'deepseek-chat', label: 'DeepSeek Chat' },
        { id: 'deepseek-coder', label: 'DeepSeek Coder' },
      ],
    },
    anthropic: {
      label: 'Anthropic',
      models: [
        { id: 'claude-3-5-sonnet', label: 'Claude 3.5 Sonnet' },
        { id: 'claude-3-opus', label: 'Claude 3 Opus' },
        { id: 'claude-3-haiku', label: 'Claude 3 Haiku' },
      ],
    },
    meta: {
      label: 'Meta (Llama)',
      models: [
        { id: 'llama-3.1-405b', label: 'Llama 3.1 405B' },
        { id: 'llama-3.1-70b', label: 'Llama 3.1 70B' },
        { id: 'llama-3.1-8b', label: 'Llama 3.1 8B' },
      ],
    },
    mistral: {
      label: 'Mistral',
      models: [
        { id: 'mistral-large-latest', label: 'Mistral Large' },
        { id: 'mistral-medium-latest', label: 'Mistral Medium' },
        { id: 'codestral-latest', label: 'Codestral' },
      ],
    },
  }

  // Keep selected model in sync with provider
  useEffect(() => {
    const first = modelCatalog[provider]?.models?.[0]?.id
    if (first) setSelectedModelId(first)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider])

  return (
    <div className="min-h-screen flex flex-col dark:bg-gray-900 text-[#1f1a17] dark:text-gray-100 transition-colors border-15 border-black dark:border-white rounded-4xl bg-white">
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

          <section className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16 items-start py-8 md:py-16 justify-between">
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

              {/* History under left text with cards */}
              <Card className="shadow-none border-none align-bottom align-items-end flex bg-transparent">
                <CardHeader className="p-0 m-0">
                  <CardTitle className="text-xl">History</CardTitle>
                  <CardDescription>Your recently analyzed repositories.</CardDescription>
                </CardHeader>
                <CardContent className="p-0 m-0">
                  {history.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No history yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {history.map((h) => (
                        <Card key={h.repo} className="shadow-none">
                          <CardContent className="">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  className="font-medium underline underline-offset-2 hover:opacity-80"
                                  onClick={() => {
                                    setSelectedRepo(h.repo)
                                    setUrl(`https://github.com/${h.repo}`)
                                  }}
                                >
                                  {h.repo}
                                </button>
                                <Badge variant="outline">
                                  {Math.round(h.snapshot.totalSize / 1024)} KB
                                </Badge>
                              </div>
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
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                  {history.length > 0 && (
                    <>
                      <Separator className="my-4" />
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
                    </>
                  )}
                </CardContent>
              </Card>
            </motion.div>

            {/* Right: Analyzer and Generator */}
            <motion.div
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.4 }}
              className="md:pt-4"
            >
              <div className="md:sticky md:top-8 space-y-6">
                {/* Analyzer Card */}
                <Card>

                  <CardContent className="space-y-4">
                    {/* GithubInput-like form styling with doodles */}
                    <div className="relative space-y-3">
                      {/* Animated doodles around the input */}
                      {/* <motion.div
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
                      </motion.div> */}
                      {/* <motion.div
                        initial={{ opacity: 0, scale: 0, rotate: -10 }}
                        animate={{ opacity: 1, scale: 1, rotate: 8 }}
                        transition={transition}
                        className="absolute -right-4 -top-6 pointer-events-none select-none"
                        aria-hidden="true"
                      >
                        <img src="/undraw_star.svg" alt="" width={30} height={56} />
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
                    <Separator />
                    <Collapsible open={!advancedCollapsed}>
                      <CollapsibleTrigger asChild>
                        <Button
                          variant="outline"
                          className="w-full justify-start"
                          onClick={() => setAdvancedCollapsed((prev) => !prev)}
                        >
                          <Settings className="ml-2 h-4 w-4" />
                          Advanced Settings
                          <div className="align-right place-items-end ml-auto">
                            {advancedCollapsed ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronUp className="h-4 w-4" />
                            )}
                          </div>
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="space-y-3 mt-4">
                          <div className="flex items-center gap-2">
                            <Settings2 className="h-4 w-4" />
                            <span className="text-sm font-medium">File Patterns</span>
                          </div>
                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="space-y-2">
                              <Label htmlFor="include-patterns">Include patterns (regex, comma-separated)</Label>
                              <Input
                                id="include-patterns"
                                placeholder="e.g. ^src/, \\.(ts|tsx)$"
                                value={includePatternsText}
                                onChange={(e) => setIncludePatternsText(e.target.value)}
                                className={inputPrimary}
                              />
                            </div>
                            <div className="space-y-2">
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
                        </div>

                        {fetchRepo.isError && (
                          <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20">
                            <p className="text-sm text-destructive">{(fetchRepo.error as Error).message}</p>
                          </div>
                        )}

                        {repoData && (
                          <div className="space-y-3 mt-4">
                            <Separator />
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Badge variant="default">{repoData.repo}</Badge>
                                <Badge variant="outline">{repoData.fileCount} files</Badge>
                                <Badge variant="outline">{Math.round(repoData.totalSize / 1024)} KB</Badge>
                              </div>
                            </div>
                            <Card className="border-muted">
                              <CardContent className="p-3">
                                <div className="max-h-64 overflow-y-auto space-y-2">
                                  {repoData.files.slice(0, 50).map((f) => (
                                    <Collapsible key={f.path}>
                                      <CollapsibleTrigger asChild>
                                        <Button variant="ghost" className="w-full justify-between p-2 h-auto font-mono text-xs">
                                          <span className="truncate">{f.path}</span>
                                          <Badge variant="outline" className="ml-2 text-xs">
                                            {Math.round(f.size)} B
                                          </Badge>
                                        </Button>
                                      </CollapsibleTrigger>
                                      <CollapsibleContent>
                                        {f.content && (
                                          <pre className="mt-2 p-3 text-xs bg-muted/50 rounded border overflow-x-auto whitespace-pre-wrap">
                                            {f.content.substring(0, 2000)}
                                            {f.content.length > 2000 && "\n...truncated"}
                                          </pre>
                                        )}
                                      </CollapsibleContent>
                                    </Collapsible>
                                  ))}
                                  {repoData.files.length > 50 && (
                                    <p className="text-xs text-muted-foreground text-center pt-2">
                                      Showing first 50 files.
                                    </p>
                                  )}
                                </div>
                              </CardContent>
                            </Card>
                          </div>
                        )}
                        <div className="grid gap-4 sm:grid-cols-2 mt-4">
                          {/* Modern Model Picker - Combined Provider & Model */}
                          <div className="space-y-2">
                            <Label>AI Model</Label>
                            <Select
                              value={`${provider}:${selectedModelId}`}
                              onValueChange={(value) => {
                                const [newProvider, newModelId] = value.split(':')
                                setProvider(newProvider as any)
                                setSelectedModelId(newModelId)
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select a model" />
                              </SelectTrigger>
                              <SelectContent>
                                {Object.entries(modelCatalog).map(([providerKey, providerInfo]) => (
                                  <div key={providerKey}>
                                    <div className="px-2 py-1.5 text-sm font-semibold text-muted-foreground">
                                      {providerInfo.label}
                                    </div>
                                    {providerInfo.models.map((model) => (
                                      <SelectItem
                                        key={`${providerKey}:${model.id}`}
                                        value={`${providerKey}:${model.id}`}
                                        className="pl-4"
                                      >
                                        <div className="flex items-center justify-between w-full">
                                          <span>{model.label}</span>
                                          <Badge variant="outline" className="ml-2 text-xs">
                                            {providerKey}
                                          </Badge>
                                        </div>
                                      </SelectItem>
                                    ))}
                                  </div>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-2 ml-4">
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

                      </CollapsibleContent>
                    </Collapsible>
                  </CardContent>
                </Card>
                {/* Generator Card */}
                {repoData && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">README Generator</CardTitle>
                      <CardDescription>Configure AI model and generation settings</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        {/* Modern Model Picker - Combined Provider & Model */}
                        <div className="space-y-2">
                          <Label>AI Model</Label>
                          <Select
                            value={`${provider}:${selectedModelId}`}
                            onValueChange={(value) => {
                              const [newProvider, newModelId] = value.split(':')
                              setProvider(newProvider as any)
                              setSelectedModelId(newModelId)
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select a model" />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(modelCatalog).map(([providerKey, providerInfo]) => (
                                <div key={providerKey}>
                                  <div className="px-2 py-1.5 text-sm font-semibold text-muted-foreground">
                                    {providerInfo.label}
                                  </div>
                                  {providerInfo.models.map((model) => (
                                    <SelectItem
                                      key={`${providerKey}:${model.id}`}
                                      value={`${providerKey}:${model.id}`}
                                      className="pl-4"
                                    >
                                      <div className="flex items-center justify-between w-full">
                                        <span>{model.label}</span>
                                        <Badge variant="outline" className="ml-2 text-xs">
                                          {providerKey}
                                        </Badge>
                                      </div>
                                    </SelectItem>
                                  ))}
                                </div>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
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

                      <Separator />

                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          disabled={generateReadme.isPending || !repoData}
                          onClick={() => {
                            setAnalyzerCollapsed(true)
                            generateReadme.mutate()
                            readmeAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                          }}
                          className={buttonPrimary}
                        >
                          {generateReadme.isPending ? 'Generating...' : 'Generate README'}
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => setPreviewPaperBg((v) => !v)}>
                          {previewPaperBg ? 'Default Background' : 'Paper Background'}
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => setPreviewScrollable((v) => !v)}>
                          {previewScrollable ? 'Expand Preview' : 'Constrain Preview'}
                        </Button>
                      </div>

                      {generateReadme.isError && (
                        <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20">
                          <p className="text-sm text-destructive">{(generateReadme.error as Error).message}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            </motion.div>
          </section>
          {/* README Preview Section */}
          <div ref={readmeAnchorRef} aria-hidden="true" />
          {preview && (
            <div className="mt-8 space-y-6">
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant="default" className="text-sm px-3 py-1">
                  README Generated
                </Badge>
                <Button type="button" variant="outline" size="sm" onClick={() => setShowPrompt(!showPrompt)}>
                  {showPrompt ? 'Hide Prompt' : 'Show Prompt'}
                </Button>
                {preview.includedFiles && (
                  <Button type="button" variant="outline" size="sm" onClick={() => setShowIncludedFiles((v) => !v)}>
                    {showIncludedFiles ? 'Hide Files' : 'Show Files'}
                  </Button>
                )}
              </div>

              {/* Three-column layout with ResizablePanelGroup */}
              <ResizablePanelGroup direction="horizontal" className="min-h-[600px] rounded-lg">
                {/* Old README */}
                {/* <ResizablePanel defaultSize={25} minSize={20}>
                  <Card className="h-full rounded-none border-0 border-r">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Existing README</CardTitle>
                    </CardHeader>
                    <CardContent className="h-[calc(100%-4rem)] overflow-y-auto">
                      {oldReadmeText ? (
                        <article className="prose dark:prose-invert prose-sm max-w-none">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {unwrapTopLevelFence(oldReadmeText)}
                          </ReactMarkdown>
                        </article>
                      ) : (
                        <p className="text-sm text-muted-foreground">No README found in the repository.</p>
                      )}
                    </CardContent>
                  </Card>
                </ResizablePanel> */}

                {/* <ResizableHandle /> */}

                {/* Center: New preview + editor tabs */}
                <ResizablePanel defaultSize={50} minSize={30}>
                  <Card className={`h-full rounded-none border-0 ${previewPaperBg ? 'bg-white dark:bg-gray-900' : ''}`}>
                    <CardContent className="h-full p-0">
                      {/* <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'preview' | 'edit')} className="h-full flex flex-col">
                        <div className="border-b p-3">
                          <TabsList>
                            <TabsTrigger value="preview">Preview</TabsTrigger>
                            <TabsTrigger value="edit">Edit</TabsTrigger>
                          </TabsList>
                        </div> */}

                      {/* <TabsContent value="preview" className="flex-1 p-4 overflow-y-auto"> */}
                      <div
                        role="tabpanel"
                        id="readme-panel-preview"
                        aria-labelledby="readme-tab-preview"
                        className={previewScrollable ? 'max-h-[60vh] overflow-y-auto' : ''}
                      >
                        <article className="markdown-body prose dark:prose-invert max-w-none">
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
                            {unwrapTopLevelFence(readmeText || preview.readme)}
                          </ReactMarkdown>
                        </article>
                      </div>
                      {/* </TabsContent> */}

                      {/* <TabsContent value="edit" className="flex-1 p-4"> */}
                      {/* <div className="h-full space-y-2">
                        <Label htmlFor="readme-editor">Edit README</Label>
                        <div className="h-[calc(100%-2rem)] rounded-md border overflow-hidden">
                          {isClient && (
                            <SimpleMDE
                              id="readme-editor"
                              value={readmeText}
                              onChange={(v) => setReadmeText(v)}
                              options={{
                                spellChecker: false,
                                minHeight: '400px',
                                autofocus: true,
                                status: false,
                                renderingConfig: { singleLineBreaks: false },
                              }}
                            />
                          )}
                        </div>
                      </div> */}
                      {/* </TabsContent> */}
                      {/* </Tabs> */}
                    </CardContent>
                  </Card>
                </ResizablePanel>

                <ResizableHandle />

                {/* Right: Recommendations & improvements */}
                <ResizablePanel defaultSize={25} minSize={20}>
                  <Card className="h-full rounded-none border-0 border-l">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Improvements & Tools</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-3">
                        <h5 className="text-sm font-medium">Recommended Services</h5>
                        <div className="space-y-2 text-sm">
                          <a
                            href="https://shields.io"
                            target="_blank"
                            rel="noopener"
                            className="flex items-center gap-2 p-2 rounded hover:bg-muted transition-colors"
                          >
                            <Badge variant="outline" className="text-xs">badges</Badge>
                            Shields.io
                          </a>
                          <a
                            href="https://github.com/anuraghazra/github-readme-stats"
                            target="_blank"
                            rel="noopener"
                            className="flex items-center gap-2 p-2 rounded hover:bg-muted transition-colors"
                          >
                            <Badge variant="outline" className="text-xs">stats</Badge>
                            GitHub Stats
                          </a>
                          <a
                            href="https://allcontributors.org"
                            target="_blank"
                            rel="noopener"
                            className="flex items-center gap-2 p-2 rounded hover:bg-muted transition-colors"
                          >
                            <Badge variant="outline" className="text-xs">contrib</Badge>
                            All Contributors
                          </a>
                          <a
                            href="https://contrib.rocks"
                            target="_blank"
                            rel="noopener"
                            className="flex items-center gap-2 p-2 rounded hover:bg-muted transition-colors"
                          >
                            <Badge variant="outline" className="text-xs">visual</Badge>
                            Contrib.rocks
                          </a>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </ResizablePanel>
              </ResizablePanelGroup>

              {/* Collapsible sections for prompt and files */}
              {showPrompt && preview.prompt && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Generation Prompt</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap text-xs bg-muted/50 p-3 rounded border">
                      {preview.prompt}
                    </pre>
                  </CardContent>
                </Card>
              )}

              {showIncludedFiles && Array.isArray(preview.includedFiles) && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      Included Files ({preview.includedFiles.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="max-h-40 overflow-y-auto">
                      <div className="grid gap-1">
                        {preview.includedFiles.slice(0, 100).map((path) => (
                          <div key={path} className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs font-mono">
                              {path}
                            </Badge>
                          </div>
                        ))}
                        {preview.includedFiles.length > 100 && (
                          <p className="text-sm text-muted-foreground pt-2">...and {preview.includedFiles.length - 100} more</p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Actions card */}
              <Card>
                <CardContent className="pt-6">
                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      type="button"
                      onClick={() => navigator.clipboard.writeText(readmeText || preview.readme)}
                    >
                      Copy Markdown
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        const blob = new Blob([readmeText || preview.readme], { type: 'text/markdown;charset=utf-8' })
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
                  <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                    {typeof preview.usedChars !== 'undefined' && (
                      <span>Used chars: {preview.usedChars.toLocaleString()}</span>
                    )}
                    <span>Sampled files: {preview.fileSampleCount ?? '—'}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div >
      <motion.footer
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 1 }}
        className="border-t border-black/10 dark:border-gray-700 dark:bg-gray-900"
      >
        <div className="container mx-auto px-4 md:px-8 py-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <p className="text-sm opacity-80">© {new Date().getFullYear()} gitme. Generate READMEs in seconds.</p>
            <div className="text-sm opacity-70">Tip: Try {'"https://github.com/vercel/next.js"'}</div>
          </div>
        </div>
      </motion.footer>
    </div >
  )
}
