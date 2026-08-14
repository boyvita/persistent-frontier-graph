import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  PersistentFrontierGraph,
  generateTree,
  type GeneratedNodeData,
  type NodeRendererContext,
} from "../src";

function tree() {
  const result = generateTree({
    breadthDepthBias: 0,
    maxBranches: 3,
    maxDepth: 3,
    nodeCount: 10,
    seed: "react-test",
    uniform: true,
  });
  if (!result.ok) throw new Error(result.error.message);
  return result.tree;
}

describe("React API", () => {
  it("derives the frontier automatically and synchronizes selection", () => {
    const onSelected = vi.fn();
    const { container } = render(<PersistentFrontierGraph onSelectedIdChange={onSelected} tree={tree()} />);
    expect(container.querySelector(".pfg-graph")).toHaveAttribute("data-frontier-mode", "auto");
    const cone = screen.getByRole("region", { name: "Persistent frontier cone projection" });
    const radial = screen.getByRole("region", { name: "Synchronized radial tree" });
    expect(cone.querySelectorAll("[data-node-id]")).toHaveLength(radial.querySelectorAll("[data-node-id]").length);

    const coneNode = cone.querySelector('[data-node-id="node-0001"]');
    expect(coneNode).not.toBeNull();
    if (!coneNode) return;
    fireEvent.click(coneNode);
    expect(onSelected).toHaveBeenCalledWith("node-0001");
  });

  it("keeps topology mounted while the frontier changes", () => {
    const candidate = tree();
    const rendered = render(<PersistentFrontierGraph frontier={1} tree={candidate} />);
    const cone = screen.getByRole("region", { name: "Persistent frontier cone projection" });
    const before = new Map(
      [...cone.querySelectorAll<HTMLElement>("[data-node-id]")]
        .map((node) => [node.dataset.nodeId ?? "", node]),
    );
    expect(before.size).toBe(candidate.nodes.length);
    rendered.rerender(<PersistentFrontierGraph frontier={3} tree={candidate} />);
    const after = new Map(
      [...cone.querySelectorAll<HTMLElement>("[data-node-id]")]
        .map((node) => [node.dataset.nodeId ?? "", node]),
    );
    expect(after.size).toBe(candidate.nodes.length);
    for (const [id, node] of before) expect(after.get(id)).toBe(node);
  });

  it("supports custom renderers and revision-bound actions", () => {
    const onAction = vi.fn();
    const renderNode = ({ data, view }: NodeRendererContext<GeneratedNodeData>) => <span>{view}:{data.ordinal}</span>;
    const candidate = tree();
    render(
      <PersistentFrontierGraph
        actions={[{ id: "inspect", label: "Inspect" }]}
        frontier={2}
        onAction={onAction}
        renderNode={renderNode}
        tree={candidate}
      />,
    );
    expect(screen.getAllByText("cone:0")).toHaveLength(1);
    expect(screen.getAllByText("radial:0")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Inspect" }));
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ treeRevision: candidate.revision }));
  });

  it("supports edge, overlay, label, and renderer selection extensions", () => {
    const onSelected = vi.fn();
    const candidate = tree();
    render(
      <PersistentFrontierGraph
        frontier={2}
        getNodeLabel={(node) => `Accessible ${node.data.label}`}
        onSelectedIdChange={onSelected}
        overlays={[{
          id: "guide",
          render: ({ view }) => <span data-testid={`overlay-${view}`}>guide</span>,
        }]}
        renderEdge={() => ({ className: "consumer-edge", style: { opacity: 1, strokeWidth: 3 } })}
        renderNode={(context) => (
          <span data-renderer-select={context.node.id} onClick={(event) => context.select(event)}>
            {context.data.label}
          </span>
        )}
        tree={candidate}
      />,
    );
    expect(document.querySelectorAll(".consumer-edge").length).toBeGreaterThan(0);
    const radial = screen.getByRole("region", { name: "Synchronized radial tree" });
    const outsideConsumerEdge = radial.querySelector<SVGPathElement>('.consumer-edge[data-in-projection-window="false"]');
    expect(outsideConsumerEdge).not.toBeNull();
    expect(outsideConsumerEdge).toHaveStyle({ opacity: "1" });
    expect(screen.getByTestId("overlay-cone")).toBeInTheDocument();
    expect(screen.getByTestId("overlay-radial")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Accessible Node 1/ })).toBeInTheDocument();
    const selectButton = document.querySelector<HTMLSpanElement>('[data-renderer-select="node-0001"]');
    expect(selectButton).not.toBeNull();
    if (selectButton) fireEvent.click(selectButton);
    expect(onSelected).toHaveBeenCalledWith("node-0001");
    expect(onSelected).toHaveBeenCalledTimes(1);
  });

  it("renders an accessible error instead of a partial invalid graph", async () => {
    const onError = vi.fn();
    render(
      <PersistentFrontierGraph
        frontier={1}
        onError={onError}
        tree={{
          nodes: [{ data: { label: "Broken", ordinal: 0 }, id: "broken", parentId: "missing" }],
          revision: "broken",
          rootId: "root",
        }}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Unable to render this tree");
    expect(screen.queryByRole("region", { name: "Persistent frontier cone projection" })).not.toBeInTheDocument();
    await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: "invalid_tree" })));
  });
});
