/**
 * File metadata utilities: extension parsing, file-signature (magic byte)
 * detection, and extension-vs-content consistency checks.
 *
 * Everything here is pure and synchronous (except `inspectFile`, which reads
 * the first bytes of a Blob). Nothing leaves the browser.
 */
import type {
  ConsistencyStatus,
  FileMetadata,
  FileSignature,
} from "../types";

/** How many leading bytes to read for signature detection. */
export const SIGNATURE_PROBE_BYTES = 512;

/**
 * Extract the lower-cased extension (with leading dot) from a file name.
 * Returns "" when there is no extension.
 *
 * Dotfiles like ".gitignore" are treated as having no extension (the whole
 * name is the base name), matching common OS conventions.
 */
export function getExtension(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "";
  if (!base.includes(".")) {
    return "";
  }
  const dotIndex = base.lastIndexOf(".");
  if (dotIndex <= 0) {
    // Leading-dot name with nothing after (".") or pure dotfile — no extension.
    return "";
  }
  return base.slice(dotIndex).toLowerCase();
}

/** Extension → canonical MIME type mapping used for consistency checks. */
const EXTENSION_MIME: Record<string, string> = {
  ".txt": "text/plain",
  ".html": "text/html",
  ".htm": "text/html",
  ".css": "text/css",
  ".csv": "text/csv",
  ".md": "text/markdown",
  ".xml": "application/xml",
  ".json": "application/json",
  ".pdf": "application/pdf",
  ".zip": "application/zip",
  ".gz": "application/gzip",
  ".tar": "application/x-tar",
  ".7z": "application/x-7z-compressed",
  ".rar": "application/vnd.rar",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".avif": "image/avif",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
  ".m4a": "audio/mp4",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".avi": "video/x-msvideo",
  ".mkv": "video/x-matroska",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".ts": "text/plain",
  ".tsx": "text/plain",
  ".jsx": "text/plain",
  ".py": "text/x-python",
  ".java": "text/x-java-source",
  ".c": "text/x-c",
  ".cpp": "text/x-c++",
  ".rs": "text/x-rust",
  ".go": "text/x-go",
  ".sh": "application/x-sh",
  ".exe": "application/vnd.microsoft.portable-executable",
  ".dll": "application/vnd.microsoft.portable-executable",
  ".wasm": "application/wasm",
};

/**
 * Structural MIME families that a browser-reported MIME type may belong to.
 * Used when the exact MIME string differs from our table but the family
 * still agrees with the extension.
 */
const MIME_FAMILIES: Record<string, string[]> = {
  "text/": ["text"],
  "image/": ["image"],
  "audio/": ["audio"],
  "video/": ["video"],
  "font/": ["font", "application"],
  "application/": ["application", "font"],
};

interface SignatureRule {
  name: string;
  extension: string;
  offset: number;
  /** Expected bytes at `offset`. */
  bytes: number[];
  /** Alternative byte patterns (OR'd with the primary at the same offset). */
  alternatives?: number[][];
}

/**
 * Well-known magic-number signatures. RIFF containers (WEBP/WAV/AVI) are
 * handled separately because they need a secondary fourcc check at offset 8.
 */
const SIGNATURE_RULES: SignatureRule[] = [
  { name: "PNG image", extension: ".png", offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { name: "JPEG image", extension: ".jpg", offset: 0, bytes: [0xff, 0xd8, 0xff] },
  { name: "GIF image", extension: ".gif", offset: 0, bytes: [0x47, 0x49, 0x46, 0x38] },
  { name: "BMP image", extension: ".bmp", offset: 0, bytes: [0x42, 0x4d] },
  { name: "PDF document", extension: ".pdf", offset: 0, bytes: [0x25, 0x50, 0x44, 0x46] },
  { name: "GZIP archive", extension: ".gz", offset: 0, bytes: [0x1f, 0x8b] },
  { name: "ZIP archive / OOXML / JAR", extension: ".zip", offset: 0, bytes: [0x50, 0x4b, 0x03, 0x04], alternatives: [[0x50, 0x4b, 0x05, 0x06], [0x50, 0x4b, 0x07, 0x08]] },
  { name: "7-Zip archive", extension: ".7z", offset: 0, bytes: [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c] },
  { name: "RAR archive", extension: ".rar", offset: 0, bytes: [0x52, 0x61, 0x72, 0x21] },
  { name: "ELF executable", extension: ".elf", offset: 0, bytes: [0x7f, 0x45, 0x4c, 0x46] },
  { name: "Windows PE executable", extension: ".exe", offset: 0, bytes: [0x4d, 0x5a] },
  { name: "WASM module", extension: ".wasm", offset: 0, bytes: [0x00, 0x61, 0x73, 0x6d] },
  { name: "SQLite database", extension: ".sqlite", offset: 0, bytes: [0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20, 0x66, 0x6f, 0x72, 0x6d, 0x61, 0x74, 0x20, 0x33, 0x00] },
  { name: "MP3 audio (ID3)", extension: ".mp3", offset: 0, bytes: [0x49, 0x44, 0x33] },
  { name: "MP4 / M4A container", extension: ".mp4", offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] },
  { name: "FLAC audio", extension: ".flac", offset: 0, bytes: [0x66, 0x4c, 0x61, 0x43] },
  { name: "OGG media", extension: ".ogg", offset: 0, bytes: [0x4f, 0x67, 0x67, 0x53] },
  { name: "TIFF image", extension: ".tiff", offset: 0, bytes: [0x49, 0x49, 0x2a, 0x00], alternatives: [[0x4d, 0x4d, 0x00, 0x2a]] },
  { name: "ISO 9660 (CD image)", extension: ".iso", offset: 0x8001, bytes: [0x43, 0x44, 0x30, 0x30, 0x31] },
];

function bytesAt(data: Uint8Array, offset: number, length: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < length; i++) {
    out.push(data[offset + i]);
  }
  return out;
}

function matches(data: Uint8Array, offset: number, expected: number[]): boolean {
  if (offset + expected.length > data.length) {
    return false;
  }
  for (let i = 0; i < expected.length; i++) {
    if (data[offset + i] !== expected[i]) {
      return false;
    }
  }
  return true;
}

function toHex(bytes: number[]): string {
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join(" ");
}

/**
 * Detect a file signature from the leading bytes of a file.
 * Returns null when no known signature matches (not an error — many valid
 * formats, e.g. plain text, have no magic number).
 */
export function detectSignature(data: Uint8Array): FileSignature | null {
  if (data.length === 0) {
    return null;
  }

  // RIFF containers need a secondary fourcc check at offset 8.
  if (matches(data, 0, [0x52, 0x49, 0x46, 0x46]) && data.length >= 12) {
    const fourcc = String.fromCharCode(data[8], data[9], data[10], data[11]);
    if (fourcc === "WEBP") {
      return { name: "WEBP image", extension: ".webp", offset: 0, bytes: toHex(bytesAt(data, 0, 12)) };
    }
    if (fourcc === "WAVE") {
      return { name: "WAV audio", extension: ".wav", offset: 0, bytes: toHex(bytesAt(data, 0, 12)) };
    }
    if (fourcc === "AVI ") {
      return { name: "AVI video", extension: ".avi", offset: 0, bytes: toHex(bytesAt(data, 0, 12)) };
    }
  }

  for (const rule of SIGNATURE_RULES) {
    if (matches(data, rule.offset, rule.bytes)) {
      return {
        name: rule.name,
        extension: rule.extension,
        offset: rule.offset,
        bytes: toHex(bytesAt(data, rule.offset, rule.bytes.length)),
      };
    }
    for (const alt of rule.alternatives ?? []) {
      if (matches(data, rule.offset, alt)) {
        return {
          name: rule.name,
          extension: rule.extension,
          offset: rule.offset,
          bytes: toHex(bytesAt(data, rule.offset, alt.length)),
        };
      }
    }
  }

  // SVG is XML text; look for the tag near the start.
  const head = new TextDecoder("utf-8", { fatal: false })
    .decode(data.subarray(0, Math.min(data.length, 256)))
    .trimStart()
    .toLowerCase();
  if (head.startsWith("<?xml") || head.startsWith("<svg")) {
    if (head.includes("<svg")) {
      return { name: "SVG image", extension: ".svg", offset: 0, bytes: "<svg" };
    }
  }

  return null;
}

/**
 * Read the first bytes of a Blob and detect its signature.
 * Returns null for empty/unreadable blobs or when no signature matches.
 */
export async function readSignature(blob: Blob): Promise<FileSignature | null> {
  if (blob.size === 0) {
    return null;
  }
  try {
    const slice = blob.slice(0, SIGNATURE_PROBE_BYTES);
    const buffer = await slice.arrayBuffer();
    return detectSignature(new Uint8Array(buffer));
  } catch {
    return null;
  }
}

/** Extensions that are commonly mislabelled when used to disguise content. */
const DANGEROUS_IF_MISMATCHED = new Set([
  ".exe",
  ".dll",
  ".scr",
  ".bat",
  ".cmd",
  ".com",
  ".pif",
  ".msi",
  ".jar",
  ".js",
  ".vbs",
  ".ps1",
]);

/**
 * Decide whether a file's extension appears consistent with its MIME type
 * and/or detected signature. This is a *heuristic* check — it never proves a
 * file is safe, and an "consistent" verdict must not be presented as a
 * safety guarantee.
 */
export function checkConsistency(
  extension: string,
  mimeType: string,
  signature: FileSignature | null,
): { status: ConsistencyStatus; notes: string[] } {
  const notes: string[] = [];

  if (!extension) {
    if (signature) {
      notes.push(
        `No file extension, but the content looks like ${signature.name} (signature "${signature.bytes}").`,
      );
      return { status: "no-extension", notes };
    }
    notes.push("No file extension and no recognizable content signature.");
    return { status: "no-extension", notes };
  }

  const expectedMime = EXTENSION_MIME[extension];
  const mime = mimeType.toLowerCase().split(";")[0].trim();

  // 1) Signature vs extension — the strongest signal we have.
  if (signature) {
    const sigExt = signature.extension;

    const extMatchesSig =
      extension === sigExt ||
      (extension === ".jpeg" && sigExt === ".jpg") ||
      (extension === ".jpg" && sigExt === ".jpeg") ||
      (extension === ".tif" && sigExt === ".tiff") ||
      (extension === ".htm" && sigExt === ".html");

    if (extMatchesSig) {
      notes.push(`Content signature "${signature.bytes}" matches the ${extension} extension.`);
      // Also cross-check MIME if present.
      if (mime && expectedMime && !mimeFamiliesAgree(mime, expectedMime)) {
        notes.push(
          `MIME type "${mime}" does not match the usual type for ${extension} ("${expectedMime}").`,
        );
        return { status: "inconsistent", notes };
      }
      notes.push("Extension appears consistent with the detected content type.");
      return { status: "consistent", notes };
    }

    // Extension disagrees with the signature.
    const risky =
      DANGEROUS_IF_MISMATCHED.has(extension) || DANGEROUS_IF_MISMATCHED.has(sigExt);
    notes.push(
      `Content signature "${signature.bytes}" indicates ${signature.name} (${sigExt}), which does not match the ${extension} extension.`,
    );
    if (risky) {
      notes.push(
        "One of the extensions involved is associated with executable content — treat this file with extra caution.",
      );
    }
    notes.push("This mismatch is a strong warning sign, but it is not a security verdict.");
    return { status: "inconsistent", notes };
  }

  // 2) No signature: fall back to MIME vs extension.
  if (mime) {
    if (expectedMime) {
      if (mimeFamiliesAgree(mime, expectedMime)) {
        if (mime !== expectedMime) {
          notes.push(
            `MIME type "${mime}" is a close variant of the usual type for ${extension} ("${expectedMime}").`,
          );
        } else {
          notes.push(`Reported MIME type "${mime}" matches the ${extension} extension.`);
        }
        notes.push(
          "No content signature available; this verdict relies only on the browser-reported MIME type.",
        );
        return { status: "consistent", notes };
      }
      notes.push(
        `Reported MIME type "${mime}" does not match the usual type for ${extension} ("${expectedMime}").`,
      );
      notes.push(
        "MIME types are derived from the extension by most browsers, so a mismatch here is unusual but not proof of tampering.",
      );
      return { status: "inconsistent", notes };
    }
    notes.push(
      `No known MIME mapping for ${extension}; reported MIME type is "${mime}".`,
    );
    notes.push("Consistency could not be determined from available data.");
    return { status: "unknown", notes };
  }

  // 3) No signature and no MIME.
  notes.push(
    `No MIME type was reported and no content signature matched for ${extension}.`,
  );
  notes.push("Consistency could not be determined — this does not imply the file is safe or unsafe.");
  return { status: "unknown", notes };
}

function mimeFamiliesAgree(reported: string, expected: string): boolean {
  if (reported === expected) {
    return true;
  }
  const repFamily = reported.split("/")[0];
  const expFamily = expected.split("/")[0];
  if (repFamily === expFamily) {
    return true;
  }
  // e.g. font/woff2 vs application/font-woff, or text/javascript vs application/javascript
  const repAlt = MIME_FAMILIES[`${repFamily}/`];
  const expAlt = MIME_FAMILIES[`${expFamily}/`];
  if (repAlt?.includes(expFamily)) {
    return true;
  }
  if (expAlt?.includes(repFamily)) {
    return true;
  }
  // JS special case: browsers report text/javascript, older tables say application/javascript.
  if (
    (reported === "text/javascript" || reported === "application/javascript") &&
    (expected === "text/javascript" || expected === "application/javascript")
  ) {
    return true;
  }
  return false;
}

/**
 * Inspect a File/Blob: derive metadata (name, extension, MIME, size,
 * timestamps) plus signature and consistency verdict.
 */
export async function inspectFile(file: File): Promise<FileMetadata> {
  const extension = getExtension(file.name);
  const mimeType = file.type ?? "";
  const signature = await readSignature(file);
  const { status, notes } = checkConsistency(extension, mimeType, signature);

  return {
    name: file.name,
    extension,
    mimeType,
    sizeBytes: file.size,
    lastModified: file.lastModified,
    signature,
    consistency: status,
    consistencyNotes: notes,
  };
}
