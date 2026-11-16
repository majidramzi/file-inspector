import { afterEach, vi } from "vitest";

// jsdom does not implement crypto.subtle; wire up Node's Web Crypto so
// hashing tests exercise the same code path as browsers.
import { webcrypto } from "node:crypto";

if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, "crypto", {
    value: webcrypto,
    configurable: true,
  });
}

// jsdom's Blob implementation lacks Blob.prototype.arrayBuffer().
// Provide a FileReader-based polyfill so hashBlob/inspectFile work in tests.
if (typeof Blob !== "undefined" && typeof Blob.prototype.arrayBuffer !== "function") {
  Object.defineProperty(Blob.prototype, "arrayBuffer", {
    configurable: true,
    writable: true,
    value(this: Blob): Promise<ArrayBuffer> {
      return new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () =>
          reject(reader.error ?? new Error("Failed to read Blob"));
        reader.readAsArrayBuffer(this);
      });
    },
  });
}

// jsdom lacks URL.createObjectURL / revokeObjectURL used by report downloads.
if (typeof URL.createObjectURL !== "function") {
  URL.createObjectURL = vi.fn(() => "blob:mock");
}
if (typeof URL.revokeObjectURL !== "function") {
  URL.revokeObjectURL = vi.fn();
}

afterEach(() => {
  vi.restoreAllMocks();
});
