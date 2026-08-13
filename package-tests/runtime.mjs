import {
  createFrontierGraphModel,
  generateTree,
} from "persistent-frontier-graph";

const generated = generateTree({
  breadthDepthBias: 0.5,
  maxBranches: 4,
  maxDepth: 5,
  nodeCount: 32,
  seed: "package-runtime-smoke",
  uniform: false,
});

if (!generated.ok) throw new Error(generated.error.message);
const model = createFrontierGraphModel(generated.tree, 2.5);
if (model.cone.nodes.length !== 32 || model.radial.nodes.length !== 32) {
  throw new Error("Built package returned an incomplete model.");
}
