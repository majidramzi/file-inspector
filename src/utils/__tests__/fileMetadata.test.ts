import { describe, expect, it } from "vitest";
import {
  checkConsistency,
  detectSignature,
  getExtension,
  inspectFile,
} from "../fileMetadata";

const PNG_MAGIC = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);
const JPEG_MAGIC = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
const PDF_MAGIC = new TextEncoder().encode("%PDF-1.7\n%EOF");
const ZIP_MAGIC = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);

describe("getExtension", () => {
  it("extracts lower-cased extensions", () => {
    expect(getExtension("photo.PNG")).toBe(".png");
    expect(getExtension("archive.tar.gz")).toBe(".gz");
    expect(getExtension("report.final.pdf")).toBe(".pdf");
  });

  it("returns an empty string when there is no extension", () => {
    expect(getExtension("README")).toBe("");
    expect(getExtension("")).toBe("");
  });

  it("treats dotfiles as extension-less", () => {
    expect(getExtension(".gitignore")).toBe("");
  });

  it("strips directory components", () => {
    expect(getExtension("folder/sub/data.csv")).toBe(".csv");
  });
});

describe("detectSignature", () => {
  it("identifies PNG files", () => {
    const sig = detectSignature(PNG_MAGIC);
    expect(sig).not.toBeNull();
    expect(sig!.name).toBe("PNG image");
    expect(sig!.extension).toBe(".png");
    expect(sig!.bytes).toContain("89 50 4e 47");
  });

  it("identifies JPEG files", () => {
    const sig = detectSignature(JPEG_MAGIC);
    expect(sig!.name).toBe("JPEG image");
    expect(sig!.extension).toBe(".jpg");
  });

  it("identifies PDF files", () => {
    const sig = detectSignature(PDF_MAGIC);
    expect(sig!.name).toBe("PDF document");
    expect(sig!.extension).toBe(".pdf");
  });

  it("identifies ZIP containers", () => {
    const sig = detectSignature(ZIP_MAGIC);
    expect(sig!.name).toBe("ZIP archive / OOXML / JAR");
  });

  it("returns null for plain text (no magic number)", () => {
    const text = new TextEncoder().encode("Just some ordinary text.\n");
    expect(detectSignature(text)).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(detectSignature(new Uint8Array(0))).toBeNull();
  });
});

describe("checkConsistency", () => {
  it("flags a matching signature and extension as consistent", () => {
    const sig = detectSignature(PNG_MAGIC)!;
    const { status } = checkConsistency(".png", "image/png", sig);
    expect(status).toBe("consistent");
  });

  it("flags a PNG disguised with a .txt extension as inconsistent", () => {
    const sig = detectSignature(PNG_MAGIC)!;
    const { status, notes } = checkConsistency(".txt", "text/plain", sig);
    expect(status).toBe("inconsistent");
    expect(notes.join(" ")).toMatch(/does not match/i);
    // Must explicitly avoid claiming safety.
    expect(notes.join(" ")).toMatch(/not a security verdict/i);
  });

  it("flags an executable extension on non-executable content as inconsistent", () => {
    const sig = detectSignature(PNG_MAGIC)!;
    const { status, notes } = checkConsistency(".exe", "application/octet-stream", sig);
    expect(status).toBe("inconsistent");
    expect(notes.join(" ")).toMatch(/extra caution/i);
  });

  it("reports unknown when there is no signature and no MIME type", () => {
    const { status, notes } = checkConsistency(".dat", "", null);
    expect(status).toBe("unknown");
    expect(notes.join(" ")).toMatch(/could not be determined/i);
  });

  it("accepts a matching MIME type when no signature exists", () => {
    const { status } = checkConsistency(".json", "application/json", null);
    expect(status).toBe("consistent");
  });

  it("flags a MIME/extension mismatch", () => {
    const { status } = checkConsistency(".pdf", "image/png", null);
    expect(status).toBe("inconsistent");
  });

  it("returns no-extension for files without a suffix", () => {
    const { status } = checkConsistency("", "", null);
    expect(status).toBe("no-extension");
  });

  it("never describes an inconsistent file as safe", () => {
    const sig = detectSignature(JPEG_MAGIC)!;
    const { status, notes } = checkConsistency(".exe", "", sig);
    expect(status).toBe("inconsistent");
    expect(notes.join(" ")).not.toMatch(/\bsafe\b(?!.*not)/i);
  });
});

describe("inspectFile", () => {
  it("inspects a PNG file end to end", async () => {
    const file = new File([PNG_MAGIC], "picture.png", {
      type: "image/png",
      lastModified: 1_700_000_000_000,
    });
    const meta = await inspectFile(file);
    expect(meta.name).toBe("picture.png");
    expect(meta.extension).toBe(".png");
    expect(meta.mimeType).toBe("image/png");
    expect(meta.sizeBytes).toBe(PNG_MAGIC.length);
    expect(meta.lastModified).toBe(1_700_000_000_000);
    expect(meta.signature?.name).toBe("PNG image");
    expect(meta.consistency).toBe("consistent");
    expect(meta.consistencyNotes.length).toBeGreaterThan(0);
  });

  it("flags extension/content mismatch during inspection", async () => {
    const file = new File([PNG_MAGIC], "malware.txt", { type: "text/plain" });
    const meta = await inspectFile(file);
    expect(meta.signature?.name).toBe("PNG image");
    expect(meta.consistency).toBe("inconsistent");
  });

  it("handles an empty file without throwing", async () => {
    const file = new File([], "empty.dat", { type: "" });
    const meta = await inspectFile(file);
    expect(meta.sizeBytes).toBe(0);
    expect(meta.signature).toBeNull();
    expect(["unknown", "no-extension"]).toContain(meta.consistency);
  });

  it("handles a file with no MIME type and no signature", async () => {
    const file = new File(["plain words"], "notes.txt", { type: "" });
    const meta = await inspectFile(file);
    expect(meta.mimeType).toBe("");
    expect(meta.signature).toBeNull();
    // text/plain has no magic number, and no MIME was reported → unknown
    expect(meta.consistency).toBe("unknown");
    expect(meta.consistencyNotes.join(" ")).toMatch(/could not be determined/i);
  });
});
