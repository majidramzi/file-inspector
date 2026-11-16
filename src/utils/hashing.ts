/**
 * Hashing utilities.
 *
 * SHA-256 / SHA-384 / SHA-512 are computed with the Web Crypto API
 * (`crypto.subtle.digest`). MD5 is computed with the maintained
 * `spark-md5` library and is offered only as a legacy checksum.
 *
 * IMPORTANT: `crypto.subtle.digest` is NOT streaming. The entire input must
 * be materialised as an ArrayBuffer, so peak memory use is roughly the file
 * size (plus hashing overhead). See `LARGE_FILE_WARNING_BYTES`.
 */
import SparkMD5 from "spark-md5";
import type { HashAlgorithm, HashResult, WebCryptoHashAlgorithm } from "../types";

/**
 * Files at or above this size trigger an explicit memory warning in the UI.
 * The native digest call buffers the whole file, so multi-gigabyte inputs
 * may fail or destabilise the tab.
 */
export const LARGE_FILE_WARNING_BYTES = 256 * 1024 * 1024; // 256 MiB

/** Algorithms computed through `crypto.subtle.digest`. */
export const WEB_CRYPTO_ALGORITHMS: readonly WebCryptoHashAlgorithm[] = [
  "SHA-256",
  "SHA-384",
  "SHA-512",
] as const;

/** True when the algorithm is provided by the Web Crypto API. */
export function isWebCryptoAlgorithm(algorithm: HashAlgorithm): boolean {
  return (WEB_CRYPTO_ALGORITHMS as readonly string[]).includes(algorithm);
}

/** True when MD5 is being requested (legacy, not for security use). */
export function isLegacyAlgorithm(algorithm: HashAlgorithm): boolean {
  return algorithm === "MD5";
}

/** Human-readable warning shown next to MD5 results. */
export const MD5_SECURITY_NOTICE =
  "MD5 is provided as a legacy checksum only. It is fast and widely supported, but it is cryptographically broken: collisions can be constructed deliberately. Do not use MD5 for security-sensitive integrity verification — use SHA-256 or stronger.";

/** Warning shown for large files before hashing. */
export const LARGE_FILE_NOTICE =
  "Large file: the Web Crypto digest operation buffers the entire file in memory before hashing. It is not a streaming operation, so peak memory usage grows with file size. Very large files may fail to hash depending on available browser memory.";

function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

async function digestSha(
  data: ArrayBuffer,
  algorithm: WebCryptoHashAlgorithm,
): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error(
      "Web Crypto API is unavailable. A secure context (HTTPS or localhost) is required.",
    );
  }
  // Pass a Uint8Array view: it is a zero-copy BufferSource that every
  // implementation accepts, and it sidesteps cross-realm ArrayBuffer
  // instanceof checks (which matter in the jsdom test environment).
  const bytes = new Uint8Array(data);
  const buf = await globalThis.crypto.subtle.digest(algorithm, bytes);
  return toHex(buf);
}

function digestMd5(data: ArrayBuffer): string {
  // spark-md5's second argument is `raw` (binary string output).
  // The default (false/omitted) returns the conventional hex digest.
  return SparkMD5.ArrayBuffer.hash(data);
}

/**
 * Compute a checksum over an in-memory ArrayBuffer.
 *
 * @throws when the algorithm is unknown or the platform lacks Web Crypto.
 */
export async function hashBuffer(
  data: ArrayBuffer,
  algorithm: HashAlgorithm,
): Promise<string> {
  if (algorithm === "MD5") {
    return digestMd5(data);
  }
  if (isWebCryptoAlgorithm(algorithm)) {
    return digestSha(data, algorithm);
  }
  throw new Error(`Unsupported hash algorithm: ${algorithm}`);
}

/**
 * Compute a checksum for a Blob/File.
 *
 * The blob is fully read into memory (`blob.arrayBuffer()`) — this mirrors
 * the limitation of `crypto.subtle.digest` and is not streaming hashing.
 * Callers should surface `LARGE_FILE_NOTICE` for big inputs.
 *
 * @throws when the algorithm is unsupported or reading the blob fails.
 */
export async function hashBlob(
  blob: Blob,
  algorithm: HashAlgorithm,
): Promise<HashResult> {
  const started = performance.now();
  const buffer = await blob.arrayBuffer();
  const value = await hashBuffer(buffer, algorithm);
  const durationMs = performance.now() - started;
  return { algorithm, value, durationMs };
}

/**
 * Compute all supported checksums for a Blob concurrently.
 * Results are returned in `HASH_ALGORITHMS` display order.
 */
export async function hashBlobAll(
  blob: Blob,
  algorithms: readonly HashAlgorithm[],
): Promise<HashResult[]> {
  return Promise.all(algorithms.map((a) => hashBlob(blob, a)));
}

/** Verify a hex digest is well-formed (lower-case hex, 32–128 chars). */
export function isValidHexDigest(value: string): boolean {
  return /^[0-9a-f]{32,128}$/.test(value);
}
