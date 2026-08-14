import { useMemo, useState } from "react";
import {
  PersistentFrontierGraph,
  generateTree,
  type NodeAction,
  type NodeRendererContext,
} from "persistent-frontier-graph";
import "persistent-frontier-graph/styles.css";

interface Topic {
  readonly label: string;
  readonly priority: "standard" | "important";
}

function TopicNode({ data, depth, view }: NodeRendererContext<Topic>) {
  if (view === "radial") return <span title={data.label} />;
  return (
    <span>
      <small>{`depth ${depth}`}</small>
      <strong>{data.label}</strong>
      <em>{data.priority}</em>
    </span>
  );
}

const actions: readonly NodeAction<Topic>[] = [
  { id: "open-details", label: "Open details" },
];

export function App() {
  const result = useMemo(
    () => generateTree<Topic>(
      {
        breadthDepthBias: 0.6,
        maxBranches: 4,
        maxDepth: 7,
        nodeCount: 80,
        seed: "custom-node-example",
        uniform: false,
      },
      ({ ordinal }) => ({
        label: ordinal === 0 ? "Knowledge root" : `Topic ${ordinal}`,
        priority: ordinal % 5 === 0 ? "important" : "standard",
      }),
    ),
    [],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (!result.ok) return <p role="alert">{result.error.message}</p>;

  return (
    <PersistentFrontierGraph
      actions={actions}
      getNodeLabel={(node) => `${node.data.label}, ${node.data.priority}`}
      onAction={({ action, node, treeRevision }) => {
        // Send the producer-owned revision so stale structural actions can be rejected.
        globalThis.alert(`${action.id}: ${node.data.label} @ ${treeRevision}`);
      }}
      onSelectedIdChange={setSelectedId}
      renderNode={TopicNode}
      selectedId={selectedId}
      tree={result.tree}
    />
  );
}
