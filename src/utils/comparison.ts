/**
 * File comparison utilities.
 *
 * Comparison never relies on file names — it compares size, cryptographic
 * hashes, and (when practical) bytes directly. The result carries a
 * human-readable account of which method produced the verdict.
 */
import type { ComparisonMethod, ComparisonResult } from "../types";
import { hashBlob } from "./hashing";

/**
 * Byte-for-byte comparison reads whole files into memory, so it is only
 * attempted when both files fit comfortably in a browser tab. Above this
 * combined size we fall back to hash comparison and say so.
 */
export const BYTE_COMPARE_LIMIT_BYTES = 256 * 1024 * 1024; // 256 MiB

/** Compare two byte arrays for equality. */
export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

function result(
  identical: boolean,
  method: ComparisonMethod,
  steps: string[],
): ComparisonResult {
  return { identical, method, steps };
}

/**
 * Compare two files by size, SHA-256 hash, and — when both are small
 * enough — byte-for-byte content.
 *
 * The steps array explains exactly which checks ran, so the UI can show
 * *how* the verdict was reached rather than just the verdict.
 */
export async function compareFiles(a: File, b: File): Promise<ComparisonResult> {
  const steps: string[] = [];

  steps.push(
    `Compared file sizes: ${a.name} is ${a.size.toLocaleString("en-US")} bytes; ${b.name} is ${b.size.toLocaleString("en-US")} bytes.`,
  );

  // 1) Size — cheapest possible discriminator.
  if (a.size !== b.size) {
    steps.push(
      "Sizes differ, so the contents cannot be identical. No further checks were needed.",
    );
    return result(false, "size-mismatch", steps);
  }
  steps.push("Sizes are equal; proceeding to hash comparison.");

  // 2) SHA-256 over each file.
  const [hashA, hashB] = await Promise.all([
    hashBlob(a, "SHA-256"),
    hashBlob(b, "SHA-256"),
  ]);
  steps.push(
    `Computed SHA-256 for both files (${hashA.durationMs.toFixed(1)} ms / ${hashB.durationMs.toFixed(1)} ms).`,
  );

  if (hashA.value !== hashB.value) {
    steps.push(
      `SHA-256 digests differ (${hashA.value.slice(0, 16)}… vs ${hashB.value.slice(0, 16)}…), so the contents are different.`,
    );
    steps.push(
      "Note: differing hashes are conclusive proof of different content; equal hashes are strong (but not mathematical) evidence of identical content.",
    );
    return result(false, "hash-mismatch", steps);
  }
  steps.push(
    `SHA-256 digests match (${hashA.value.slice(0, 24)}…). Hashing is strong evidence of identical content, but not a collision-proof mathematical proof — confirming with a byte-for-byte comparison.`,
  );

  // 3) Byte-for-byte confirmation where practical.
  if (a.size > BYTE_COMPARE_LIMIT_BYTES) {
    steps.push(
      `File size (${a.size.toLocaleString("en-US")} bytes) exceeds the byte-comparison limit of ${BYTE_COMPARE_LIMIT_BYTES.toLocaleString("en-US")} bytes, so the direct byte comparison was skipped to protect browser memory. The matching SHA-256 digests stand as the verdict.`,
    );
    return result(true, "hash-match", steps);
  }

  const [bufA, bufB] = await Promise.all([a.arrayBuffer(), b.arrayBuffer()]);
  const equal = bytesEqual(new Uint8Array(bufA), new Uint8Array(bufB));
  if (equal) {
    steps.push(
      "Byte-for-byte comparison of every byte confirmed the files are identical.",
    );
    return result(true, "byte-match", steps);
  }
  // Hash collision — practically impossible, but report honestly.
  steps.push(
    "Byte-for-byte comparison found differing bytes despite matching SHA-256 digests (an extraordinary event — a hash collision). Reporting the files as different based on the direct byte evidence.",
  );
  return result(false, "byte-mismatch", steps);
}

/** Short human label for a comparison method, for badges in the UI. */
export function methodLabel(method: ComparisonMethod): string {
  switch (method) {
    case "size-mismatch":
      return "Size mismatch";
    case "hash-mismatch":
      return "Hash mismatch";
    case "byte-mismatch":
      return "Byte mismatch";
    case "hash-match":
      return "SHA-256 match";
    case "byte-match":
      return "Byte-for-byte match";
  }
}
