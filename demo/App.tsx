import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  PersistentFrontierGraph,
  generateTree,
  indexTree,
  treeCapacity,
  type GeneratedNodeData,
  type GenerateTreeOptions,
  type NodeAction,
  type NodeRendererContext,
} from "../src";

interface DemoOptions {
  breadthDepthBias: number;
  maxBranches: number;
  maxDepth: number;
  nodeCount: number;
  uniform: boolean;
}

const INITIAL_OPTIONS: DemoOptions = {
  breadthDepthBias: 0.42,
  maxBranches: 5,
  maxDepth: 7,
  nodeCount: 160,
  uniform: true,
};

const LAYOUT_OPTIONS = {
  cone: { columnGap: 78, hierarchyGap: 12, localGap: 14, maximumHierarchyGap: 110 },
  radial: { minimumRingGap: 132, nodePitch: 50, seamPadding: 0.12 },
} as const;

const DEMO_ACTIONS: readonly NodeAction<GeneratedNodeData>[] = [
  { id: "copy-id", label: "Copy node ID" },
  { id: "copy-json", label: "Copy as JSON" },
];

function nextSeed(): string {
  const values = new Uint32Array(2);
  crypto.getRandomValues(values);
  return `${values[0]?.toString(36)}-${values[1]?.toString(36)}`;
}

function buildTree(options: DemoOptions, seed: string) {
  return generateTree({ ...options, seed } satisfies GenerateTreeOptions);
}

function DemoNode({ data, depth, isFrontier, view }: NodeRendererContext<GeneratedNodeData>) {
  if (view === "radial") return <span>{data.label}</span>;
  return (
    <span className="demo-node">
      <span className="demo-node__eyebrow">{isFrontier ? "FRONTIER" : `LEVEL ${depth}`}</span>
      <strong>{data.label}</strong>
      <small>{data.ordinal.toString().padStart(4, "0")}</small>
    </span>
  );
}

function RangeControl({
  label,
  max,
  min,
  onChange,
  value,
}: {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  value: number;
}) {
  return (
    <label className="generator-control">
      <span>{label} <strong className="generator-control__value">{value}</strong></span>
      <input
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        step="1"
        type="range"
        value={value}
      />
      <small><span>{min}</span><span>{max}</span></small>
    </label>
  );
}

function Mark({ children }: { children: string }) {
  return <span className="mark">{children}</span>;
}

function GeneratorPanel({
  capacity,
  draft,
  error,
  onRegenerate,
  onUpdate,
}: {
  capacity: number;
  draft: DemoOptions;
  error: string | null;
  onRegenerate: () => void;
  onUpdate: (patch: Partial<DemoOptions>) => void;
}) {
  return (
    <div className="generator-panel">
      <div className="generator-grid">
        <RangeControl label="Maximum branches" max={12} min={1} value={draft.maxBranches} onChange={(value) => onUpdate({ maxBranches: value })} />
        <RangeControl label="Maximum depth" max={20} min={0} value={draft.maxDepth} onChange={(value) => onUpdate({ maxDepth: value })} />
        <label className="generator-control generator-control--wide">
          <span>Growth direction <output>{draft.breadthDepthBias.toFixed(2)}</output></span>
          <input
            aria-label="Growth direction, zero for breadth and one for depth"
            max="1"
            min="0"
            onChange={(event: ChangeEvent<HTMLInputElement>) => onUpdate({ breadthDepthBias: Number(event.target.value) })}
            step="0.01"
            type="range"
            value={draft.breadthDepthBias}
          />
          <small><span>0 · breadth</span><span>1 · depth</span></small>
        </label>
        <RangeControl label="Number of nodes" max={1000} min={1} value={draft.nodeCount} onChange={(value) => onUpdate({ nodeCount: value })} />
      </div>
      <div className="generator-footer">
        <label className="toggle">
          <input checked={draft.uniform} onChange={(event) => onUpdate({ uniform: event.target.checked })} type="checkbox" />
          <span aria-hidden="true" />
          <strong>Balance tree</strong>
          <small>{draft.uniform ? "Balance sibling subtrees" : "Seeded random shape"}</small>
        </label>
        <div className="generator-capacity">
          <span>Shape capacity</span>
          <strong>{Math.min(capacity, 1000).toLocaleString()}</strong>
        </div>
        <button className="button button--primary generator-button" onClick={onRegenerate} type="button">Regenerate <span>↻</span></button>
      </div>
      {error ? <p className="generator-error" role="alert">{error} The previous valid graph is still shown.</p> : null}
    </div>
  );
}

export function App() {
  const [draft, setDraft] = useState<DemoOptions>(INITIAL_OPTIONS);
  const [seed, setSeed] = useState("launch-sequence");
  const [tree, setTree] = useState(() => {
    const initial = buildTree(INITIAL_OPTIONS, "launch-sequence");
    if (!initial.ok) throw new Error(initial.error.message);
    return initial.tree;
  });
  const [error, setError] = useState<string | null>(null);
  const [frontier, setFrontier] = useState(2.5);
  const [selectedId, setSelectedId] = useState<string>(tree.rootId);
  const [notice, setNotice] = useState("Both views share one projection state.");
  const [isReplaying, setIsReplaying] = useState(false);
  const replayTimer = useRef<number | null>(null);
  const index = useMemo(() => indexTree(tree), [tree]);
  const capacity = treeCapacity(draft.maxBranches, draft.maxDepth);

  useEffect(() => () => {
    if (replayTimer.current !== null) window.clearInterval(replayTimer.current);
  }, []);

  const regenerate = () => {
    const candidateSeed = nextSeed();
    const result = buildTree(draft, candidateSeed);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    if (replayTimer.current !== null) window.clearInterval(replayTimer.current);
    replayTimer.current = null;
    setIsReplaying(false);
    setTree(result.tree);
    setSeed(result.seed);
    setFrontier(Math.min(2.5, indexTree(result.tree).maximumDepth));
    setSelectedId(result.tree.rootId);
    setError(null);
    setNotice(`Generated ${result.tree.nodes.length} nodes from seed ${result.seed}.`);
  };

  const replay = () => {
    if (replayTimer.current !== null) window.clearInterval(replayTimer.current);
    setIsReplaying(true);
    setFrontier(0);
    let next = 0;
    replayTimer.current = window.setInterval(() => {
      next = Math.min(index.maximumDepth, next + 0.5);
      setFrontier(next);
      if (next >= index.maximumDepth) {
        if (replayTimer.current !== null) window.clearInterval(replayTimer.current);
        replayTimer.current = null;
        setIsReplaying(false);
      }
    }, 430);
  };

  const handleAction = async (actionId: string, nodeId: string) => {
    const node = index.byId.get(nodeId);
    const value = actionId === "copy-json" ? JSON.stringify(node, null, 2) : nodeId;
    await navigator.clipboard.writeText(value);
    setNotice(actionId === "copy-json" ? "Node JSON copied." : `Copied ${nodeId}.`);
  };

  return (
    <div className="site-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <nav className="site-nav" aria-label="Main navigation">
        <a className="brand" href="#top"><span className="brand__glyph">PF</span><span>persistent<br />frontier graph</span></a>
        <div className="site-nav__links">
          <a href="#demo">Demo</a>
          <a href="#mechanics">How it works</a>
          <a href="#api">API</a>
          <a href="https://github.com/boyvita/persistent-frontier-graph">GitHub ↗</a>
        </div>
      </nav>

      <main id="main-content">
        <section className="demo-section demo-section--lead" id="demo" aria-labelledby="demo-title">
          <header className="demo-intro" id="top">
            <div>
              <h1 id="demo-title">Persistent Frontier Graph</h1>
              <p>A practical React library for exploring one tree as a cone and a radial projection. Adjust the controls and use it in your own interface.</p>
            </div>
            <a className="button button--small" href="https://github.com/boyvita/persistent-frontier-graph">GitHub ↗</a>
          </header>

          <div className="demo-controls" id="generator">
            <GeneratorPanel
              capacity={capacity}
              draft={draft}
              error={error}
              onRegenerate={regenerate}
              onUpdate={(patch) => setDraft((current) => ({ ...current, ...patch }))}
            />
            <div className="frontier-control">
              <div>
                <span>VISIBLE FRONTIER</span>
                <strong>{frontier.toFixed(1)} <small>/ {index.maximumDepth}</small></strong>
              </div>
              <input
                aria-label="Visible frontier depth"
                max={index.maximumDepth}
                min="0"
                onChange={(event) => setFrontier(Number(event.target.value))}
                step="0.1"
                type="range"
                value={frontier}
              />
              <button className="button button--small" disabled={isReplaying} onClick={replay} type="button">{isReplaying ? "Revealing…" : "Replay pull"}</button>
            </div>
          </div>

          <PersistentFrontierGraph
            actions={DEMO_ACTIONS}
            frontier={frontier}
            layoutOptions={LAYOUT_OPTIONS}
            onAction={(event) => { void handleAction(event.action.id, event.node.id); }}
            onSelectedIdChange={setSelectedId}
            renderNode={DemoNode}
            selectedId={selectedId}
            tree={tree}
          />
          <p aria-label="Graph status" className="demo-status" role="status"><span className="status-light" />{notice} <small>seed · {seed}</small></p>
        </section>

        <section className="mechanics" id="mechanics">
          <div className="section-heading">
            <div><span className="section-index">01 / MECHANICS</span><h2>How it works</h2></div>
            <p>The layout is deterministic geometry, not a force simulation. The graph never forgets subtree order or hierarchy depth.</p>
          </div>
          <div className="mechanics-grid">
            <article><span>01</span><h3>Measure subtrees</h3><p>Leaf weight reserves one contiguous angular interval for every family. Siblings can grow without interleaving.</p></article>
            <article><span>02</span><h3>Freeze coordinate sets</h3><p>Each integer depth has a complete layout. Parents sit at the midpoint of their outermost visible children.</p></article>
            <article><span>03</span><h3>Interpolate the frontier</h3><p>Fractional depth blends adjacent coordinate sets. Nodes move continuously instead of teleporting between layouts.</p></article>
            <article><span>04</span><h3>Project twice</h3><p>The cone unwraps depth into columns. The radial tree pulls unrevealed descendants into the same frontier ancestor.</p></article>
          </div>
        </section>

        <section className="rules">
          <div className="rules__lead">
            <span className="section-index">THE CONTRACT</span>
            <h2>Rules that make<br />motion trustworthy.</h2>
          </div>
          <div className="rule-list">
            <div><Mark>01</Mark><p><strong>True depth stays true.</strong> Physical radius and screen density never masquerade as hierarchy depth.</p></div>
            <div><Mark>02</Mark><p><strong>Families never cross.</strong> Every subtree owns one contiguous interval in the circular and cone layouts.</p></div>
            <div><Mark>03</Mark><p><strong>Parents remain legible.</strong> At each frontier, a parent is centered between its extreme visible children.</p></div>
            <div><Mark>04</Mark><p><strong>Both views agree.</strong> One immutable tree and one frontier snapshot feed both projections in the same render.</p></div>
            <div><Mark>05</Mark><p><strong>Random means reproducible.</strong> Every generated tree has a seed for tests, bug reports, and exact replay.</p></div>
          </div>
        </section>

        <section className="api-section" id="api">
          <div className="section-heading">
            <div><span className="section-index">02 / EXTEND</span><h2>Use your data and components</h2></div>
            <p>The library owns geometry, validation, and synchronization. You own node content, actions, edge treatment, overlays, selection, and composition.</p>
          </div>
          <div className="api-grid">
            <div className="code-card">
              <header><span /><span /><span /><strong>example.tsx</strong></header>
              <pre aria-label="Persistent Frontier Graph React example" tabIndex={0}><code>{`import {
  PersistentFrontierGraph,
  generateTree
} from "persistent-frontier-graph";

const result = generateTree({
  nodeCount: 250,
  maxBranches: 6,
  maxDepth: 9,
  breadthDepthBias: 0.35,
  uniform: true,
  seed: "design-review"
});

if (!result.ok) throw new Error(result.error.message);

<PersistentFrontierGraph
  tree={result.tree}
  frontier={visibleDepth}
  renderNode={YourNode}
  overlays={yourOverlays}
  actions={yourActions}
/>`}</code></pre>
            </div>
            <div className="extension-list">
              <article><span>RENDER</span><h3>Replace every node</h3><p>A typed renderer receives data, view, depth, reveal amount, selection, and frontier state.</p></article>
              <article><span>DECORATE</span><h3>Style edges & overlays</h3><p>Add read-only layers, annotations, minimaps, analytics, or domain-specific affordances.</p></article>
              <article><span>ACT</span><h3>Attach extra functions</h3><p>Actions emit node ID and tree revision. The library never invents editing semantics for your data.</p></article>
              <article><span>COMPOSE</span><h3>Use the headless core</h3><p>Call the generator, validator, frontier snapshot, cone, and radial layouts without the bundled React UI.</p></article>
            </div>
          </div>
        </section>

        <section className="closing">
          <span>OPEN SOURCE</span>
          <h2>Use it in your project</h2>
          <p>MIT licensed and maintained by <a href="https://github.com/boyvita">Vitaly Boytsov · @boyvita</a>.</p>
          <div><a className="button button--primary" href="https://github.com/boyvita/persistent-frontier-graph">View on GitHub</a><a className="button" href="https://github.com/boyvita/persistent-frontier-graph/blob/main/docs/specification.md">Read the specification</a></div>
        </section>
      </main>

      <footer className="site-footer"><a className="brand" href="#top"><span className="brand__glyph">PF</span><span>persistent frontier graph</span></a><p>MIT licensed · React + TypeScript · © 2026 Vitaly Boytsov</p><a href="#top">Back to top ↑</a></footer>
    </div>
  );
}
