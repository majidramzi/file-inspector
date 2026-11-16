import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Copy,
  Download,
  Layers,
  Loader2,
  SearchCheck,
} from "lucide-react";
import type { DuplicateGroup, HashAlgorithm, QueuedFile } from "../types";
import { groupDuplicates, totalWastedBytes } from "../utils/duplicates";
import { formatBytesExact, formatFileSize } from "../utils/format";
import { downloadText, reportTimestamp } from "../utils/report";
import { EmptyState } from "./EmptyState";

interface DuplicatePanelProps {
  files: readonly QueuedFile[];
  /**
   * Ensure `id` has a checksum for `algorithm`, computing it if needed.
   * Returns the hex digest. Hashing is owned by the App so state updates
   * flow through React immutably.
   */
  ensureHash: (id: string, algorithm: HashAlgorithm) => Promise<string>;
}

function buildDuplicateReport(
  groups: readonly DuplicateGroup[],
  algorithm: HashAlgorithm,
): string {
  const out: string[] = [];
  out.push("FILE INSPECTOR — DUPLICATE REPORT");
  out.push("─".repeat(64));
  out.push(`Generated: ${new Date().toISOString()}`);
  out.push(`Grouping hash: ${algorithm}`);
  out.push(`Duplicate groups: ${groups.length}`);
  out.push(`Reclaimable space: ${formatBytesExact(totalWastedBytes(groups))}`);
  out.push("");
  groups.forEach((g, i) => {
    out.push(`Group ${i + 1} — ${algorithm} ${g.hash}`);
    g.files.forEach((f) => {
      out.push(`  • ${f.name} (${formatBytesExact(f.sizeBytes)})`);
    });
    out.push(`  Wasted: ${formatBytesExact(g.wastedBytes)}`);
    out.push("");
  });
  out.push(
    "Note: matching cryptographic hashes are strong evidence of identical content but not a mathematical proof against collisions.",
  );
  return out.join("\n");
}

/**
 * Duplicate detection panel: hashes every queued file with the selected
 * algorithm and displays groups of files with identical content.
 */
export function DuplicatePanel({ files, ensureHash }: DuplicatePanelProps) {
  const [hashKey, setHashKey] = useState<HashAlgorithm>("SHA-256");
  const [scanning, setScanning] = useState(false);
  const [scannedKey, setScannedKey] = useState<HashAlgorithm | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  /** hashKey → id → digest captured at scan time. */
  const [snapshots, setSnapshots] = useState<
    Record<string, Record<string, string>>
  >({});

  const handleScan = async () => {
    setScanning(true);
    setError(null);
    setSnapshots((s) => ({ ...s, [hashKey]: {} }));
    setProgress({ done: 0, total: files.length });
    try {
      const bucket: Record<string, string> = {};
      let done = 0;
      for (const f of files) {
        const digest = await ensureHash(f.id, hashKey);
        bucket[f.id] = digest;
        done += 1;
        setProgress({ done, total: files.length });
      }
      setSnapshots((s) => ({ ...s, [hashKey]: bucket }));
      setScannedKey(hashKey);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Duplicate scan failed.");
      setScannedKey(null);
    } finally {
      setScanning(false);
    }
  };

  const groups = useMemo(() => {
    if (!scannedKey) return [];
    const bucket = snapshots[scannedKey] ?? {};
    const candidates = files.map((f) => ({
      id: f.id,
      name: f.metadata.name,
      sizeBytes: f.metadata.sizeBytes,
      hash: bucket[f.id] ?? null,
    }));
    return groupDuplicates(candidates);
  }, [files, scannedKey, snapshots]);

  const handleDownload = () => {
    if (!scannedKey) return;
    downloadText(
      `duplicate-report-${reportTimestamp()}.txt`,
      buildDuplicateReport(groups, scannedKey),
    );
  };

  if (files.length < 2) {
    return (
      <EmptyState
        icon={<Layers className="h-10 w-10" aria-hidden />}
        title="Add at least two files to detect duplicates"
        description="Duplicate detection hashes every file's content and groups files whose checksums match. File names are irrelevant — only content matters."
      />
    );
  }

  const wasted = totalWastedBytes(groups);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Duplicate detection
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Hashes {files.length} file{files.length === 1 ? "" : "s"} and groups
              identical content.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                Grouping hash
              </span>
              <select
                value={hashKey}
                onChange={(e) => setHashKey(e.target.value as HashAlgorithm)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                disabled={scanning}
              >
                <option value="SHA-256">SHA-256 (recommended)</option>
                <option value="SHA-512">SHA-512</option>
                <option value="SHA-384">SHA-384</option>
                <option value="MD5">MD5 (legacy)</option>
              </select>
            </label>
            <button
              type="button"
              onClick={handleScan}
              disabled={scanning}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              data-testid="scan-duplicates"
            >
              {scanning ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <SearchCheck className="h-4 w-4" aria-hidden />
              )}
              {scanning
                ? `Scanning ${progress.done}/${progress.total}…`
                : "Scan for duplicates"}
            </button>
          </div>
        </div>

        <p className="mt-3 flex items-start gap-1.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          Matching cryptographic hashes are strong evidence of identical content,
          but they are not a mathematical proof against collisions. Two different
          files could, in principle, share a hash.
        </p>

        {error && (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
      </div>

      {scannedKey && groups.length === 0 && (
        <EmptyState
          icon={<Copy className="h-10 w-10" aria-hidden />}
          title="No duplicates found"
          description={`All ${files.length} files have distinct ${scannedKey} checksums — no two files share the same content.`}
        />
      )}

      {groups.length > 0 && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/30">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
              {groups.length} duplicate group{groups.length === 1 ? "" : "s"} ·{" "}
              {formatFileSize(wasted)} reclaimable
            </p>
            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-slate-900 dark:text-amber-200 dark:hover:bg-slate-800"
            >
              <Download className="h-3.5 w-3.5" aria-hidden />
              Download report
            </button>
          </div>

          <div className="space-y-4">
            {groups.map((group, i) => (
              <section
                key={group.hash}
                className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
                data-testid="duplicate-group"
              >
                <header className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    Group {i + 1} · {group.files.length} identical files ·{" "}
                    {formatFileSize(group.files[0].sizeBytes)} each
                  </h3>
                  <code className="break-all font-mono text-xs text-slate-500 dark:text-slate-400">
                    {scannedKey}: {group.hash.slice(0, 24)}…
                  </code>
                </header>
                <ul className="mt-3 space-y-2">
                  {group.files.map((f) => (
                    <li
                      key={f.id}
                      className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/60"
                    >
                      <span className="truncate text-sm text-slate-700 dark:text-slate-200">
                        {f.name}
                      </span>
                      <span className="shrink-0 font-mono text-xs text-slate-500 dark:text-slate-400">
                        {formatBytesExact(f.sizeBytes)}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  Matching {scannedKey} checksums — strong evidence these files
                  have identical content, not a collision-proof proof.
                </p>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
