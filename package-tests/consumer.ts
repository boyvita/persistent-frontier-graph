import {
  PersistentFrontierGraph,
  createFrontierGraphModel,
  generateTree,
  type PersistentFrontierGraphProps,
} from "persistent-frontier-graph";

const generated = generateTree({
  breadthDepthBias: 0.5,
  maxBranches: 3,
  maxDepth: 4,
  nodeCount: 20,
  seed: "package-type-smoke",
  uniform: true,
});

if (!generated.ok) throw new Error(generated.error.message);
const model = createFrontierGraphModel(generated.tree, 2.5);
const component: typeof PersistentFrontierGraph = PersistentFrontierGraph;
const props: PersistentFrontierGraphProps<(typeof generated.tree.nodes)[number]["data"]> = {
  frontier: model.snapshot.frontier,
  tree: generated.tree,
};

void component;
void props;
