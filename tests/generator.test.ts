import { describe, expect, it } from "vitest";
import { generateTree, indexTree, treeCapacity, type GenerateTreeOptions } from "../src";

const BASE: GenerateTreeOptions = {
  breadthDepthBias: 0.5,
  maxBranches: 5,
  maxDepth: 7,
  nodeCount: 160,
  seed: "test-seed",
  uniform: true,
};

function successful(options: GenerateTreeOptions) {
  const result = generateTree(options);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.message);
  return result.tree;
}

describe("tree generator", () => {
  it("creates exactly the requested valid tree within every structural limit", () => {
    for (const nodeCount of [1, 2, 17, 160, 1000]) {
      const tree = successful({
        ...BASE,
        maxBranches: nodeCount === 1000 ? 8 : 5,
        maxDepth: nodeCount === 1000 ? 8 : 7,
        nodeCount,
      });
      const index = indexTree(tree);
      expect(tree.nodes).toHaveLength(nodeCount);
      expect(new Set(tree.nodes.map((node) => node.id)).size).toBe(nodeCount);
      expect(index.maximumDepth).toBeLessThanOrEqual(nodeCount === 1000 ? 8 : 7);
      for (const children of index.childrenById.values()) expect(children.length).toBeLessThanOrEqual(nodeCount === 1000 ? 8 : 5);
    }
  });

  it("replays the same random tree byte-for-byte from the same seed", () => {
    const options = { ...BASE, uniform: false };
    const first = successful(options);
    const second = successful(options);
    const different = successful({ ...options, seed: "another-seed" });
    expect(second).toEqual(first);
    expect(different.nodes.map((node) => node.parentId)).not.toEqual(first.nodes.map((node) => node.parentId));
  });

  it("uses zero to grow wide and one to grow deep while balancing subtrees", () => {
    const wide = indexTree(successful({ ...BASE, breadthDepthBias: 0, nodeCount: 90 }));
    const deep = indexTree(successful({ ...BASE, breadthDepthBias: 1, nodeCount: 90 }));
    const meanDepth = (depths: ReadonlyMap<string, number>) => (
      [...depths.values()].reduce((sum, depth) => sum + depth, 0) / depths.size
    );
    expect(meanDepth(deep.depthById)).toBeGreaterThan(meanDepth(wide.depthById));
    expect(deep.maximumDepth).toBeGreaterThan(wide.maximumDepth);

    const rootBranches = deep.childrenById.get(deep.orderedIds[0] ?? "") ?? [];
    const branchSizes = rootBranches.map((branch) => {
      let count = 0;
      for (const id of deep.orderedIds) {
        let current: string | null | undefined = id;
        while (current !== null && current !== undefined && current !== branch.id) current = deep.parentById.get(current);
        if (current === branch.id) count += 1;
      }
      return count;
    });
    expect(Math.max(...branchSizes) - Math.min(...branchSizes)).toBeLessThanOrEqual(1);
  });

  it("reports impossible and malformed configurations without weakening limits", () => {
    expect(treeCapacity(2, 3)).toBe(15);
    const impossible = generateTree({ ...BASE, maxBranches: 2, maxDepth: 3, nodeCount: 16 });
    expect(impossible).toEqual({
      error: {
        code: "capacity_exceeded",
        message: "This shape can contain at most 15 nodes. Increase branches or depth.",
      },
      ok: false,
    });
    const invalid = generateTree({ ...BASE, breadthDepthBias: 1.1 });
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.error.code).toBe("invalid_option");
  });

  it("covers representative property combinations", () => {
    for (const uniform of [true, false]) {
      for (const bias of [0, 0.25, 0.5, 0.75, 1]) {
        for (const maxBranches of [1, 2, 4, 8]) {
          const maxDepth = maxBranches === 1 ? 12 : 6;
          const capacity = treeCapacity(maxBranches, maxDepth);
          const nodeCount = Math.min(capacity, 73);
          const tree = successful({
            breadthDepthBias: bias,
            maxBranches,
            maxDepth,
            nodeCount,
            seed: `${uniform}:${bias}:${maxBranches}`,
            uniform,
          });
          const index = indexTree(tree);
          expect(index.maximumDepth).toBeLessThanOrEqual(maxDepth);
          expect(tree.nodes).toHaveLength(nodeCount);
        }
      }
    }
  });
});
