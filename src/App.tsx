import { useCallback, useRef, useState } from "react";
import {
  CheckSquare,
  FileText,
  Info,
  Layers,
  Moon,
  Scale,
  Sun,
  Trash2,
} from "lucide-react";
import type { HashAlgorithm, QueuedFile } from "./types";
import { HASH_ALGORITHMS } from "./types";
import { inspectFile } from "./utils/fileMetadata";
import {
  hashBlob,
  LARGE_FILE_NOTICE,
  LARGE_FILE_WARNING_BYTES,
} from "./utils/hashing";
import {
  buildFilesReport,
  downloadText,
  reportTimestamp,
} from "./utils/report";
import { useTheme } from "./hooks/useTheme";
import { DropZone } from "./components/DropZone";
import { PrivacyNotice } from "./components/PrivacyNotice";
import { FileCard } from "./components/FileCard";
import { ComparePanel } from "./components/ComparePanel";
import { DuplicatePanel } from "./components/DuplicatePanel";
import { EmptyState } from "./components/EmptyState";

type TabId = "files" | "compare" | "duplicates";

const TABS: Array<{ id: TabId; label: string; icon: React.ReactNode }> = [
  { id: "files", label: "File inspector", icon: <FileText className="h-4 w-4" /> },
  { id: "compare", label: "Compare", icon: <Scale className="h-4 w-4" /> },
  { id: "duplicates", label: "Duplicates", icon: <Layers className="h-4 w-4" /> },
];

let idCounter = 0;
const nextId = () => `file-${Date.now()}-${idCounter++}`;

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const [files, setFiles] = useState<QueuedFile[]>([]);
  const [tab, setTab] = useState<TabId>("files");
  const [adding, setAdding] = useState(false);
  const [addErrors, setAddErrors] = useState<string[]>([]);

  // In-flight hash computations, keyed by `${id}:${algorithm}`, so
  // concurrent callers (cards + duplicate scans) share one computation.
  const inFlight = useRef<Map<string, Promise<string>>>(new Map());

  // Mirror `files` into a ref so async workers read fresh state without
  // re-creating their identity on every render.
  const filesRef = useRef<QueuedFile[]>(files);
  filesRef.current = files;

  /** Compute (or reuse) a single hash for a file; returns the digest. */
  const ensureHash = useCallback(
    async (id: string, algorithm: HashAlgorithm): Promise<string> => {
      const key = `${id}:${algorithm}`;
      const existing = inFlight.current.get(key);
      if (existing) return existing;

      const promise = (async () => {
        const target = filesRef.current.find((f) => f.id === id);
        if (!target) {
          throw new Error("File is no longer in the list.");
        }
        const cached = target.hashes[algorithm];
        if (cached) return cached.value;

        // Mark as pending (functional update keeps concurrent callers honest).
        setFiles((prev) =>
          prev.map((f) =>
            f.id === id && !f.pending.includes(algorithm)
              ? { ...f, pending: [...f.pending, algorithm], error: null }
              : f,
          ),
        );
        try {
          const result = await hashBlob(target.file, algorithm);
          setFiles((prev) =>
            prev.map((f) =>
              f.id === id
                ? {
                    ...f,
                    hashes: { ...f.hashes, [algorithm]: result },
                    pending: f.pending.filter((p) => p !== algorithm),
                  }
                : f,
            ),
          );
          return result.value;
        } catch (e) {
          const message = e instanceof Error ? e.message : "Hashing failed.";
          setFiles((prev) =>
            prev.map((f) =>
              f.id === id
                ? {
                    ...f,
                    pending: f.pending.filter((p) => p !== algorithm),
                    error: `${algorithm}: ${message}`,
                  }
                : f,
            ),
          );
          throw e;
        } finally {
          inFlight.current.delete(key);
        }
      })();

      inFlight.current.set(key, promise);
      return promise;
    },
    [],
  );

  /** Compute the default hash set for a newly added file. */
  const computeDefaultHashes = useCallback(
    async (id: string) => {
      const target = filesRef.current.find((f) => f.id === id);
      if (!target) return;
      // Large files are hashed only on explicit request — Web Crypto buffers
      // the entire file in memory (not a streaming digest).
      if (target.metadata.sizeBytes >= LARGE_FILE_WARNING_BYTES) {
        return;
      }
      for (const algorithm of HASH_ALGORITHMS) {
        const current = filesRef.current.find((f) => f.id === id);
        if (!current || current.hashes[algorithm]) continue;
        try {
          await ensureHash(id, algorithm);
        } catch {
          // Per-algorithm errors are already recorded on the file entry.
          break;
        }
      }
    },
    [ensureHash],
  );

  const addFiles = useCallback(
    async (incoming: File[]) => {
      if (incoming.length === 0) return;
      setAdding(true);
      const errors: string[] = [];
      const queued: QueuedFile[] = [];

      for (const file of incoming) {
        try {
          const metadata = await inspectFile(file);
          queued.push({
            id: nextId(),
            file,
            metadata,
            hashes: {},
            pending: [],
            error: null,
          });
        } catch (e) {
          errors.push(
            `${file.name}: ${e instanceof Error ? e.message : "could not be inspected"}`,
          );
        }
      }

      if (queued.length > 0) {
        setFiles((prev) => [...prev, ...queued]);
        // Keep the ref in sync immediately so the hashing loop below sees
        // the new entries before the next render commits.
        filesRef.current = [...filesRef.current, ...queued];
      }
      setAddErrors(errors);
      setAdding(false);

      // Hash sequentially to bound peak memory (each digest buffers a copy).
      for (const q of queued) {
        await computeDefaultHashes(q.id);
      }
    },
    [computeDefaultHashes],
  );

  const removeFile = useCallback((id: string) => {
    // Drop in-flight work and the File reference so the browser can
    // reclaim the underlying data.
    for (const key of [...inFlight.current.keys()]) {
      if (key.startsWith(`${id}:`)) {
        inFlight.current.delete(key);
      }
    }
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    inFlight.current.clear();
    setFiles([]);
    setAddErrors([]);
  }, []);

  const downloadAllReport = useCallback(() => {
    if (files.length === 0) return;
    downloadText(
      `file-inspector-report-${reportTimestamp()}.txt`,
      buildFilesReport(files),
    );
  }, [files]);

  const downloadFileReport = useCallback(
    (id: string) => {
      const target = files.find((f) => f.id === id);
      if (!target) return;
      downloadText(
        `file-inspector-${target.metadata.name.replace(/[^\w.-]+/g, "_")}-${reportTimestamp()}.txt`,
        buildFilesReport([target]),
      );
    },
    [files],
  );

  const hashAnyPending = files.some((f) => f.pending.length > 0);
  const largeFiles = files.filter(
    (f) =>
      f.metadata.sizeBytes >= LARGE_FILE_WARNING_BYTES &&
      Object.keys(f.hashes).length === 0,
  );

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white">
              <Info className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <h1 className="text-base font-bold leading-tight text-slate-900 dark:text-slate-50">
                File Inspector
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Inspect · hash · compare — entirely on your device
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {files.length > 0 && (
              <button
                type="button"
                onClick={clearAll}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
                Clear all
              </button>
            )}
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={
                theme === "dark" ? "Switch to light theme" : "Switch to dark theme"
              }
              className="rounded-lg border border-slate-300 p-2 text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {theme === "dark" ? (
                <Sun className="h-4 w-4" aria-hidden />
              ) : (
                <Moon className="h-4 w-4" aria-hidden />
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <PrivacyNotice />

        <div className="mt-5">
          <DropZone onFilesSelected={addFiles} disabled={adding} />
          {adding && (
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Inspecting files…
            </p>
          )}
          {addErrors.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm text-red-600 dark:text-red-400">
              {addErrors.map((e) => (
                <li key={e}>⚠ {e}</li>
              ))}
            </ul>
          )}
        </div>

        {largeFiles.length > 0 && (
          <div
            className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
            role="alert"
          >
            <strong>Large file notice: </strong>
            {LARGE_FILE_NOTICE}{" "}
            {largeFiles.length > 0 && (
              <span>
                ({largeFiles.map((f) => f.metadata.name).join(", ")} will be
                hashed on demand.)
              </span>
            )}
          </div>
        )}

        <nav
          className="mt-6 flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900"
          aria-label="Tool sections"
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id ? "page" : undefined}
              className={`flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                tab === t.id
                  ? "bg-blue-600 text-white shadow"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </nav>

        <div className="mt-5">
          {tab === "files" && (
            <section aria-label="File inspector">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  {files.length === 0
                    ? "No files selected yet."
                    : `${files.length} file${files.length === 1 ? "" : "s"} selected`}
                  {hashAnyPending && " · checksums computing…"}
                </p>
                {files.length > 0 && (
                  <button
                    type="button"
                    onClick={downloadAllReport}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    <CheckSquare className="h-4 w-4" aria-hidden />
                    Download full report
                  </button>
                )}
              </div>

              {files.length === 0 ? (
                <EmptyState
                  icon={<FileText className="h-10 w-10" aria-hidden />}
                  title="Inspect your first file"
                  description="Drop a file above to see its name, extension, MIME type, exact size, last-modified time, content signature, and whether the extension matches the detected type — plus SHA-256/384/512 and MD5 checksums."
                >
                  <div className="mx-auto max-w-xl rounded-lg bg-slate-50 p-3 text-left text-xs leading-relaxed text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    <p className="mb-1 font-semibold text-slate-600 dark:text-slate-300">
                      What this tool does
                    </p>
                    <p>
                      Everything runs in this browser tab using local file APIs
                      and the Web Crypto API. Checksums help you verify that two
                      copies of a file have identical content; they are not an
                      antivirus and never imply a file is safe.
                    </p>
                  </div>
                </EmptyState>
              ) : (
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  {files.map((f) => (
                    <FileCard
                      key={f.id}
                      queued={f}
                      onRemove={removeFile}
                      onHashReport={downloadFileReport}
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          {tab === "compare" && <ComparePanel files={files} />}
          {tab === "duplicates" && (
            <DuplicatePanel files={files} ensureHash={ensureHash} />
          )}
        </div>

        <footer className="mt-12 border-t border-slate-200 pt-6 text-center text-xs leading-relaxed text-slate-500 dark:border-slate-800 dark:text-slate-400">
          <p>
            <strong>File Inspector</strong> — local-only file inspection,
            checksums, and comparison. No uploads, no analytics, no external
            APIs.
          </p>
          <p className="mt-1">
            MD5 is offered as a legacy checksum and is unsuitable for
            security-sensitive integrity verification. Hash equality is strong
            evidence of identical content, not a mathematical proof against
            collisions.
          </p>
        </footer>
      </main>
    </div>
  );
}
