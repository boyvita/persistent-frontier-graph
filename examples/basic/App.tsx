import { useMemo } from "react";
import {
  PersistentFrontierGraph,
  generateTree,
} from "persistent-frontier-graph";
import "persistent-frontier-graph/styles.css";

export function App() {
  const generated = useMemo(
    () => generateTree({
      breadthDepthBias: 0.4,
      maxBranches: 6,
      maxDepth: 8,
      nodeCount: 180,
      seed: "basic-example",
      uniform: true,
    }),
    [],
  );
  if (!generated.ok) return <p role="alert">{generated.error.message}</p>;
  return <PersistentFrontierGraph tree={generated.tree} />;
}
