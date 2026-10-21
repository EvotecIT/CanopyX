// Type declarations for the change views (docs/changes.md): a text diff, a change list and a propagation view.

/** A note about a change that the lines cannot show, such as changed line endings. */
export interface ChangeNote {
  text: string;
  /** A CanopyX tone or a host tone; info when left out. */
  tone?: string;
}

/** A run of lines: where it starts on each side and its lines, each beginning with " " (unchanged), "-" (removed) or "+" (added). */
export interface DiffHunk {
  before: number;
  after: number;
  lines: string[];
}

/** The properties of a diff, as a diff document carries them and as a change list item's diff. */
export interface DiffBody {
  id: string;
  label: string;
  path?: string;
  previousPath?: string;
  /** Text by default; the other states have no lines and show their message. */
  content?: "binary" | "unavailable" | "identical";
  message?: string;
  beforeTitle?: string;
  afterTitle?: string;
  /** The whole earlier text: the browser compares the texts when there are no hunks (up to 5,000 lines each) and opens folded regions. */
  before?: string;
  after?: string;
  hunks?: DiffHunk[];
  /** Unchanged lines around each change, 0 to 20; 3 by default. */
  context?: number;
  /** Side by side when there is room, by default. */
  layout?: "inline" | "split";
  notes?: ChangeNote[];
  truncated?: boolean;
  /** The host's copy-ready unified diff. */
  unified?: string;
  labels?: Record<string, string>;
}

/** The diff document: `{ protocol: "canopyx/2", type: "diff" }`. */
export interface DiffDocument extends DiffBody {
  protocol: "canopyx/2";
  type: "diff";
}

/** Options of createDiff and CanopyX.configure for a diff fragment. */
export interface DiffOptions {
  view: DiffDocument;
  labels?: Record<string, string>;
  onReady?: (detail: { diff: string }) => void;
  onLayout?: (detail: { diff: string; layout: "inline" | "split" }) => void;
  onCopy?: (detail: { diff: string; copied: boolean }) => void;
}

/** The API of a diff. A call made before the changes part is in waits for it and returns a promise instead. */
export interface DiffApi {
  readonly element: HTMLElement;
  readonly view: DiffDocument;
  readonly ready: Promise<DiffApi>;
  getLayout(): "inline" | "split";
  setLayout(layout: "inline" | "split"): void;
  /** Moves to the next or previous change; false when there is none. */
  next(): boolean;
  previous(): boolean;
  /** Opens every folded region whose lines the diff has. */
  expandAll(): void;
  /** Copies the unified diff; resolves whether the clipboard took it. */
  copy(): Promise<boolean>;
  /** The hunks in effect: the document's, or those the browser compared. */
  getHunks(): DiffHunk[];
  update(view: DiffDocument): void;
  destroy(): void;
}

/** One side of a change: size in bytes, content hash and time. */
export interface ChangeVersion {
  size?: number;
  hash?: string;
  /** ISO 8601. */
  time?: string;
}

/** A changed file or item. */
export interface ChangeItem {
  id: string;
  kind: "added" | "removed" | "modified" | "renamed";
  path: string;
  previousPath?: string;
  kindLabel?: string;
  secondary?: string;
  before?: ChangeVersion;
  after?: ChangeVersion;
  facts?: { label: string; before?: string; after?: string; tone?: string }[];
  flags?: { id: string; label: string; reason: string; tone?: string }[];
  /** A diff that opens in the item's details. */
  diff?: DiffBody;
  /** The ids of the list's actions this item offers; all of them when left out. */
  actions?: string[];
  /** Values that copy and link actions use by key. */
  values?: Record<string, string>;
}

/**
 * An action the items (or the list's bar) offer: a host action, one that asks for a reason first, a copy action ("path",
 * "previousPath" or a value key), a link that opens a value (#, /, ./, ../, http(s):// or mailto: addresses), or one that reveals the
 * item's details or diff. One of copy, link, reveal and reason at most.
 */
export interface ChangeAction {
  id: string;
  label: string;
  icon?: "none" | "copy" | "diff" | "check" | "open" | "download" | "compare" | "flag";
  copy?: string;
  link?: string;
  reveal?: "none" | "details" | "diff";
  reason?: boolean;
}

/** The change list document: `{ protocol: "canopyx/2", type: "changes" }`. */
export interface ChangeListDocument {
  protocol: "canopyx/2";
  type: "changes";
  id: string;
  label: string;
  actions?: ChangeAction[];
  /** The bar's actions: host actions, and copy and link actions on the list's values. */
  toolbar?: ChangeAction[];
  values?: Record<string, string>;
  /** The files the bar offers to download: the items the filters keep. */
  exports?: ("csv" | "json")[];
  items: ChangeItem[];
  groupByFolder?: boolean;
  flaggedOnly?: boolean;
  expandFlagged?: boolean;
  hashLength?: number;
  pageSize?: number;
  timeZone?: "utc" | "local";
  labels?: Record<string, string>;
}

/** The reader's filters and open items. */
export interface ChangeListState {
  kinds: ChangeItem["kind"][];
  flaggedOnly: boolean;
  open: string[];
}

/** What canopyx:changeAction carries. */
export interface ChangeActionDetail {
  list: string;
  action: string;
  /** The item, or null for an action of the list's bar. */
  item: string | null;
  kind: ChangeItem["kind"] | null;
  path: string | null;
  previousPath: string | null;
  /** The item's values, or the list's for a bar action. */
  values: Record<string, string>;
  /** For a copy action, whether the clipboard took the value; null otherwise. */
  copied: boolean | null;
  /** The reason the reader gave, for an action that asks for one. */
  reason?: string;
  /** The address a link action opened. */
  href?: string;
  /** What a reveal action opened. */
  reveal?: "details" | "diff";
}

/** What canopyx:changeExport carries. */
export interface ChangeExportDetail {
  list: string;
  format: "csv" | "json";
  count: number;
  /** Whether the browser was given the file. */
  saved: boolean;
}

/** Options of createChangeList and CanopyX.configure for a change list fragment. */
export interface ChangeListOptions {
  view: ChangeListDocument;
  labels?: Record<string, string>;
  state?: Partial<ChangeListState>;
  onReady?: (detail: { list: string }) => void;
  /** Receives every action; for a host action, having it claims the action (as cancelling canopyx:changeAction does). */
  onAction?: (detail: ChangeActionDetail, event: CustomEvent<ChangeActionDetail>) => void;
  onExport?: (detail: ChangeExportDetail) => void;
  onToggle?: (detail: { list: string; item: string; open: boolean }) => void;
  onStateChange?: (state: ChangeListState) => void;
}

/** The API of a change list. */
export interface ChangeListApi {
  readonly element: HTMLElement;
  readonly view: ChangeListDocument;
  readonly ready: Promise<ChangeListApi>;
  getState(): Readonly<ChangeListState>;
  setState(state: Partial<ChangeListState>): void;
  /** Opens, closes or switches an item's details; false for an unknown item. */
  toggle(id: string, open?: boolean): boolean;
  focusItem(id: string): boolean;
  update(view: ChangeListDocument): void;
  destroy(): void;
}

/** Where a change stands at a replica. */
export type PropagationState = "converged" | "propagating" | "fault" | "unknown";

/** The propagation document: `{ protocol: "canopyx/2", type: "propagation" }`. */
export interface PropagationDocument {
  protocol: "canopyx/2";
  type: "propagation";
  id: string;
  label: string;
  /** ISO 8601: when the change happened; the delays count from it. */
  start?: string;
  /** ISO 8601: when the evidence is from. */
  asOf?: string;
  state?: PropagationState;
  summary?: string;
  title?: string;
  /** How a group heading counts its replicas, with {count} and optional plural forms. */
  groupCount?: string;
  witnesses: { id: string; label: string; secondary?: string; state: PropagationState; firstSeen?: string; lastSeen?: string; note?: string; source?: boolean; group?: string }[];
  timeZone?: "utc" | "local";
  labels?: Record<string, string>;
}

/** Options of createPropagation and CanopyX.configure for a propagation fragment. */
export interface PropagationOptions {
  view: PropagationDocument;
  labels?: Record<string, string>;
  onReady?: (detail: { propagation: string }) => void;
}

/** The API of a propagation view. */
export interface PropagationApi {
  readonly element: HTMLElement;
  readonly view: PropagationDocument;
  readonly ready: Promise<PropagationApi>;
  update(view: PropagationDocument): void;
  destroy(): void;
}

/** Creates a text diff in a host element (docs/changes.md). Ships with the grid and reporting entry points. */
export declare function createDiff(host: HTMLElement, options: DiffOptions): DiffApi;
/** Creates a change list in a host element (docs/changes.md). Ships with the grid and reporting entry points. */
export declare function createChangeList(host: HTMLElement, options: ChangeListOptions): ChangeListApi;
/** Creates a propagation view in a host element (docs/changes.md). Ships with the grid and reporting entry points. */
export declare function createPropagation(host: HTMLElement, options: PropagationOptions): PropagationApi;
