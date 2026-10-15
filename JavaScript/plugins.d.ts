// Plugins and parts: the extension points of every CanopyX runtime (docs/plugins.md).
import type { CanopyNode, CanopyView } from "./protocol.js";
import type { CellContext, ExportFormat } from "./hosts.js";
import type { TreeGrid } from "./index.js";
import type { DataGrid, GridCellContext, GridRow, GridView } from "./grid.js";

/** The kinds of view a plugin can apply to. */
export type CanopyViewKind = "tree" | "grid";

/** What a plugin's lifecycle hooks and event handlers receive, once per grid or tree. Frozen. */
export interface CanopyPluginContext {
  /** The public API of the grid or tree, as createTreeGrid or createDataGrid return it. Narrow it with kind. */
  readonly api: TreeGrid | DataGrid;
  /** The host element. */
  readonly element: HTMLElement;
  /** The view document the grid or tree was created from. */
  readonly view: CanopyView | GridView;
  readonly kind: CanopyViewKind;
  /** The texts the grid writes itself, translations included. */
  readonly labels: Readonly<Record<string, string>>;
  /** Aborts when the grid or tree is destroyed; put listeners, timers and requests on it. */
  readonly signal: AbortSignal;
  /** Loads a part of the runtime by name (for example "export") and resolves once it is installed. */
  part(name: string): Promise<void>;
}

/**
 * Draws a cell of a column whose renderer field names it. The same contract as a host renderer: return true when the
 * renderer drew the cell (a tree), or draw into element (a flat grid); a host renderer for the column wins.
 */
export type CanopyCellRenderer =
  | ((node: CanopyNode, element: HTMLElement, context: CellContext) => boolean)
  | ((row: GridRow, element: HTMLElement, context: GridCellContext) => boolean | void);

/** Typed cell editors that editable flat-grid columns choose by name (docs/editing.md). */
export type { CanopyCellEditor, CanopyEditorContext, CanopyEditorInstance } from "./editing.js";

/** Reserved for named column types: plugins can register them now, and later features read them. */
export interface CanopyColumnType { readonly [key: string]: unknown; }

/** What a plugin's toolbar item or menu entry runs with: the host action context (the selected nodes of a tree, or a grid's query) and the API. */
export interface CanopyPluginItemContext {
  readonly signal: AbortSignal;
  readonly api: TreeGrid | DataGrid;
  /** Trees: the selected nodes. */
  readonly nodes?: CanopyNode[];
  /** Flat grids: the accepted query. */
  readonly query?: unknown;
}

/** A toolbar button or a more-menu entry. A menu entry on the reporting runtime can render content instead of running. */
export type CanopyPluginItem =
  | { label: string; run(context: CanopyPluginItemContext): unknown; render?: never }
  | { label: string; render(container: HTMLElement, context: { close(): void; signal: AbortSignal }): void; run?: never };

/** A handler for a canopyx:<name> event on the host element; call preventDefault on cancelable events to keep the default. */
export type CanopyPluginEventHandler = (event: CustomEvent, context: CanopyPluginContext) => void;

/**
 * A plugin: a named bundle of lifecycle hooks and extension points. Register it for the page with CanopyX.use, or for one
 * grid with the plugins option. Every member except name is optional.
 */
export interface CanopyPlugin {
  /** 1 to 32 lowercase ASCII letters, digits and hyphens, starting with a letter; unique on the page. */
  readonly name: string;
  /** Plugins that start first, and parts of the runtime (for example "export") that load before init. */
  readonly requires?: readonly string[];
  /** The view kinds the plugin applies to; absent means both. */
  readonly views?: readonly CanopyViewKind[];
  /** Runs once per grid or tree, after its required parts loaded; the grid's ready waits for a returned promise. */
  init?(context: CanopyPluginContext): void | PromiseLike<void>;
  /** Runs when the grid or tree is destroyed. */
  destroy?(context: CanopyPluginContext): void;
  /** Cell renderers by name; a column chooses one with its renderer field. */
  readonly cellRenderers?: Readonly<Record<string, CanopyCellRenderer>>;
  /** Reserved: named column types. */
  readonly columnTypes?: Readonly<Record<string, CanopyColumnType>>;
  /** Typed cell editors by name; an editable flat-grid column chooses one with its editor type. */
  readonly editors?: Readonly<Record<string, import("./editing.js").CanopyCellEditor>>;
  /** Buttons in the toolbar's left-hand group, after Columns and before Views. */
  readonly toolbarItems?: readonly CanopyPluginItem[];
  /** Entries of the more menu, after the host's actions. */
  readonly menuItems?: readonly CanopyPluginItem[];
  /** Export formats: registered for the page by CanopyX.use, offered by the one grid for the plugins option. */
  readonly exportFormats?: readonly ExportFormat<any>[];
  /** Handlers by event name without the canopyx: prefix (select, query, load, error, rowActivate, ...). */
  readonly events?: Readonly<Record<string, CanopyPluginEventHandler>>;
}

/** The code of a part of the runtime, as its script registers it. */
export interface CanopyPartDefinition {
  /** The build version; a runtime installs only the part of its own build. */
  readonly version: string;
  /** Parts that load, and install, before this one. */
  readonly requires?: readonly string[];
  /** Installs the part into the runtime context it is given. */
  install(context: Readonly<Record<string, unknown>>): void;
}
