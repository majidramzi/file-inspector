import { useMemo, useState } from "react";
import {
  ArrowLeftRight,
  CheckCircle2,
  Download,
  FileDiff,
  Loader2,
  XCircle,
} from "lucide-react";
import type { ComparisonResult, QueuedFile } from "../types";
import { compareFiles, methodLabel } from "../utils/comparison";
import { buildComparisonReport, downloadText, reportTimestamp } from "../utils/report";
import { formatFileSize } from "../utils/format";
import { EmptyState } from "./EmptyState";

interface ComparePanelProps {
  files: readonly QueuedFile[];
}

/**
 * Two-file comparison panel. Never compares file names — only content
 * (size → SHA-256 → byte-for-byte), with a visible explanation of the
 * method that produced the verdict.
 */
export function ComparePanel({ files }: ComparePanelProps) {
  const [leftId, setLeftId] = useState("");
  const [rightId, setRightId] = useState("");
  const [result, setResult] = useState<ComparisonResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const left = files.find((f) => f.id === leftId) ?? null;
  const right = files.find((f) => f.id === rightId) ?? null;

  const canCompare = Boolean(left && right && left.id !== right.id);

  const handleCompare = async () => {
    if (!left || !right) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const r = await compareFiles(left.file, right.file);
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Comparison failed unexpectedly.");
    } finally {
      setBusy(false);
    }
  };

  const handleDownload = () => {
    if (!left || !right || !result) return;
    downloadText(
      `comparison-report-${reportTimestamp()}.txt`,
      buildComparisonReport(left.file, right.file, result),
    );
  };

  const options = useMemo(() => files, [files]);

  if (files.length < 2) {
    return (
      <EmptyState
        icon={<FileDiff className="h-10 w-10" aria-hidden />}
        title="Add at least two files to compare"
        description="Comparison checks file size, SHA-256 hashes, and — when practical — every byte directly. File names are never used as evidence of equality."
      />
    );
  }

  const selectClasses =
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Select two files
        </h2>
        <div className="mt-3 grid grid-cols-1 items-end gap-4 sm:grid-cols-[1fr_auto_1fr]">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
              File A
            </span>
            <select
              value={leftId}
              onChange={(e) => {
                setLeftId(e.target.value);
                setResult(null);
              }}
              className={selectClasses}
              data-testid="compare-left"
            >
              <option value="">Choose a file…</option>
              {options.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.metadata.name} ({formatFileSize(f.metadata.sizeBytes)})
                </option>
              ))}
            </select>
          </label>

          <div className="hidden justify-center pb-2 sm:flex">
            <ArrowLeftRight className="h-5 w-5 text-slate-400" aria-hidden />
          </div>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
              File B
            </span>
            <select
              value={rightId}
              onChange={(e) => {
                setRightId(e.target.value);
                setResult(null);
              }}
              className={selectClasses}
              data-testid="compare-right"
            >
              <option value="">Choose a file…</option>
              {options.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.metadata.name} ({formatFileSize(f.metadata.sizeBytes)})
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleCompare}
            disabled={!canCompare || busy}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            data-testid="compare-button"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <ArrowLeftRight className="h-4 w-4" aria-hidden />
            )}
            {busy ? "Comparing…" : "Compare files"}
          </button>
          {left && right && left.id === right.id && (
            <p className="text-sm text-amber-600 dark:text-amber-400">
              Choose two different files.
            </p>
          )}
        </div>

        <p className="mt-3 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          <strong>Method:</strong> sizes are compared first (a cheap, conclusive
          mismatch); if equal, SHA-256 digests are computed for both files; when
          both files are small enough, a byte-for-byte comparison of the raw
          contents confirms the result. The verdict below lists every step that
          ran.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      )}

      {result && left && right && (
        <div
          className={`rounded-2xl border p-4 ${
            result.identical
              ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30"
              : "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30"
          }`}
          data-testid="comparison-result"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {result.identical ? (
                <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" aria-hidden />
              ) : (
                <XCircle className="h-6 w-6 text-red-600 dark:text-red-400" aria-hidden />
              )}
              <div>
                <p
                  className={`text-lg font-bold ${result.identical ? "text-emerald-800 dark:text-emerald-300" : "text-red-800 dark:text-red-300"}`}
                >
                  {result.identical ? "Files are identical" : "Files are different"}
                </p>
                <p
                  className={`text-sm ${result.identical ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-300"}`}
                >
                  Verdict by {methodLabel(result.method)} — content-based, not
                  name-based.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <Download className="h-3.5 w-3.5" aria-hidden />
              Download report
            </button>
          </div>

          <ol className="mt-3 space-y-1.5">
            {result.steps.map((step, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200"
              >
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
