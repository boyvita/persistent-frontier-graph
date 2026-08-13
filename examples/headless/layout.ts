import {
  createFrontierGraphModel,
  generateTree,
  type Point,
} from "persistent-frontier-graph";

export interface ExportedPosition {
  readonly id: string;
  readonly cone: Point;
  readonly radial: Point;
  readonly visible: boolean;
}

export function createExportCoordinates(frontier: number): readonly ExportedPosition[] {
  const generated = generateTree({
    breadthDepthBias: 0.5,
    maxBranches: 5,
    maxDepth: 8,
    nodeCount: 120,
    seed: "headless-export",
    uniform: true,
  });
  if (!generated.ok) throw new Error(generated.error.message);

  const model = createFrontierGraphModel(generated.tree, frontier);
  const radialById = new Map(model.radial.nodes.map((item) => [item.node.id, item]));

  return model.cone.nodes.map((coneNode) => ({
    cone: coneNode.position,
    id: coneNode.node.id,
    radial: radialById.get(coneNode.node.id)?.position ?? { x: 0, y: 0 },
    visible: model.snapshot.visibleNodeIds.has(coneNode.node.id),
  }));
}
