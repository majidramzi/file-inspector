import { Check, Copy, Download } from "lucide-react";
import { useState } from "react";
import type { HashResult } from "../types";
import { formatDuration, truncateHash } from "../utils/format";
import { MD5_SECURITY_NOTICE, isLegacyAlgorithm } from "../utils/hashing";

interface HashRowProps {
  result: HashResult;
  onDownload: () => void;
}

/**
 * One checksum row: algorithm label, full digest, copy button.
 * MD5 rows carry an explicit legacy/security warning.
 */
export function HashRow({ result, onDownload }: HashRowProps) {
  const [copied, setCopied] = useState(false);
  const legacy = isLegacyAlgorithm(result.algorithm);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(result.value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard may be unavailable (insecure context / permissions).
      setCopied(false);
    }
  };

  return (
    <div
      className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/70"
      data-testid={`hash-row-${result.algorithm}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={`rounded px-1.5 py-0.5 font-mono text-xs font-semibold ${
              legacy
                ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                : "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
            }`}
          >
            {result.algorithm}
          </span>
          {legacy && (
            <span
              className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-600 dark:bg-slate-700 dark:text-slate-300"
              title={MD5_SECURITY_NOTICE}
            >
              Legacy · not for security
            </span>
          )}
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {formatDuration(result.durationMs)}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleCopy}
            aria-label={`Copy ${result.algorithm} hash`}
            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" aria-hidden />
                Copy
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onDownload}
            aria-label={`Download report containing ${result.algorithm} hash`}
            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            Report
          </button>
        </div>
      </div>
      <code
        className="mt-2 block break-all font-mono text-xs leading-relaxed text-slate-700 dark:text-slate-300"
        title={result.value}
      >
        {result.value.length > 48 ? truncateHash(result.value, 32, 16) : result.value}
      </code>
      {legacy && (
        <p className="mt-2 text-xs leading-relaxed text-amber-700 dark:text-amber-400">
          {MD5_SECURITY_NOTICE}
        </p>
      )}
    </div>
  );
}
