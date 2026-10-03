import type {
  CanopyNode, CanopyColumn, CanopyView, CanopyLabels, CellValue, CheckIntent,
  CountsDocument, PageResult, SearchResult, ViewQuery, ReadonlyViewQuery, ContextAction
} from "./protocol.js";

export type Awaitable<T> = T | PromiseLike<T>;
/** Query-aware hosts answer from one accepted dataset revision. */
export interface SourceRequest { signal: AbortSignal; query?: ReadonlyViewQuery; revision?: string | null; }
export interface DataSource {
  kind?: string;
  queryAware?: boolean;
  canSearch?: boolean;
  page(node: CanopyNode | null, cursor: string | null, request?: SourceRequest): Awaitable<PageResult>;
  search?(query: string, limit: number, request?: SourceRequest): Awaitable<SearchResult>;
  counts?: ((ids: string[], request?: SourceRequest) => Awaitable<CountsDocument>) | null;
  /** Resolves a lease disposer. A source releases held data on cancellation as well. */
  prefetch?(opens: string[], finds: string[], request?: SourceRequest): Awaitable<void | (() => void)>;
}
export interface RemoteOptions { timeoutMs?: number; signal?: AbortSignal; }
export interface Sources {
  inline(view: CanopyView): DataSource;
  sidecar(view: CanopyView): DataSource;
  remote(view: CanopyView, options?: RemoteOptions): DataSource;
}

export interface NodeReference { readonly nodeId: string; readonly path: readonly string[]; }
export interface EditProposal extends NodeReference {
  readonly column: string;
  readonly previous: CellValue;
  readonly value: CellValue;
}
export type DropPlacement = "inside" | "before" | "after";
export interface DropProposal {
  readonly nodes: readonly NodeReference[];
  readonly target: { readonly nodeId: string | null; readonly path: readonly string[] };
  readonly placement: DropPlacement;
}
export interface ActionProposal extends NodeReference { readonly action: string; }
export interface InteractionContext {
  readonly signal: AbortSignal;
  readonly reason: string;
  readonly query: ViewQuery | null;
  readonly revision: string | null;
}
export interface InteractionOptions { signal?: AbortSignal; reason?: string; }
export interface SelectionContext { previous: CanopyNode[]; reason: string; }
export interface CheckContext { readonly previous: readonly CheckIntent[]; readonly reason: string; }
export interface CellContext { column: string; level: number; expanded: boolean; index: number; }
export interface LoadInfo { node: CanopyNode | null; count: number; total: number | null; ms: number; }

/** Hooks stay with the host. Acceptance never makes the grid perform a write. */
export interface HostOptions {
  source?: DataSource;
  labels?: CanopyLabels;
  requestTimeoutMs?: number;
  retainedNodeLimit?: number;
  inactiveNodeLimit?: number;
  interactionTimeoutMs?: number;
  renderers?: Record<string, (node: CanopyNode, element: HTMLElement, context: CellContext) => boolean>;
  renderDetail?: (node: CanopyNode, element: HTMLElement) => boolean;
  onSelect?: (node: CanopyNode | null, nodes: CanopyNode[]) => void;
  onToggle?: (node: CanopyNode, expanded: boolean) => void;
  onLoad?: (node: CanopyNode | null, info: LoadInfo) => void;
  isSelectable?: (node: CanopyNode) => boolean;
  beforeSelect?: (node: CanopyNode | null, nodes: CanopyNode[], context: SelectionContext) => boolean | void;
  isCheckable?: (node: CanopyNode) => boolean;
  beforeCheck?: (node: CanopyNode | null, intents: readonly CheckIntent[], context: CheckContext) => boolean | void;
  onCheck?: (node: CanopyNode | null, intents: readonly CheckIntent[], context: { reason: string }) => void;
  formatLink?: (path: string[], node: CanopyNode | null) => string | null;
  parseLink?: (fragment: string) => Awaitable<string[] | null>;
  onEdit?: (proposal: EditProposal, context: InteractionContext) => Awaitable<boolean>;
  onDrop?: (proposal: DropProposal, context: InteractionContext) => Awaitable<boolean>;
  onAction?: (proposal: ActionProposal, context: InteractionContext) => Awaitable<boolean>;
  canEdit?: (node: CanopyNode, column: CanopyColumn) => boolean;
  canDrag?: (node: CanopyNode) => boolean;
  canDrop?: (proposal: DropProposal) => boolean;
  isActionEnabled?: (node: CanopyNode, action: ContextAction) => boolean;
}
export interface TreeGridOptions extends HostOptions { view: CanopyView; }
export interface ExpandPathOptions {
  select?: boolean;
  focus?: boolean;
  reveal?: boolean;
  expandLast?: boolean;
  signal?: AbortSignal;
}
export interface FilterOptions { autoExpand?: boolean; }
export type NodeFilter = ((node: CanopyNode) => boolean) | {
  match(node: CanopyNode): boolean;
  keep?(node: CanopyNode): boolean;
};
