import { useMemo, useState } from "react";
import {
  PersistentFrontierGraph,
  generateTree,
  indexTree,
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
  const [frontier, setFrontier] = useState(3.5);

  if (!generated.ok) return <p role="alert">{generated.error.message}</p>;
  const maximumDepth = indexTree(generated.tree).maximumDepth;

  return (
    <main>
      <label>
        Visible depth: {frontier.toFixed(1)}
        <input
          max={maximumDepth}
          min={0}
          onChange={(event) => setFrontier(Number(event.target.value))}
          step={0.1}
          type="range"
          value={frontier}
        />
      </label>
      <PersistentFrontierGraph frontier={frontier} tree={generated.tree} />
    </main>
  );
}
