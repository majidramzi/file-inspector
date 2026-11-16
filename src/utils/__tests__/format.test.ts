import { describe, expect, it } from "vitest";
import {
  formatBytesExact,
  formatDuration,
  formatFileSize,
  formatTimestamp,
  truncateHash,
} from "../format";

describe("formatFileSize", () => {
  it("returns '0 B' for zero bytes", () => {
    expect(formatFileSize(0)).toBe("0 B");
  });

  it("keeps sub-kilobyte values in bytes", () => {
    expect(formatFileSize(1)).toBe("1 B");
    expect(formatFileSize(999)).toBe("999 B");
    expect(formatFileSize(1023)).toBe("1023 B");
  });

  it("formats kilobytes with one decimal", () => {
    expect(formatFileSize(1024)).toBe("1.0 KB");
    expect(formatFileSize(1536)).toBe("1.5 KB");
  });

  it("formats megabytes and gigabytes", () => {
    expect(formatFileSize(1024 * 1024)).toBe("1.0 MB");
    expect(formatFileSize(1024 * 1024 * 1024)).toBe("1.0 GB");
    expect(formatFileSize(5 * 1024 * 1024 * 1024)).toBe("5.0 GB");
  });

  it("drops the decimal for large three-digit values", () => {
    expect(formatFileSize(100 * 1024)).toBe("100 KB");
  });

  it("handles fractional input gracefully", () => {
    expect(formatFileSize(100.4)).toBe("100 B");
  });

  it("returns a dash for invalid input", () => {
    expect(formatFileSize(-1)).toBe("—");
    expect(formatFileSize(Number.NaN)).toBe("—");
    expect(formatFileSize(Number.POSITIVE_INFINITY)).toBe("—");
  });
});

describe("formatBytesExact", () => {
  it("groups digits with separators", () => {
    expect(formatBytesExact(1048576)).toBe("1,048,576 bytes");
    expect(formatBytesExact(0)).toBe("0 bytes");
  });
});

describe("formatTimestamp", () => {
  it("formats a valid epoch timestamp", () => {
    const out = formatTimestamp(Date.UTC(2026, 0, 15, 12, 0, 0));
    expect(out).not.toBe("—");
    expect(out).toContain("2026");
  });

  it("returns a dash for invalid input", () => {
    expect(formatTimestamp(0)).toBe("—");
    expect(formatTimestamp(-5)).toBe("—");
    expect(formatTimestamp(Number.NaN)).toBe("—");
  });
});

describe("formatDuration", () => {
  it("formats sub-millisecond, millisecond, and second values", () => {
    expect(formatDuration(0.2)).toBe("<1 ms");
    expect(formatDuration(12)).toBe("12 ms");
    expect(formatDuration(1500)).toBe("1.5 s");
  });

  it("returns a dash for invalid input", () => {
    expect(formatDuration(-1)).toBe("—");
    expect(formatDuration(Number.NaN)).toBe("—");
  });
});

describe("truncateHash", () => {
  it("keeps short values intact", () => {
    expect(truncateHash("abc123")).toBe("abc123");
  });

  it("elides the middle of long digests", () => {
    const hash = "a".repeat(64);
    const out = truncateHash(hash);
    expect(out).toContain("…");
    expect(out.startsWith("a".repeat(16))).toBe(true);
    expect(out.endsWith("a".repeat(8))).toBe(true);
    expect(out.length).toBeLessThan(hash.length);
  });
});
