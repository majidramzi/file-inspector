/**
 * Pure formatting helpers.
 */

const UNITS = ["B", "KB", "MB", "GB", "TB", "PB"] as const;

/**
 * Format a byte count as a compact human-readable string.
 *
 * Uses binary (1024-based) units, which is what browsers and operating
 * systems conventionally show for file sizes.
 *
 * @example
 * formatFileSize(0);        // "0 B"
 * formatFileSize(1023);     // "1023 B"
 * formatFileSize(1536);     // "1.5 KB"
 * formatFileSize(1048576);  // "1.0 MB"
 */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "—";
  }
  if (bytes === 0) {
    return "0 B";
  }

  // Floor to unit index; show one decimal for values >= 1 KB.
  let unitIndex = Math.floor(Math.log(bytes) / Math.log(1024));
  if (unitIndex >= UNITS.length) {
    unitIndex = UNITS.length - 1;
  }
  const value = bytes / 1024 ** unitIndex;

  if (unitIndex === 0) {
    return `${Math.round(bytes)} B`;
  }
  const rounded = value >= 100 ? value.toFixed(0) : value.toFixed(1);
  // Avoid "1.0 KB" style noise for whole numbers >= 100 already handled;
  // keep one decimal below 100 for readability.
  return `${rounded} ${UNITS[unitIndex]}`;
}

/**
 * Format a byte count with thousands separators, e.g. "1,048,576 bytes".
 */
export function formatBytesExact(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "—";
  }
  return `${bytes.toLocaleString("en-US")} bytes`;
}

/**
 * Format a last-modified timestamp as a locale string with a stable shape.
 * Returns "—" for invalid timestamps.
 */
export function formatTimestamp(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) {
    return "—";
  }
  try {
    return new Date(ms).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "—";
  }
}

/**
 * Format a duration in milliseconds: "<1 ms", "12 ms", or "1.2 s".
 */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) {
    return "—";
  }
  if (ms < 1) {
    return "<1 ms";
  }
  if (ms < 1000) {
    return `${Math.round(ms)} ms`;
  }
  return `${(ms / 1000).toFixed(1)} s`;
}

/**
 * Truncate a hex digest for compact display while keeping both ends visible.
 */
export function truncateHash(hash: string, head = 16, tail = 8): string {
  if (hash.length <= head + tail + 1) {
    return hash;
  }
  return `${hash.slice(0, head)}…${hash.slice(-tail)}`;
}
