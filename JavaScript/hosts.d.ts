import type {
  CanopyNode, CanopyColumn, CanopyView, InlineView, SidecarView, RemoteView, CanopyLabels, CellValue, CheckIntent,
  CountsDocument, PageResult, SearchResult, ViewQuery, ReadonlyViewQuery, ContextAction
} from "./protocol.js";

export type Awaitable<T> = T | PromiseLike<T>;
/** Query-aware hosts answer from one accepted dataset revision. */
export interface SourceRequest { signal: AbortSignal; query?: ReadonlyViewQuery; revision?: string | null; }
interface DataSourceBase {
  kind?: string;
  /** Resolves a lease disposer. A source releases held data on cancellation as well. */
  prefetch?(opens: string[], finds: string[], request?: SourceRequest): Awaitable<void | (() => void)>;
}
type SourcePage<T> = (node: CanopyNode | null, cursor: string | null, request?: SourceRequest) => Awaitable<T>;
type SourceSearch<T> = (query: string, limit: number, request?: SourceRequest) => Awaitable<T>;
type SourceCounts<T> = (ids: string[], request?: SourceRequest) => Awaitable<T>;
type SearchCapability<T> = (
  | { canSearch: true; search: SourceSearch<T> }
  | { canSearch?: false; search?: SourceSearch<T> }
);
/** Search availability requires its method; query-aware callbacks identify one dataset revision. */
export type DataSource = DataSourceBase & (
  | ({ queryAware?: false; page: SourcePage<PageResult>; counts?: SourceCounts<CountsDocument> | null } & SearchCapability<SearchResult>)
  | ({ queryAware: true; page: SourcePage<PageResult & { revision: string }>;
       counts?: SourceCounts<CountsDocument & { revision: string }> | null } & SearchCapability<SearchResult & { revision: string }>)
);
export interface RemoteOptions { timeoutMs?: number; signal?: AbortSignal; }
export interface Sources {
  inline(view: InlineView): DataSource;
  sidecar(view: SidecarView): DataSource;
  remote(view: RemoteView, options?: RemoteOptions): DataSource;
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
export interface CellContext {
  column: string; level: number; expanded: boolean; index: number;
  /** Aborts before replacement, recycling, failed rendering or destruction. */
  readonly signal: AbortSignal;
  /** Registers cleanup for this cell paint. Called once in reverse registration order. */
  onDispose(cleanup: () => void): void;
}
export interface LoadInfo { node: CanopyNode | null; count: number; total: number | null; ms: number; }

/** Hooks stay with the host. Acceptance never makes the grid perform a write. */
interface HostOptionsBase {
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
  onEdit?: (proposal: EditProposal, context: InteractionContext) => Awaitable<boolean>;
  onDrop?: (proposal: DropProposal, context: InteractionContext) => Awaitable<boolean>;
  onAction?: (proposal: ActionProposal, context: InteractionContext) => Awaitable<boolean>;
  canEdit?: (node: CanopyNode, column: CanopyColumn) => boolean;
  canDrag?: (node: CanopyNode) => boolean;
  canDrop?: (proposal: DropProposal) => boolean;
  isActionEnabled?: (node: CanopyNode, action: Readonly<ContextAction>) => boolean;
}
/** A custom deep-link scheme supplies its formatter and parser together. */
export type HostOptions = HostOptionsBase & (
  | { formatLink: (path: string[], node: CanopyNode | null) => string | null;
      parseLink: (fragment: string) => Awaitable<string[] | null> }
  | { formatLink?: never; parseLink?: never }
);
export type TreeGridOptions = HostOptions & { view: CanopyView };
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
