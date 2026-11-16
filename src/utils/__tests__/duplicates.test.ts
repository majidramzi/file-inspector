import { describe, expect, it } from "vitest";
import { groupDuplicates, totalWastedBytes, type DuplicateCandidate } from "../duplicates";

function candidate(
  id: string,
  name: string,
  sizeBytes: number,
  hash: string | null,
): DuplicateCandidate {
  return { id, name, sizeBytes, hash };
}

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

describe("groupDuplicates", () => {
  it("returns an empty list when there are no candidates", () => {
    expect(groupDuplicates([])).toEqual([]);
  });

  it("returns no groups when every hash is unique", () => {
    const groups = groupDuplicates([
      candidate("1", "a.bin", 10, HASH_A),
      candidate("2", "b.bin", 20, HASH_B),
    ]);
    expect(groups).toEqual([]);
  });

  it("groups files that share a hash", () => {
    const groups = groupDuplicates([
      candidate("1", "photo.jpg", 1000, HASH_A),
      candidate("2", "photo-copy.jpg", 1000, HASH_A),
      candidate("3", "other.png", 500, HASH_B),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].hash).toBe(HASH_A);
    expect(groups[0].files.map((f) => f.name)).toEqual([
      "photo.jpg",
      "photo-copy.jpg",
    ]);
    expect(groups[0].wastedBytes).toBe(1000); // one redundant copy
  });

  it("groups three-way duplicates and counts wasted bytes correctly", () => {
    const groups = groupDuplicates([
      candidate("1", "a", 4096, HASH_A),
      candidate("2", "b", 4096, HASH_A),
      candidate("3", "c", 4096, HASH_A),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].files).toHaveLength(3);
    expect(groups[0].wastedBytes).toBe(4096 * 2);
  });

  it("ignores candidates whose hash is not yet computed", () => {
    const groups = groupDuplicates([
      candidate("1", "a", 10, null),
      candidate("2", "b", 10, null),
      candidate("3", "c", 10, HASH_A),
    ]);
    expect(groups).toEqual([]);
  });

  it("is case-insensitive about hash casing", () => {
    const groups = groupDuplicates([
      candidate("1", "a", 5, HASH_A.toUpperCase()),
      candidate("2", "b", 5, HASH_A),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].files).toHaveLength(2);
  });

  it("orders larger groups first", () => {
    const groups = groupDuplicates([
      candidate("1", "a", 10, HASH_A),
      candidate("2", "b", 10, HASH_A),
      candidate("3", "c", 10, HASH_B),
      candidate("4", "d", 10, HASH_B),
      candidate("5", "e", 10, HASH_B),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].files).toHaveLength(3);
    expect(groups[1].files).toHaveLength(2);
  });

  it("keeps groups with identical names distinguishable by id", () => {
    const groups = groupDuplicates([
      candidate("1", "same.txt", 4, HASH_A),
      candidate("2", "same.txt", 4, HASH_A),
    ]);
    expect(groups).toHaveLength(1);
    expect(new Set(groups[0].files.map((f) => f.id)).size).toBe(2);
  });
});

describe("totalWastedBytes", () => {
  it("sums waste across groups", () => {
    const groups = groupDuplicates([
      candidate("1", "a", 100, HASH_A),
      candidate("2", "b", 100, HASH_A),
      candidate("3", "c", 50, HASH_B),
      candidate("4", "d", 50, HASH_B),
      candidate("5", "e", 50, HASH_B),
    ]);
    // 100 × 1 + 50 × 2 = 200
    expect(totalWastedBytes(groups)).toBe(200);
  });

  it("returns 0 for no groups", () => {
    expect(totalWastedBytes([])).toBe(0);
  });
});
