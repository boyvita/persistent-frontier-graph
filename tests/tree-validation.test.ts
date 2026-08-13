import { describe, expect, it } from "vitest";
import { InvalidTreeError, indexTree, validateTree, type FrontierTree } from "../src";

interface Data { label: string }

function tree(nodes: FrontierTree<Data>["nodes"], rootId = "root"): FrontierTree<Data> {
  return { nodes, revision: "test", rootId };
}

describe("tree validation", () => {
  it("accepts one connected rooted tree", () => {
    const candidate = tree([
      { data: { label: "Root" }, id: "root", parentId: null },
      { data: { label: "Child" }, id: "child", parentId: "root" },
    ]);
    expect(validateTree(candidate)).toEqual([]);
    expect(indexTree(candidate).maximumDepth).toBe(1);
  });

  it.each([
    ["invalid_revision", { ...tree([
      { data: { label: "Root" }, id: "root", parentId: null },
    ]), revision: "" }],
    ["invalid_order", tree([
      { data: { label: "Root" }, id: "root", parentId: null },
      { data: { label: "Child" }, id: "child", order: Number.NaN, parentId: "root" },
    ])],
    ["duplicate_id", tree([
      { data: { label: "A" }, id: "root", parentId: null },
      { data: { label: "B" }, id: "root", parentId: null },
    ])],
    ["unknown_parent", tree([
      { data: { label: "Root" }, id: "root", parentId: null },
      { data: { label: "Lost" }, id: "lost", parentId: "missing" },
    ])],
    ["self_parent", tree([
      { data: { label: "Root" }, id: "root", parentId: null },
      { data: { label: "Loop" }, id: "loop", parentId: "loop" },
    ])],
    ["cycle", tree([
      { data: { label: "Root" }, id: "root", parentId: null },
      { data: { label: "A" }, id: "a", parentId: "b" },
      { data: { label: "B" }, id: "b", parentId: "a" },
    ])],
  ])("reports %s", (code, candidate) => {
    expect(validateTree(candidate).map((issue) => issue.code)).toContain(code);
    expect(() => indexTree(candidate)).toThrow(InvalidTreeError);
  });

  it("uses explicit sibling order before the stable ID fallback", () => {
    const indexed = indexTree(tree([
      { data: { label: "Root" }, id: "root", parentId: null },
      { data: { label: "Third" }, id: "a", order: 3, parentId: "root" },
      { data: { label: "First" }, id: "z", order: 1, parentId: "root" },
      { data: { label: "Second" }, id: "m", order: 2, parentId: "root" },
    ]));
    expect(indexed.childrenById.get("root")?.map((node) => node.id)).toEqual(["z", "m", "a"]);
  });
});
