import { describe, expect, it } from "vitest";
import { generateTree, indexTree } from "../src";
import { createAcademicCurriculumData } from "../demo/academicCurriculum";

describe("academic curriculum demo data", () => {
  it("turns generated topology into a recognizable prerequisite map", () => {
    const result = generateTree({
      breadthDepthBias: 0,
      maxBranches: 10,
      maxDepth: 4,
      nodeCount: 80,
      seed: "curriculum-test",
      uniform: true,
    }, createAcademicCurriculumData());
    if (!result.ok) throw new Error(result.error.message);

    const indexed = indexTree(result.tree);
    expect(indexed.byId.get(result.tree.rootId)?.data.label).toBe("Academic learning map");
    const firstLevelLabels = indexed.childrenById.get(result.tree.rootId)?.map((node) => node.data.label);
    expect(firstLevelLabels).toEqual([
      "Mathematics",
      "Physics",
      "Computer science",
      "Biology",
      "Chemistry",
      "Economics",
      "Psychology",
      "Engineering",
      "Humanities",
      "Research practice",
    ]);
    expect(result.tree.nodes.every((node) => !/^Node \d+$/.test(node.data.label))).toBe(true);
  });
});
