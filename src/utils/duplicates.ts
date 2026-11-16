/**
 * Duplicate detection: group files whose content hashes are identical.
 */
import type { DuplicateGroup } from "../types";

/** Minimal per-file input needed to detect duplicates. */
export interface DuplicateCandidate {
  id: string;
  name: string;
  sizeBytes: number;
  /** Hex digest used as the grouping key (SHA-256 recommended). */
  hash: string | null;
}

/**
 * Group candidates that share a non-null hash. Groups always contain at
 * least two files; singletons are omitted.
 *
 * Matching cryptographic hashes are strong evidence of identical content,
 * but (as with any hash-based comparison) they are not a mathematical proof
 * against collisions — see the disclaimer shown in the UI.
 *
 * Results are ordered by descending group size, then by first appearance.
 */
export function groupDuplicates(
  candidates: readonly DuplicateCandidate[],
): DuplicateGroup[] {
  const byHash = new Map<string, DuplicateCandidate[]>();

  for (const candidate of candidates) {
    if (!candidate.hash) {
      continue; // Files without a computed hash cannot be grouped.
    }
    const key = candidate.hash.toLowerCase();
    const bucket = byHash.get(key);
    if (bucket) {
      bucket.push(candidate);
    } else {
      byHash.set(key, [candidate]);
    }
  }

  const groups: DuplicateGroup[] = [];
  for (const [hash, files] of byHash) {
    if (files.length < 2) {
      continue;
    }
    const size = files[0].sizeBytes;
    groups.push({
      hash,
      files: files.map((f) => ({
        id: f.id,
        name: f.name,
        sizeBytes: f.sizeBytes,
      })),
      // Size of the redundant copies that could be reclaimed.
      wastedBytes: size * (files.length - 1),
    });
  }

  groups.sort((a, b) => {
    if (b.files.length !== a.files.length) {
      return b.files.length - a.files.length;
    }
    return b.wastedBytes - a.wastedBytes;
  });

  return groups;
}

/** Total redundant bytes across all duplicate groups. */
export function totalWastedBytes(groups: readonly DuplicateGroup[]): number {
  return groups.reduce((sum, g) => sum + g.wastedBytes, 0);
}
