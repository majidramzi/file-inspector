import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  File as FileIcon,
  FileQuestion,
  Hash,
  HelpCircle,
  Loader2,
  Trash2,
  XCircle,
} from "lucide-react";
import type { HashResult, QueuedFile } from "../types";
import { formatBytesExact, formatFileSize, formatTimestamp } from "../utils/format";
import { LARGE_FILE_NOTICE, LARGE_FILE_WARNING_BYTES } from "../utils/hashing";
import { HashRow } from "./HashRow";

interface FileCardProps {
  queued: QueuedFile;
  onRemove: (id: string) => void;
  onHashReport: (id: string) => void;
}

const CONSISTENCY_BADGES: Record<
  QueuedFile["metadata"]["consistency"],
  { label: string; className: string; icon: React.ReactNode }
> = {
  consistent: {
    label: "Extension matches type",
    className:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    icon: <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />,
  },
  inconsistent: {
    label: "Extension does NOT match type",
    className:
      "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
    icon: <XCircle className="h-3.5 w-3.5" aria-hidden />,
  },
  unknown: {
    label: "Type consistency unknown",
    className:
      "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    icon: <HelpCircle className="h-3.5 w-3.5" aria-hidden />,
  },
  "no-extension": {
    label: "No file extension",
    className:
      "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    icon: <FileQuestion className="h-3.5 w-3.5" aria-hidden />,
  },
};

function Field({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </dt>
      <dd
        className={`mt-0.5 text-sm text-slate-800 dark:text-slate-100 ${mono ? "font-mono break-all" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * Card showing one file's metadata, signature, consistency verdict,
 * and computed checksums.
 */
export function FileCard({ queued, onRemove, onHashReport }: FileCardProps) {
  const { metadata: m } = queued;
  const badge = CONSISTENCY_BADGES[m.consistency];
  const large = m.sizeBytes >= LARGE_FILE_WARNING_BYTES;

  return (
    <article
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
      data-testid="file-card"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400">
            <FileIcon className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <h3
              className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100"
              title={m.name}
            >
              {m.name}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {formatBytesExact(m.sizeBytes)} · {formatFileSize(m.sizeBytes)}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onRemove(queued.id)}
          aria-label={`Remove ${m.name} from the list`}
          className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950 dark:hover:text-red-400"
        >
          <Trash2 className="h-4 w-4" aria-hidden />
        </button>
      </header>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}
          data-testid="consistency-badge"
        >
          {badge.icon}
          {badge.label}
        </span>
        {m.mimeType && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {m.mimeType}
          </span>
        )}
        {large && (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300"
            title={LARGE_FILE_NOTICE}
          >
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
            Large file
          </span>
        )}
      </div>

      <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
        <Field label="Extension" value={m.extension || "(none)"} mono />
        <Field label="MIME type" value={m.mimeType || "(not reported)"} mono />
        <Field label="Size (bytes)" value={m.sizeBytes.toLocaleString("en-US")} mono />
        <Field
          label="Last modified"
          value={
            <>
              <Calendar className="mr-1 inline h-3.5 w-3.5 align-text-bottom text-slate-400" aria-hidden />
              {formatTimestamp(m.lastModified)}
            </>
          }
        />
      </dl>

      <div className="mt-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          <Hash className="h-3.5 w-3.5" aria-hidden />
          File signature
        </p>
        {m.signature ? (
          <>
            <p className="mt-1 text-sm font-medium text-slate-800 dark:text-slate-100">
              {m.signature.name}
            </p>
            <code className="mt-0.5 block break-all font-mono text-xs text-slate-600 dark:text-slate-300">
              {m.signature.bytes}
              {m.signature.offset > 0 && ` (offset ${m.signature.offset})`}
            </code>
          </>
        ) : (
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            No known file signature matched. This is common for plain-text and
            other formats without magic bytes — it is not a safety indicator.
          </p>
        )}
      </div>

      <div className="mt-2 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Consistency notes
        </p>
        <ul className="mt-1 space-y-1">
          {m.consistencyNotes.map((note, i) => (
            <li
              key={i}
              className="flex items-start gap-1.5 text-sm text-slate-600 dark:text-slate-300"
            >
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-400" aria-hidden />
              {note}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          <AlertTriangle className="mr-1 inline h-3.5 w-3.5 align-text-bottom" aria-hidden />
          A matching extension/MIME type does <strong>not</strong> mean the file
          is safe. This tool never executes or renders file contents.
        </p>
      </div>

      <section className="mt-3" aria-label={`Checksums for ${m.name}`}>
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Checksums
          </h4>
          {queued.error && (
            <span className="text-xs text-red-600 dark:text-red-400">
              {queued.error}
            </span>
          )}
        </div>
        {queued.pending.length > 0 && (
          <p className="mb-2 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Computing {queued.pending.join(", ")}…
          </p>
        )}
        <div className="space-y-2">
          {Object.values(queued.hashes)
            .filter((h): h is HashResult => h != null)
            .map((h) => (
              <HashRow
                key={h.algorithm}
                result={h}
                onDownload={() => onHashReport(queued.id)}
              />
            ))}
        </div>
        {Object.keys(queued.hashes).length === 0 &&
          queued.pending.length === 0 &&
          !queued.error && (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No checksums computed yet.
            </p>
          )}
      </section>
    </article>
  );
}
