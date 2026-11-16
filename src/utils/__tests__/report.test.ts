import { describe, expect, it } from "vitest";
import {
  buildComparisonReport,
  buildFilesReport,
  reportTimestamp,
} from "../report";
import type { ComparisonResult, QueuedFile } from "../../types";

function makeQueued(name: string, content: string): QueuedFile {
  const file = new File([content], name, { type: "text/plain" });
  return {
    id: `id-${name}`,
    file,
    metadata: {
      name,
      extension: name.includes(".") ? `.${name.split(".").pop()}` : "",
      mimeType: "text/plain",
      sizeBytes: file.size,
      lastModified: 1_700_000_000_000,
      signature: null,
      consistency: "consistent",
      consistencyNotes: ["Reported MIME type matches the extension."],
    },
    hashes: {
      "SHA-256": {
        algorithm: "SHA-256",
        value: "ab".repeat(32),
        durationMs: 3.2,
      },
    },
    pending: [],
    error: null,
  };
}

describe("buildFilesReport", () => {
  it("includes file metadata and checksums", () => {
    const report = buildFilesReport([makeQueued("notes.txt", "hello")]);
    expect(report).toContain("FILE INSPECTOR — FILE REPORT");
    expect(report).toContain("notes.txt");
    expect(report).toContain("SHA-256:");
    expect(report).toContain("ab".repeat(32));
    expect(report).toContain("computed locally");
  });

  it("lists multiple files", () => {
    const report = buildFilesReport([
      makeQueued("a.txt", "a"),
      makeQueued("b.txt", "b"),
    ]);
    expect(report).toContain("[1] a.txt");
    expect(report).toContain("[2] b.txt");
  });

  it("includes the MD5 security notice", () => {
    const report = buildFilesReport([makeQueued("a.txt", "a")]);
    expect(report).toMatch(/MD5.*broken/i);
  });
});

describe("buildComparisonReport", () => {
  it("records the verdict and every step", () => {
    const a = new File(["same"], "a.txt");
    const b = new File(["same"], "b.txt");
    const result: ComparisonResult = {
      identical: true,
      method: "byte-match",
      steps: ["Compared file sizes.", "Computed SHA-256.", "Bytes matched."],
    };
    const report = buildComparisonReport(a, b, result);
    expect(report).toContain("IDENTICAL");
    expect(report).toContain("a.txt");
    expect(report).toContain("b.txt");
    expect(report).toContain("1. Compared file sizes.");
    expect(report).toMatch(/never by file name alone/i);
  });

  it("records a DIFFERENT verdict", () => {
    const result: ComparisonResult = {
      identical: false,
      method: "size-mismatch",
      steps: ["Sizes differ."],
    };
    const report = buildComparisonReport(
      new File(["x"], "a"),
      new File(["xy"], "b"),
      result,
    );
    expect(report).toContain("DIFFERENT");
  });
});

describe("reportTimestamp", () => {
  it("produces a sortable YYYY-MM-DD-HHMMSS fragment", () => {
    expect(reportTimestamp()).toMatch(
      /^\d{4}-\d{2}-\d{2}-\d{6}$/,
    );
  });
});
