export type RepoFile = { path: string; size: number; content?: string };
export type RepoSnapshot = {
  repo: string;
  url?: string;
  fileCount: number;
  totalSize: number;
  files: RepoFile[];
  fetchedAt: number;
};

export type ReadmeGeneration = {
  id: string;
  createdAt: number;
  model?: string;
  usedChars?: number;
  fileSampleCount?: number;
  includedFiles?: string[];
  prompt?: string;
  readme: string;
};

export type RepoHistoryEntry = {
  repo: string;
  url?: string;
  snapshot: RepoSnapshot;
  generations: ReadmeGeneration[];
  // Persist the latest edited README text (user changes) per repo
  editedReadme?: string;
  updatedAt: number;
};

export type RepoHistory = Record<string, RepoHistoryEntry>;

const STORAGE_KEY = "repoHistory:v1";

function safeParse<T>(raw: string | null, fallback: T): T {
  try {
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function loadHistory(): RepoHistory {
  if (typeof window === "undefined") return {};
  return safeParse<RepoHistory>(localStorage.getItem(STORAGE_KEY), {});
}

function saveHistory(hist: RepoHistory) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(hist));
}

export function upsertSnapshot(snapshot: Omit<RepoSnapshot, "fetchedAt"> & { fetchedAt?: number; url?: string }) {
  const hist = loadHistory();
  const existing = hist[snapshot.repo];
  const entry: RepoHistoryEntry = {
    repo: snapshot.repo,
    url: snapshot.url,
    snapshot: {
      ...snapshot,
      fetchedAt: snapshot.fetchedAt ?? Date.now(),
    },
    generations: existing?.generations ?? [],
    updatedAt: Date.now(),
  };
  hist[snapshot.repo] = entry;
  saveHistory(hist);
  return entry;
}

export function addGeneration(repo: string, gen: ReadmeGeneration) {
  const hist = loadHistory();
  const entry = hist[repo];
  if (!entry) return;
  entry.generations.unshift(gen);
  entry.updatedAt = Date.now();
  hist[repo] = entry;
  saveHistory(hist);
}

export function getEntry(repo: string): RepoHistoryEntry | undefined {
  const hist = loadHistory();
  return hist[repo];
}

export function listEntries(): RepoHistoryEntry[] {
  const hist = loadHistory();
  return Object.values(hist).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function removeEntry(repo: string) {
  const hist = loadHistory();
  delete hist[repo];
  saveHistory(hist);
}

export function clearHistory() {
  saveHistory({});
}

// Save user's edited README markdown for a repo
export function saveEditedReadme(repo: string, readme: string) {
  const hist = loadHistory();
  const entry = hist[repo];
  if (!entry) return;
  entry.editedReadme = readme;
  entry.updatedAt = Date.now();
  hist[repo] = entry;
  saveHistory(hist);
}

export function getEditedReadme(repo: string): string | undefined {
  const entry = getEntry(repo);
  return entry?.editedReadme;
}
