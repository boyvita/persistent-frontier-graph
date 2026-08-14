import { describe, expect, it } from "vitest";
import {
  createFrontierGraphModel,
  deriveAutomaticFrontier,
  deriveProjectionViewportWindow,
  deriveRadialProjectionSector,
  generateTree,
  type FrontierTree,
  type GeneratedNodeData,
} from "../src";

function fixture(): FrontierTree<GeneratedNodeData> {
  const result = generateTree({
    breadthDepthBias: 0.6,
    maxBranches: 4,
    maxDepth: 6,
    nodeCount: 90,
    seed: "layout-fixture",
    uniform: true,
  });
  if (!result.ok) throw new Error(result.error.message);
  return result.tree;
}

describe("persistent frontier layouts", () => {
  it("keeps true depth in cone columns at every frontier", () => {
    const model = createFrontierGraphModel(fixture(), 2.4);
    const slot = 210 + 48;
    for (const projected of model.cone.nodes) {
      expect(projected.position.x).toBe(projected.depth * slot);
    }
  });

  it("centres each visible parent on its extreme visible children", () => {
    const tree = fixture();
    for (const frontier of [1, 2, 3, 4, 5, 6]) {
      const model = createFrontierGraphModel(tree, frontier);
      const byId = new Map(model.cone.nodes.map((node) => [node.node.id, node]));
      for (const id of model.index.orderedIds) {
        const parent = byId.get(id);
        if (!parent || parent.depth >= frontier) continue;
        const children = (model.index.childrenById.get(id) ?? [])
          .map((child) => byId.get(child.id))
          .filter((child) => child && child.reveal > 0.999);
        if (children.length === 0) continue;
        const ys = children.map((child) => child!.position.y);
        expect(parent.position.y).toBeCloseTo((Math.min(...ys) + Math.max(...ys)) / 2, 6);
      }
    }
  });

  it("interpolates complete coordinate sets continuously", () => {
    const tree = fixture();
    const lower = createFrontierGraphModel(tree, 2);
    const middle = createFrontierGraphModel(tree, 2.5);
    const upper = createFrontierGraphModel(tree, 3);
    const lowerById = new Map(lower.cone.nodes.map((node) => [node.node.id, node.position]));
    const middleById = new Map(middle.cone.nodes.map((node) => [node.node.id, node.position]));
    const upperById = new Map(upper.cone.nodes.map((node) => [node.node.id, node.position]));
    for (const id of lowerById.keys()) {
      expect(middleById.get(id)?.y).toBeCloseTo(((lowerById.get(id)?.y ?? 0) + (upperById.get(id)?.y ?? 0)) / 2, 6);
    }
  });

  it("pulls deeper radial descendants into their coordinate-boundary ancestor", () => {
    const model = createFrontierGraphModel(fixture(), 2);
    const byId = new Map(model.radial.nodes.map((node) => [node.node.id, node]));
    const deep = model.radial.nodes.find((node) => node.depth >= 4);
    expect(deep).toBeDefined();
    const ancestor = deep ? byId.get(deep.frontierAncestorId) : undefined;
    expect(deep?.reveal).toBe(1);
    expect(deep?.position).toEqual(ancestor?.canonicalPosition);
  });

  it("moves the next radial ring continuously away from its ancestor", () => {
    const tree = fixture();
    const lower = createFrontierGraphModel(tree, 2);
    const middle = createFrontierGraphModel(tree, 2.5);
    const upper = createFrontierGraphModel(tree, 3);
    const target = middle.radial.nodes.find((node) => node.depth === 3);
    expect(target).toBeDefined();
    const position = (model: typeof middle) => model.radial.nodes.find((node) => node.node.id === target?.node.id)?.position;
    const from = position(lower);
    const halfway = position(middle);
    const to = position(upper);
    expect(halfway?.x).toBeCloseTo(((from?.x ?? 0) + (to?.x ?? 0)) / 2, 6);
    expect(halfway?.y).toBeCloseTo(((from?.y ?? 0) + (to?.y ?? 0)) / 2, 6);
  });

  it("keeps every radial subtree in one contiguous angular interval", () => {
    const tree: FrontierTree<{ label: string }> = {
      nodes: [
        { data: { label: "Root" }, id: "root", parentId: null },
        { data: { label: "A" }, id: "a", parentId: "root" },
        { data: { label: "B" }, id: "b", parentId: "root" },
        { data: { label: "A terminal" }, id: "a-1", parentId: "a" },
        { data: { label: "A branch" }, id: "a-2", parentId: "a" },
        { data: { label: "A deep" }, id: "a-2-1", parentId: "a-2" },
      ],
      revision: "unbalanced-radial-order",
      rootId: "root",
    };
    const model = createFrontierGraphModel(tree, 3);
    const aAngles = ["a-1", "a-2-1"].map((id) => model.radial.anglesById.get(id) ?? 0);
    const bAngle = model.radial.anglesById.get("b") ?? 0;
    expect(bAngle).toBeGreaterThan(Math.max(...aAngles));
    expect(model.radial.anglesById.get("a")).toBeCloseTo((Math.min(...aAngles) + Math.max(...aAngles)) / 2);
  });

  it("derives exactly one synchronized visible set for both views", () => {
    const model = createFrontierGraphModel(fixture(), 3.25);
    expect(model.cone.visibleNodeIds).toBe(model.snapshot.visibleNodeIds);
    expect(model.radial.visibleNodeIds).toBe(model.snapshot.visibleNodeIds);
    expect(model.cone.nodes.filter((node) => node.reveal > 0).map((node) => node.node.id))
      .toEqual(model.radial.nodes.filter((node) => node.reveal > 0).map((node) => node.node.id));
  });

  it("maps the exact cone camera window into the radial sector", () => {
    const model = createFrontierGraphModel(fixture(), 3.25);
    const window = deriveProjectionViewportWindow(
      model.cone,
      { x: 80, y: 220, zoom: 0.7 },
      { height: 440, width: 720 },
      { height: 58, width: 210 },
    );
    const sector = deriveRadialProjectionSector(window, model.radial);
    expect(sector).not.toBeNull();
    expect(sector?.visibleNodeIds).toBe(window.visibleNodeIds);
    expect(window.visibleNodeIds.size).toBeGreaterThan(0);
    expect(window.visibleNodeIds.size).toBeLessThan(model.snapshot.visibleNodeIds.size);
    for (const id of sector?.visibleNodeIds ?? []) expect(model.snapshot.visibleNodeIds.has(id)).toBe(true);
    expect(sector?.outerRadius).toBeGreaterThan(sector?.innerRadius ?? 0);
  });

  it("keeps every node mounted and revealed while coordinates collapse", () => {
    const model = createFrontierGraphModel(fixture(), 2.0005);
    const window = deriveProjectionViewportWindow(
      model.cone,
      { x: 0, y: 500_000, zoom: 1 },
      { height: 1_000_000, width: 1_000_000 },
      { height: 58, width: 210 },
    );
    const sector = deriveRadialProjectionSector(window, model.radial);
    expect(model.cone.nodes.every((node) => node.reveal === 1)).toBe(true);
    expect(window.visibleNodeIds).toEqual(model.snapshot.visibleNodeIds);
    expect(sector?.visibleNodeIds).toEqual(model.snapshot.visibleNodeIds);
  });

  it("marks only coordinate-boundary representatives as frontier nodes", () => {
    const model = createFrontierGraphModel(fixture(), 2);
    for (const id of model.snapshot.frontierNodeIds) {
      const depth = model.index.depthById.get(id) ?? 0;
      const children = model.index.childrenById.get(id) ?? [];
      expect(depth === 2 || children.length === 0).toBe(true);
    }
    expect(model.snapshot.frontierNodeIds.size).toBeLessThan(model.tree.nodes.length);
  });

  it("holds an automatic coordinate set for the first half of a depth band", () => {
    const nodeWidth = 210;
    const depthSlot = 258;
    const offset = 0;
    const spanAt = (capacity: number) => nodeWidth / 2 + capacity * depthSlot;

    expect(deriveAutomaticFrontier(offset, spanAt(2), 6, nodeWidth, depthSlot)).toBe(2);
    expect(deriveAutomaticFrontier(offset, spanAt(2.49), 6, nodeWidth, depthSlot)).toBe(2);
    expect(deriveAutomaticFrontier(offset, spanAt(2.5), 6, nodeWidth, depthSlot)).toBe(2);
    expect(deriveAutomaticFrontier(offset, spanAt(2.75), 6, nodeWidth, depthSlot)).toBeCloseTo(2.5);
    expect(deriveAutomaticFrontier(offset, spanAt(3), 6, nodeWidth, depthSlot)).toBe(3);
  });

  it("lays out a thousand nodes within a bounded headless budget", () => {
    const result = generateTree({
      breadthDepthBias: 0.5,
      maxBranches: 8,
      maxDepth: 8,
      nodeCount: 1000,
      seed: "thousand-node-contract",
      uniform: false,
    });
    if (!result.ok) throw new Error(result.error.message);
    const started = performance.now();
    const model = createFrontierGraphModel(result.tree, 8);
    const elapsed = performance.now() - started;
    expect(model.cone.nodes).toHaveLength(1000);
    expect(model.radial.nodes).toHaveLength(1000);
    expect(elapsed).toBeLessThan(750);
  });
});
