import { useMemo, useState, type ChangeEvent } from "react";
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
  cone: { columnGap: 48, hierarchyGap: 10, localGap: 10, maximumHierarchyGap: 100 },
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

function DemoNode({ data, view }: NodeRendererContext<GeneratedNodeData>) {
  if (view === "radial") return <span>{data.label}</span>;
  return (
    <span className="demo-node">
      <strong>{data.label}</strong>
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
  draft,
  error,
  nodeMaximum,
  onRegenerate,
  onUpdate,
}: {
  draft: DemoOptions;
  error: string | null;
  nodeMaximum: number;
  onRegenerate: () => void;
  onUpdate: (patch: Partial<DemoOptions>) => void;
}) {
  return (
    <div aria-labelledby="generator-title" className="generator-panel">
      <header className="generator-panel__header">
        <h2 id="generator-title">Generation graph parameters</h2>
      </header>
      <div className="generator-grid">
        <RangeControl label="Maximum branches" max={12} min={1} value={draft.maxBranches} onChange={(value) => onUpdate({ maxBranches: value })} />
        <RangeControl label="Maximum depth" max={20} min={0} value={draft.maxDepth} onChange={(value) => onUpdate({ maxDepth: value })} />
        <RangeControl label="Number of nodes" max={nodeMaximum} min={1} value={draft.nodeCount} onChange={(value) => onUpdate({ nodeCount: value })} />
      </div>
      <div className="generator-footer">
        <label className="toggle">
          <input checked={draft.uniform} onChange={(event) => onUpdate({ uniform: event.target.checked })} type="checkbox" />
          <span aria-hidden="true" />
          <strong>Balance tree</strong>
          <small>{draft.uniform ? "Balance sibling subtrees" : "Seeded random shape"}</small>
        </label>
        <label className="generator-direction">
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
  const [selectedId, setSelectedId] = useState<string>(tree.rootId);
  const [notice, setNotice] = useState("Drag cards or the background. Use the wheel to navigate without scrolling the page.");
  const index = useMemo(() => indexTree(tree), [tree]);
  const nodeMaximum = treeCapacity(draft.maxBranches, draft.maxDepth);
  const updateDraft = (patch: Partial<DemoOptions>) => {
    setDraft((current) => {
      const next = { ...current, ...patch };
      const maximum = treeCapacity(next.maxBranches, next.maxDepth);
      return { ...next, nodeCount: Math.min(next.nodeCount, maximum) };
    });
  };

  const regenerate = () => {
    const candidateSeed = nextSeed();
    const result = buildTree(draft, candidateSeed);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setTree(result.tree);
    setSeed(result.seed);
    setSelectedId(result.tree.rootId);
    setError(null);
    setNotice(`Generated ${result.tree.nodes.length} nodes from seed ${result.seed}.`);
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
              draft={draft}
              error={error}
              nodeMaximum={nodeMaximum}
              onRegenerate={regenerate}
              onUpdate={updateDraft}
            />
          </div>

          <PersistentFrontierGraph
            actions={DEMO_ACTIONS}
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
            <article><span>03</span><h3>Follow the camera</h3><p>The coordinate depth is derived from the projection window. Adjacent coordinate sets blend without a manual frontier control.</p></article>
            <article><span>04</span><h3>Project twice</h3><p>The mind map unwraps depth into columns. The radial tree pulls deeper descendants into the same boundary ancestor.</p></article>
          </div>
        </section>

        <section className="applications" id="applications">
          <div className="section-heading">
            <div><span className="section-index">02 / APPLICATIONS</span><h2>Where it fits</h2></div>
            <p>Use the same structure when people need both a focused path and a complete overview.</p>
          </div>
          <div className="applications-grid">
            <article><span>SKILLS</span><h3>Progression trees</h3><p>Show the next available abilities in a focused path while keeping the complete skill tree visible.</p></article>
            <article><span>EDUCATION</span><h3>Knowledge navigation</h3><p>Guide students through subjects, prerequisites, and learning paths in schools, universities, and course platforms.</p></article>
            <article><span>DOCUMENTATION</span><h3>Large information maps</h3><p>Explore product areas, technical documentation, or research taxonomies without losing the surrounding hierarchy.</p></article>
            <article><span>PLANNING</span><h3>Decision and roadmap trees</h3><p>Move through one active branch while the radial view preserves alternative routes and overall structure.</p></article>
          </div>
        </section>

        <section className="rules">
          <div className="rules__lead">
            <span className="section-index">THE CONTRACT</span>
            <h2>Layout rules</h2>
          </div>
          <div className="rule-list">
            <div><Mark>01</Mark><p><strong>True depth stays true.</strong> Physical radius and screen density never masquerade as hierarchy depth.</p></div>
            <div><Mark>02</Mark><p><strong>Families never cross.</strong> Every subtree owns one contiguous interval in the circular and cone layouts.</p></div>
            <div><Mark>03</Mark><p><strong>Parents remain legible.</strong> A parent stays centered between its extreme children and can clamp into the current viewport for context.</p></div>
            <div><Mark>04</Mark><p><strong>Both views agree.</strong> One immutable tree and one camera-derived coordinate snapshot feed both projections in the same render.</p></div>
            <div><Mark>05</Mark><p><strong>Random means reproducible.</strong> Every generated tree has a seed for tests, bug reports, and exact replay.</p></div>
          </div>
        </section>

        <section className="api-section" id="api">
          <div className="section-heading">
            <div><span className="section-index">03 / EXTEND</span><h2>Use your data and components</h2></div>
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
  renderNode={YourNode}
  overlays={yourOverlays}
  actions={yourActions}
/>`}</code></pre>
            </div>
            <div className="extension-list">
              <article><span>RENDER</span><h3>Replace every node</h3><p>A typed renderer receives data, view, depth, selection, and coordinate-boundary context.</p></article>
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
