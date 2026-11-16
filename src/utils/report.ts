/**
 * Report generation: build downloadable plain-text reports from the
 * current inspection state. Reports are generated locally as Blobs —
 * nothing is transmitted anywhere.
 */
import type { ComparisonResult, QueuedFile } from "../types";
import { formatBytesExact, formatFileSize, formatTimestamp } from "./format";
import { MD5_SECURITY_NOTICE } from "./hashing";

const SEPARATOR = "─".repeat(64);

function line(label: string, value: string): string {
  return `  ${label.padEnd(18)} ${value}`;
}

/** Build a text report covering the queued files and their checksums. */
export function buildFilesReport(files: readonly QueuedFile[]): string {
  const now = new Date().toISOString();
  const out: string[] = [];
  out.push("FILE INSPECTOR — FILE REPORT");
  out.push(SEPARATOR);
  out.push(`Generated:  ${now}`);
  out.push(`Files:      ${files.length}`);
  out.push(
    "Note:       All data below was computed locally in the browser. No files were uploaded.",
  );
  out.push("");

  files.forEach((q, i) => {
    const m = q.metadata;
    out.push(`[${i + 1}] ${m.name}`);
    out.push(SEPARATOR);
    out.push(line("Extension", m.extension || "(none)"));
    out.push(line("MIME type", m.mimeType || "(unknown)"));
    out.push(line("Size", `${formatBytesExact(m.sizeBytes)} (${formatFileSize(m.sizeBytes)})`));
    out.push(line("Last modified", formatTimestamp(m.lastModified)));
    out.push(
      line(
        "Signature",
        m.signature
          ? `${m.signature.name} — ${m.signature.bytes}`
          : "(no known signature)",
      ),
    );
    out.push(line("Consistency", m.consistency));
    for (const note of m.consistencyNotes) {
      out.push(`    • ${note}`);
    }
    out.push("  Checksums:");
    const entries = Object.values(q.hashes);
    if (entries.length === 0) {
      out.push("    (none computed)");
    }
    for (const h of entries) {
      if (!h) continue;
      out.push(`    ${h.algorithm}:`);
      out.push(`      ${h.value}`);
    }
    if (q.error) {
      out.push(`    Error: ${q.error}`);
    }
    out.push("");
  });

  out.push(SEPARATOR);
  out.push(MD5_SECURITY_NOTICE);
  out.push("");
  out.push(
    "Hash matching is strong evidence of identical content but not a mathematical proof against collisions.",
  );
  return out.join("\n");
}

/** Build a text report for a two-file comparison. */
export function buildComparisonReport(
  a: File,
  b: File,
  result: ComparisonResult,
): string {
  const out: string[] = [];
  out.push("FILE INSPECTOR — COMPARISON REPORT");
  out.push(SEPARATOR);
  out.push(`Generated: ${new Date().toISOString()}`);
  out.push(`File A:    ${a.name} (${formatBytesExact(a.size)})`);
  out.push(`File B:    ${b.name} (${formatBytesExact(b.size)})`);
  out.push(`Verdict:   ${result.identical ? "IDENTICAL" : "DIFFERENT"}`);
  out.push(`Method:    ${result.method}`);
  out.push("");
  out.push("Steps performed:");
  result.steps.forEach((s, i) => out.push(`  ${i + 1}. ${s}`));
  out.push("");
  out.push(
    "Files were compared by content (size, hash, bytes) — never by file name alone.",
  );
  return out.join("\n");
}

/** Trigger a browser download of `text` under `filename`. */
export function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    // Revoke on the next tick so the download can start.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/** Timestamped file name fragment, e.g. "2026-01-15-143022". */
export function reportTimestamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
