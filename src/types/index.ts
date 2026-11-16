/**
 * Shared types for File Inspector.
 */

/** Checksum algorithms supported by the application. */
export type HashAlgorithm = "SHA-256" | "SHA-384" | "SHA-512" | "MD5";

/** All algorithms offered by the UI, in display order. */
export const HASH_ALGORITHMS: readonly HashAlgorithm[] = [
  "SHA-256",
  "SHA-384",
  "SHA-512",
  "MD5",
] as const;

/** Web Crypto API algorithm names for the SHA family. */
export type WebCryptoHashAlgorithm = Exclude<HashAlgorithm, "MD5">;

/** Whether the file extension agrees with the detected content type. */
export type ConsistencyStatus =
  | "consistent"
  | "inconsistent"
  | "unknown"
  | "no-extension";

/** A detected file signature (magic bytes) match. */
export interface FileSignature {
  /** Human-readable format name, e.g. "PNG image". */
  name: string;
  /** Canonical extension for the detected format, e.g. ".png". */
  extension: string;
  /** Byte offset of the signature (always 0 for the signatures we match). */
  offset: number;
  /** Hex representation of the matched bytes, for display. */
  bytes: string;
}

/** Result of inspecting a single file's metadata. */
export interface FileMetadata {
  /** File name including extension. */
  name: string;
  /** Lower-cased extension including the leading dot, or "" if none. */
  extension: string;
  /** MIME type reported by the browser (may be "" when unknown). */
  mimeType: string;
  /** Size in bytes. */
  sizeBytes: number;
  /** Last modified time in milliseconds since the epoch. */
  lastModified: number;
  /** File signature detected from magic bytes, if any. */
  signature: FileSignature | null;
  /** Whether the extension appears consistent with the detected type. */
  consistency: ConsistencyStatus;
  /**
   * Human-readable notes explaining the consistency verdict, e.g. why a
   * mismatch was flagged or why the verdict is unknown.
   */
  consistencyNotes: string[];
}

/** A computed checksum for a file. */
export interface HashResult {
  algorithm: HashAlgorithm;
  /** Lower-case hex digest. */
  value: string;
  /** Wall-clock duration of the computation in milliseconds. */
  durationMs: number;
}

/** A file queued in the application, with metadata and computed hashes. */
export interface QueuedFile {
  /** Stable id for React keys and UI references. */
  id: string;
  /** The original File/Blob reference. Cleared when the user removes it. */
  file: File;
  metadata: FileMetadata;
  /** Computed hashes keyed by algorithm. */
  hashes: Partial<Record<HashAlgorithm, HashResult>>;
  /** Hashes currently being computed. */
  pending: HashAlgorithm[];
  /** Error message from a failed hash computation, if any. */
  error: string | null;
}

/** Method used to decide whether two files are identical. */
export type ComparisonMethod =
  | "size-mismatch"
  | "hash-mismatch"
  | "byte-mismatch"
  | "hash-match"
  | "byte-match";

/** Outcome of comparing two files. */
export interface ComparisonResult {
  identical: boolean;
  method: ComparisonMethod;
  /** Ordered, human-readable explanation of the steps performed. */
  steps: string[];
}

/** A group of files whose content hashes match. */
export interface DuplicateGroup {
  /** The matching SHA-256 hash (hex). */
  hash: string;
  /** Files in this group (always 2+ entries). */
  files: Array<{
    id: string;
    name: string;
    sizeBytes: number;
  }>;
  /** Total wasted bytes (size × (count − 1)). */
  wastedBytes: number;
}

/** Privacy notice text shown in the UI. */
export const PRIVACY_NOTICE =
  "All processing happens locally in your browser. Files are never uploaded, never sent to external APIs, and are not executed or rendered.";
