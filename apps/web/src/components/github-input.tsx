import { useMemo, useState } from "react"
import { motion } from "framer-motion"
import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import { CheckCircle2, AlertTriangle } from "lucide-react"

function isValidGithubRepoUrl(value: string): boolean {
  if (!value) return false
  try {
    const url = new URL(value)
    if (!/^(www\.)?github\.com$/i.test(url.hostname)) return false
    const segments = url.pathname.split("/").filter(Boolean)
    return segments.length >= 2
  } catch {
    return false
  }
}

export function GithubInput() {
  const [value, setValue] = useState("")
  const [touched, setTouched] = useState(false)
  const [submittedUrl, setSubmittedUrl] = useState<string | null>(null)

  const isValid = useMemo(() => isValidGithubRepoUrl(value), [value])

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (!isValid) return
    setSubmittedUrl(value.trim())
  }

  return (
    <div className="relative">
      {/* Animated doodles around the input */}
      <motion.div
        initial={{ opacity: 0, rotate: -30 }}
        animate={{ opacity: 0.8, rotate: -15 }}
        transition={{ duration: 1, delay: 0.8 }}
        className="absolute -top-10 -left-8 pointer-events-none select-none"
        aria-hidden="true"
      >
        {/* <Image src="/images/doodles/arrow-right.png" alt="" width={120} height={120} /> */}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, rotate: -10 }}
        animate={{ opacity: 0.9, rotate: 10 }}
        transition={{ duration: 1, delay: 1 }}
        className="absolute -right-6 -top-8 pointer-events-none select-none"
        aria-hidden="true"
      >
        {/* <Image src="/images/doodles/sparkles.png" alt="" width={90} height={90} /> */}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scaleX: 0 }}
        animate={{ opacity: 0.6, scaleX: 1 }}
        transition={{ duration: 1, delay: 1.2 }}
        className="absolute -bottom-6 left-6 pointer-events-none select-none"
        aria-hidden="true"
      >
        {/* <Image src="/images/doodles/squiggle.png" alt="" width={180} height={28} /> */}
      </motion.div>

      <div className="space-y-3">
        <div className="text-xs uppercase tracking-wider opacity-70">Paste your GitHub repo URL</div>

        <form onSubmit={onSubmit} className="flex flex-col sm:flex-row items-stretch gap-3">
          <label htmlFor="repo" className="sr-only">
            GitHub repository URL
          </label>
          <Input
            id="repo"
            type="url"
            inputMode="url"
            placeholder="https://github.com/owner/repo"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => setTouched(true)}
            aria-invalid={touched && !isValid}
            aria-describedby="repo-help"
            className="bg-white/90 dark:bg-gray-800/90 border-black/20 dark:border-gray-600 text-black dark:text-white placeholder:text-black/50 dark:placeholder:text-gray-400 backdrop-blur-sm"
          />
          <Button
            type="submit"
            className="bg-[#1f1a17] dark:bg-gray-100 text-[#f2dfb2] dark:text-gray-900 hover:bg-black dark:hover:bg-white transition-colors"
          >
            Generate README
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
              <span>Looks good! README generation is coming soon for: {submittedUrl}</span>
            </motion.div>
          ) : (
            <div className="text-sm opacity-70">Example: {'"https://github.com/vercel/next.js"'}</div>
          )}
        </div>
      </div>
    </div>
  )
}
