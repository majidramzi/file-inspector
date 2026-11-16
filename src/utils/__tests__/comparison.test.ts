import { describe, expect, it } from "vitest";
import { bytesEqual, compareFiles, methodLabel } from "../comparison";

function makeFile(content: string | Uint8Array, name: string): File {
  return new File([content], name, { type: "application/octet-stream" });
}

describe("bytesEqual", () => {
  it("returns true for equal arrays", () => {
    expect(bytesEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(
      true,
    );
  });

  it("returns false for different content of the same length", () => {
    expect(bytesEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]))).toBe(
      false,
    );
  });

  it("returns false for different lengths", () => {
    expect(bytesEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2, 3]))).toBe(
      false,
    );
  });

  it("treats two empty arrays as equal", () => {
    expect(bytesEqual(new Uint8Array([]), new Uint8Array([]))).toBe(true);
  });
});

describe("compareFiles — same file content", () => {
  it("reports two identically-named files with equal content as identical", async () => {
    const a = makeFile("identical payload", "report.pdf");
    const b = makeFile("identical payload", "report.pdf");
    const result = await compareFiles(a, b);
    expect(result.identical).toBe(true);
    expect(result.method).toBe("byte-match");
    expect(result.steps.length).toBeGreaterThan(0);
    // The final step must cite the byte-for-byte confirmation.
    expect(result.steps.at(-1)).toMatch(/byte-for-byte/i);
  });

  it("reports identical content under different file names as identical", async () => {
    const a = makeFile("payload", "original.txt");
    const b = makeFile("payload", "renamed-copy.txt");
    const result = await compareFiles(a, b);
    expect(result.identical).toBe(true);
    // Names are never used as evidence — content checks ran.
    expect(result.steps.join(" ")).toMatch(/SHA-256/);
  });

  it("treats two empty files as identical", async () => {
    const result = await compareFiles(
      makeFile(new Uint8Array(0), "a"),
      makeFile(new Uint8Array(0), "b"),
    );
    expect(result.identical).toBe(true);
  });
});

describe("compareFiles — different file content", () => {
  it("detects different content of equal size via hashes", async () => {
    const a = makeFile("aaaa", "a.bin");
    const b = makeFile("aaab", "b.bin");
    const result = await compareFiles(a, b);
    expect(result.identical).toBe(false);
    expect(result.method).toBe("hash-mismatch");
    expect(result.steps.join(" ")).toMatch(/digests differ/i);
  });

  it("short-circuits on a size mismatch without hashing", async () => {
    const a = makeFile("tiny", "small.bin");
    const b = makeFile("definitely larger content", "big.bin");
    const result = await compareFiles(a, b);
    expect(result.identical).toBe(false);
    expect(result.method).toBe("size-mismatch");
    expect(result.steps.join(" ")).toMatch(/Sizes differ/);
    expect(result.steps.join(" ")).not.toMatch(/SHA-256 digest/);
  });

  it("explains the method used in every outcome", async () => {
    const cases = [
      [makeFile("x", "1"), makeFile("y", "2")],
      [makeFile("x", "1"), makeFile("xy", "2")],
      [makeFile("same", "1"), makeFile("same", "2")],
    ] as const;
    for (const [a, b] of cases) {
      const r = await compareFiles(a, b);
      expect(r.steps.length).toBeGreaterThanOrEqual(2);
      expect(typeof methodLabel(r.method)).toBe("string");
      expect(methodLabel(r.method).length).toBeGreaterThan(0);
    }
  });
});
