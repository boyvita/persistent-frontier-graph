export type TreeValidationCode =
  | "invalid_revision"
  | "invalid_order"
  | "duplicate_id"
  | "missing_root"
  | "multiple_roots"
  | "unknown_parent"
  | "self_parent"
  | "cycle"
  | "disconnected";

export interface TreeValidationIssue {
  readonly code: TreeValidationCode;
  readonly message: string;
  readonly nodeId?: string;
}

export class InvalidTreeError extends Error {
  readonly issues: readonly TreeValidationIssue[];

  constructor(issues: readonly TreeValidationIssue[]) {
    super(issues.map((issue) => issue.message).join("; "));
    this.name = "InvalidTreeError";
    this.issues = issues;
  }
}
