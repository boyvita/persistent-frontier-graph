import { InvalidTreeError, type TreeValidationIssue } from "./errors.js";
import type { FrontierNode, FrontierTree, NodeId, TreeIndex } from "./types.js";

export function validateTree<TData>(tree: FrontierTree<TData>): readonly TreeValidationIssue[] {
  const issues: TreeValidationIssue[] = [];
  if (typeof tree.revision !== "string" || tree.revision.trim().length === 0) {
    issues.push({ code: "invalid_revision", message: "Tree revision must be a non-empty string." });
  }
  const byId = new Map<NodeId, FrontierNode<TData>>();
  for (const node of tree.nodes) {
    if (byId.has(node.id)) {
      issues.push({ code: "duplicate_id", message: `Duplicate node id: ${node.id}`, nodeId: node.id });
    } else {
      byId.set(node.id, node);
    }
    if (node.parentId === node.id) {
      issues.push({ code: "self_parent", message: `Node ${node.id} cannot parent itself.`, nodeId: node.id });
    }
    if (node.order !== undefined && !Number.isFinite(node.order)) {
      issues.push({ code: "invalid_order", message: `Node ${node.id} has a non-finite order.`, nodeId: node.id });
    }
  }

  const declaredRoot = byId.get(tree.rootId);
  if (!declaredRoot) {
    issues.push({ code: "missing_root", message: `Root ${tree.rootId} is not present.` });
  } else if (declaredRoot.parentId !== null) {
    issues.push({ code: "missing_root", message: `Root ${tree.rootId} must have a null parent.`, nodeId: tree.rootId });
  }

  const roots = tree.nodes.filter((node) => node.parentId === null);
  if (roots.length !== 1 || roots[0]?.id !== tree.rootId) {
    issues.push({ code: "multiple_roots", message: "A tree must contain exactly one declared root." });
  }

  for (const node of tree.nodes) {
    if (node.parentId !== null && !byId.has(node.parentId)) {
      issues.push({
        code: "unknown_parent",
        message: `Node ${node.id} references missing parent ${node.parentId}.`,
        nodeId: node.id,
      });
    }
  }
  if (issues.length > 0) return issues;

  const visitState = new Map<NodeId, 0 | 1 | 2>();
  for (const node of tree.nodes) {
    if (visitState.get(node.id) === 2) continue;
    const path: NodeId[] = [];
    let current: FrontierNode<TData> | undefined = node;
    while (current && visitState.get(current.id) !== 2) {
      if (visitState.get(current.id) === 1) {
        issues.push({ code: "cycle", message: `Cycle detected at node ${current.id}.`, nodeId: current.id });
        break;
      }
      visitState.set(current.id, 1);
      path.push(current.id);
      current = current.parentId === null ? undefined : byId.get(current.parentId);
    }
    for (const id of path) visitState.set(id, 2);
  }
  if (issues.length > 0) return issues;

  const reachable = new Set<NodeId>();
  const childrenById = new Map<NodeId, NodeId[]>();
  for (const node of tree.nodes) {
    if (node.parentId === null) continue;
    const children = childrenById.get(node.parentId) ?? [];
    children.push(node.id);
    childrenById.set(node.parentId, children);
  }
  const stack = [tree.rootId];
  while (stack.length > 0) {
    const id = stack.pop();
    if (!id || reachable.has(id)) continue;
    reachable.add(id);
    stack.push(...(childrenById.get(id) ?? []));
  }
  if (reachable.size !== tree.nodes.length) {
    issues.push({ code: "disconnected", message: "Every node must be reachable from the declared root." });
  }
  return issues;
}

export function indexTree<TData>(tree: FrontierTree<TData>): TreeIndex<TData> {
  const issues = validateTree(tree);
  if (issues.length > 0) throw new InvalidTreeError(issues);

  const byId = new Map(tree.nodes.map((node) => [node.id, node]));
  const childrenById = new Map<NodeId, FrontierNode<TData>[]>();
  for (const node of tree.nodes) childrenById.set(node.id, []);
  for (const node of tree.nodes) {
    if (node.parentId !== null) childrenById.get(node.parentId)?.push(node);
  }
  for (const children of childrenById.values()) {
    children.sort((left, right) => {
      if (left.order !== undefined && right.order !== undefined && left.order !== right.order) {
        return left.order - right.order;
      }
      if (left.order !== undefined && right.order === undefined) return -1;
      if (left.order === undefined && right.order !== undefined) return 1;
      return left.id.localeCompare(right.id, "en", { numeric: true });
    });
  }

  const depthById = new Map<NodeId, number>([[tree.rootId, 0]]);
  const parentById = new Map<NodeId, NodeId | null>([[tree.rootId, null]]);
  const orderedIds: NodeId[] = [];
  const queue = [tree.rootId];
  let maximumDepth = 0;
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const id = queue[cursor];
    if (!id) continue;
    orderedIds.push(id);
    const depth = depthById.get(id) ?? 0;
    maximumDepth = Math.max(maximumDepth, depth);
    for (const child of childrenById.get(id) ?? []) {
      depthById.set(child.id, depth + 1);
      parentById.set(child.id, id);
      queue.push(child.id);
    }
  }

  return { byId, childrenById, depthById, maximumDepth, orderedIds, parentById };
}

export function ancestorAtDepth<TData>(
  nodeId: NodeId,
  targetDepth: number,
  index: TreeIndex<TData>,
): NodeId {
  let current = nodeId;
  while ((index.depthById.get(current) ?? 0) > targetDepth) {
    const parent = index.parentById.get(current);
    if (parent === null || parent === undefined) break;
    current = parent;
  }
  return current;
}

export function subtreeSizes<TData>(index: TreeIndex<TData>): ReadonlyMap<NodeId, number> {
  const sizes = new Map<NodeId, number>();
  for (let cursor = index.orderedIds.length - 1; cursor >= 0; cursor -= 1) {
    const id = index.orderedIds[cursor];
    if (!id) continue;
    let size = 1;
    for (const child of index.childrenById.get(id) ?? []) size += sizes.get(child.id) ?? 1;
    sizes.set(id, size);
  }
  return sizes;
}
