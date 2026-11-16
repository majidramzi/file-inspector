import { describe, expect, it } from "vitest";
import {
  hashBlob,
  hashBuffer,
  hashBlobAll,
  isValidHexDigest,
  isLegacyAlgorithm,
  isWebCryptoAlgorithm,
  WEB_CRYPTO_ALGORITHMS,
} from "../hashing";
import { HASH_ALGORITHMS } from "../../types";

// Well-known test vectors for the ASCII input "abc".
const ABC = new TextEncoder().encode("abc");
const VECTORS = {
  "SHA-256":
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  "SHA-384":
    "cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed8086072ba1e7cc2358baeca134c825a7",
  "SHA-512":
    "ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f",
  MD5: "900150983cd24fb0d6963f7d28e17f72",
} as const;

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

describe("hashBuffer", () => {
  it("produces the correct SHA-256 digest for 'abc'", async () => {
    const hex = await hashBuffer(toArrayBuffer(ABC), "SHA-256");
    expect(hex).toBe(VECTORS["SHA-256"]);
  });

  it("produces the correct SHA-384 digest for 'abc'", async () => {
    const hex = await hashBuffer(toArrayBuffer(ABC), "SHA-384");
    expect(hex).toBe(VECTORS["SHA-384"]);
  });

  it("produces the correct SHA-512 digest for 'abc'", async () => {
    const hex = await hashBuffer(toArrayBuffer(ABC), "SHA-512");
    expect(hex).toBe(VECTORS["SHA-512"]);
  });

  it("produces the correct MD5 digest for 'abc'", async () => {
    const hex = await hashBuffer(toArrayBuffer(ABC), "MD5");
    expect(hex).toBe(VECTORS.MD5);
  });

  it("produces the known SHA-256 digest of an empty input", async () => {
    const hex = await hashBuffer(new ArrayBuffer(0), "SHA-256");
    expect(hex).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("rejects an unsupported algorithm", async () => {
    await expect(
      hashBuffer(new ArrayBuffer(0), "CRC32" as never),
    ).rejects.toThrow(/Unsupported hash algorithm/);
  });
});

describe("hashBlob", () => {
  it("hashes a File with every supported algorithm", async () => {
    const file = new File([ABC], "abc.txt", { type: "text/plain" });
    for (const algorithm of HASH_ALGORITHMS) {
      const result = await hashBlob(file, algorithm);
      expect(result.algorithm).toBe(algorithm);
      expect(result.value).toBe(VECTORS[algorithm]);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(isValidHexDigest(result.value)).toBe(true);
    }
  });

  it("distinguishes files with different content", async () => {
    const a = new File(["hello"], "a.txt");
    const b = new File(["hellp"], "b.txt");
    const [ha, hb] = await Promise.all([
      hashBlob(a, "SHA-256"),
      hashBlob(b, "SHA-256"),
    ]);
    expect(ha.value).not.toBe(hb.value);
  });

  it("produces equal digests for equal content with different names", async () => {
    const a = new File(["same content"], "original.bin");
    const b = new File(["same content"], "copy-of-original.bin");
    const [ha, hb] = await Promise.all([
      hashBlob(a, "SHA-256"),
      hashBlob(b, "SHA-256"),
    ]);
    expect(ha.value).toBe(hb.value);
  });
});

describe("hashBlobAll", () => {
  it("returns results for the requested algorithms", async () => {
    const file = new File([ABC], "abc");
    const results = await hashBlobAll(file, ["SHA-256", "MD5"]);
    expect(results.map((r) => r.algorithm)).toEqual(["SHA-256", "MD5"]);
    expect(results[0].value).toBe(VECTORS["SHA-256"]);
    expect(results[1].value).toBe(VECTORS.MD5);
  });
});

describe("algorithm classification", () => {
  it("classifies SHA algorithms as Web Crypto", () => {
    for (const a of WEB_CRYPTO_ALGORITHMS) {
      expect(isWebCryptoAlgorithm(a)).toBe(true);
      expect(isLegacyAlgorithm(a)).toBe(false);
    }
  });

  it("classifies MD5 as legacy", () => {
    expect(isLegacyAlgorithm("MD5")).toBe(true);
    expect(isWebCryptoAlgorithm("MD5")).toBe(false);
  });
});

describe("unsupported file handling", () => {
  it("hashes an empty file rather than failing", async () => {
    const empty = new File([], "empty.bin");
    const result = await hashBlob(empty, "SHA-256");
    expect(result.value).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("throws a clear error for an unsupported algorithm", async () => {
    const file = new File(["x"], "x.bin");
    await expect(hashBlob(file, "SHA1" as never)).rejects.toThrow(
      /Unsupported hash algorithm/,
    );
  });
});
