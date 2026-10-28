import type { LabelName } from "./protocol.js";

/** An element, or a selector resolving to one element. Context-menu selectors are delegated instead. */
export type UiTarget = HTMLElement | string;
/** Calls made before ready wait for the lazy implementation; after readiness, queries may return synchronously. */
export type UiResult<T> = T | Promise<T>;
/** Host-owned labels override the runtime defaults. */
export type UiLabels = Partial<Record<LabelName, string>>;

/** The public wrapper is stable from creation until destruction, including while its lazy part loads. */
export interface UiController {
  readonly element: HTMLElement;
  /** Resolves to this same wrapper after initialization; rejects on loading failure or destruction before initialization. */
  readonly ready: Promise<this>;
  /** Releases this instance. Repeated calls do nothing; later method calls throw. */
  destroy(): void;
}

/** A record discovered from the declarative markup, passed to navigation hooks. */
export interface UiNavigationItem {
  readonly id: string;
  readonly index: number;
  readonly element: HTMLElement;
  readonly panel?: HTMLElement;
  readonly label: string;
  readonly badge?: string;
  readonly icon?: Node | string;
  readonly disabled: boolean;
  readonly optional: boolean;
  readonly visited: boolean;
}

/** Loader strings are trusted host HTML and pass through CanopyX's canonical HTML/Trusted Types boundary.
 * Print preparation may call loaders for inactive panels with a separate signal; return content without mutating live panels. */
export type UiContentLoader<Item extends UiNavigationItem = UiNavigationItem> =
  (item: Item, signal: AbortSignal) => Node | string | null | void | Promise<Node | string | null | void>;

/** Shared deferred-panel behavior for tabs and steppers. Templates also opt a panel into deferred loading. */
export interface UiDeferredOptions<Item extends UiNavigationItem = UiNavigationItem> {
  deferred?: boolean;
  /** Defaults to true. False disposes deferred content on leave and loads it again on return. */
  keepAlive?: boolean;
  loader?: UiContentLoader<Item>;
}

/** Shared options for navigation over existing declarative markup. Host callbacks may ignore cancellation; stale results never commit. */
export interface UiNavigationOptions<Item extends UiNavigationItem = UiNavigationItem> extends UiDeferredOptions<Item> {
  /** Renders an encoded icon name from the markup into a decorative node or plain text. */
  renderIcon?: (icon: string, item: Partial<Item>) => Node | string | null | void;
  labels?: UiLabels;
  selectedIndex?: number;
  /** Local item identity or zero-based index. selectedIndex takes precedence when supplied. */
  selected?: string | number;
  /** Returning false cancels the leave. Selection remains unchanged while this callback is pending. */
  beforeChange?: (from: Item | undefined, to: Item, signal: AbortSignal) => boolean | void | Promise<boolean | void>;
}

/** Deferred settings for one tab, matched by its data-tab-id. Labels, badges and disabled state come from markup. */
export interface UiTabOptions extends UiDeferredOptions {
  id: string;
}

/** Tabs over the .NET tablist/tabpanel contract. */
export interface UiTabsOptions extends UiNavigationOptions {
  style?: "underline" | "pills" | "segmented" | "vertical";
  overflow?: "scroll" | "menu" | "wrap";
  collapse?: "picker" | "none";
  activation?: "automatic" | "manual";
  print?: "all" | "selected";
  transition?: "none" | "fade" | "slide";
  hash?: boolean;
  hashHistory?: "replace" | "push";
  tabs?: readonly UiTabOptions[];
  /** Optional automatic progression. Manual selection stops it; reduced motion disables it.
   * False disables settings emitted by the .NET builder. */
  autoProgress?: false | {
    /** A positive interval in milliseconds. */
    interval: number;
    /** Suspends the interval while hovered. Defaults to true. */
    pauseOnHover?: boolean;
    /** Suspends the interval while focus is inside. Defaults to true. */
    pauseOnFocus?: boolean;
  };
  /** Enables the development warning when segmented tabs fall back to pills above five items. */
  debug?: boolean;
}

/** Shared navigation methods. Selection identifies items by local identity or zero-based index. */
export interface UiNavigationController extends UiController {
  select(idOrIndex: string | number): Promise<boolean>;
  getSelected(): UiResult<string | null>;
  /** Rediscovers the current markup and updates presentation. */
  refresh(): UiResult<void>;
  /** Prepares deferred print bodies without navigation. Await before window.print(); rejects on load failure or cancellation. */
  preparePrint(): Promise<void>;
}
export interface UiTabsController extends UiNavigationController {}

/** Step states are presentation supplied by the host or by successful navigation and validation. */
export type UiStepState = "upcoming" | "current" | "done" | "error" | "skipped" | "disabled";
export interface UiStepItem extends UiNavigationItem {
  readonly state: UiStepState;
}
export interface UiStepOptions extends UiDeferredOptions<UiStepItem> {
  id: string;
}
/** A false value or a nonempty message array rejects navigation; messages render as a focused alert. */
export type UiStepValidation = boolean | readonly string[] | void;
export interface UiStepperState {
  selected: string | null;
  finished: boolean;
  steps: Array<{ id: string; state: UiStepState; current: boolean; visited: boolean; optional: boolean }>;
}

/** A content wizard, a readable report, or a static progress header. */
export interface UiStepperOptions extends UiNavigationOptions<UiStepItem> {
  mode?: "interactive" | "report" | "static";
  linear?: boolean;
  vertical?: "inline" | "side";
  resetForwardOnBack?: boolean;
  steps?: readonly UiStepOptions[];
  validate?: (step: UiStepItem, signal: AbortSignal) => UiStepValidation | Promise<UiStepValidation>;
  backLabel?: string;
  nextLabel?: string;
  finishLabel?: string;
  skipLabel?: string;
  saveDraftLabel?: string;
  /** False omits Skip even for optional steps. */
  skip?: boolean;
  onSaveDraft?: (state: UiStepperState) => void;
  onFinish?: (state: UiStepperState) => void;
}
export interface UiStepperController extends UiNavigationController {
  next(): Promise<boolean>;
  back(): Promise<boolean>;
  skip(): Promise<boolean>;
  finish(): Promise<boolean>;
  /** Invalid transitions (including skipping a required step) return false. */
  setStepState(id: string, state: UiStepState): UiResult<boolean>;
  getState(): UiResult<UiStepperState>;
}

/** Positioning sides use logical start/end alignment for vertical placements. */
export type UiPlacement = "top" | "bottom" | "left" | "right" | "top-start" | "top-end" | "bottom-start" | "bottom-end";
export interface UiOverlayOpenOptions {
  modal?: boolean;
  /** Viewport coordinates for pointer-anchored menus. */
  point?: { x: number; y: number };
}
export interface UiOverlayOptions {
  trigger?: HTMLElement;
  host?: HTMLElement;
  placement?: UiPlacement;
  dismissible?: boolean;
  modal?: boolean;
  initialFocus?: HTMLElement | ((element: HTMLElement) => HTMLElement | null | undefined);
  focus?: boolean;
}
/** Shared open/close behavior for popovers and tooltips. */
export interface UiOverlayController extends UiController {
  open(options?: UiOverlayOpenOptions): UiResult<boolean>;
  close(reason?: string, restoreFocus?: boolean, force?: boolean): UiResult<boolean>;
}
export interface UiDialogOptions {
  trigger?: HTMLElement;
  host?: HTMLElement;
  /** The container whose width selects the drawer's phone behavior. */
  container?: HTMLElement;
  labels?: UiLabels;
  dismissible?: boolean;
  initialFocus?: HTMLElement | ((element: HTMLElement) => HTMLElement | null | undefined);
}
export interface UiDrawerOptions extends UiDialogOptions {
  modal?: boolean;
  /** Header navigation when focus is outside an editable field. */
  records?: (direction: -1 | 1) => void;
}
export interface UiDialogState { open: boolean; modal: boolean }
export interface UiDialogController extends UiOverlayController {
  /** Dialog modality is fixed; drawer modality comes from its container width and factory options. */
  open(): UiResult<boolean>;
  refresh(): UiResult<void>;
  getState(): UiResult<UiDialogState>;
}

/** Menu decorations and actions use the same item model as context menus. */
export interface UiMenuItem {
  id?: string;
  label?: string;
  kind?: "separator" | "groupLabel" | "grouplabel" | "radio" | "checkbox";
  type?: "separator" | "groupLabel" | "grouplabel" | "radio" | "checkbox";
  /** Checkbox roles are selected by kind/type or by the presence of checked. */
  role?: "menuitemradio";
  icon?: string;
  badge?: string | number;
  shortcut?: string;
  checked?: boolean;
  disabled?: boolean;
  danger?: boolean;
  group?: string;
  items?: readonly UiMenuItem[];
}
export interface UiMenuSelectDetail {
  id: string;
  item: UiMenuItem;
  checked?: boolean;
  element: HTMLElement;
  originalEvent: Event;
}
/** Binds behavior to a menu already rendered in markup; contextMenu supplies its own item DOM. */
export interface UiMenuOptions {
  trigger?: HTMLElement;
  host?: HTMLElement;
  label?: string;
  placement?: UiPlacement;
  bindTrigger?: boolean;
  renderIcon?: (icon: string, item: UiMenuItem) => Node | string | null | void;
  onSelect?: (item: UiMenuItem, event: Event, element: HTMLElement, detail: UiMenuSelectDetail) => void;
}
export interface UiMenuOpenOptions extends UiOverlayOpenOptions {
  focus?: "first" | "last" | "none";
}
export interface UiMenuController extends UiOverlayController {
  open(options?: UiMenuOpenOptions): UiResult<boolean>;
  refresh(): UiResult<void>;
}
export interface UiContextMenuOptions extends UiMenuOptions {
  variant?: string;
}
/** Disposes the binding and any active context menu. ready settles after the lazy binding is installed. */
export interface UiContextMenuDisposer {
  (): void;
  readonly ready: Promise<void>;
}

/** Mounts declarative UI under root (including root). Report/static steppers need no controller and are skipped. */
export function mountUi(root?: ParentNode): UiController[];
/** Delegates a selector, or binds one element. Inputs, links, selected text and Shift+right-click keep their native menu. */
export function contextMenu(target: UiTarget,
  items: readonly UiMenuItem[] | ((event: MouseEvent | KeyboardEvent | PointerEvent, element: HTMLElement) => readonly UiMenuItem[] | null | undefined),
  options?: UiContextMenuOptions): UiContextMenuDisposer;
export function tabs(target: UiTarget, options?: UiTabsOptions): UiTabsController;
export function stepper(target: UiTarget, options?: UiStepperOptions): UiStepperController;
export function dialog(target: UiTarget, options?: UiDialogOptions): UiDialogController;
export function drawer(target: UiTarget, options?: UiDrawerOptions): UiDialogController;
export function popover(target: UiTarget, options?: UiOverlayOptions): UiOverlayController;
export function tooltip(target: UiTarget, options?: UiOverlayOptions): UiOverlayController;
export function menu(target: UiTarget, options?: UiMenuOptions): UiMenuController;

/** Named UI exports shared by tree and grid/reporting entry points. */
export interface UiApi {
  mountUi: typeof mountUi;
  contextMenu: typeof contextMenu;
  tabs: typeof tabs;
  stepper: typeof stepper;
  dialog: typeof dialog;
  drawer: typeof drawer;
  popover: typeof popover;
  tooltip: typeof tooltip;
  menu: typeof menu;
}
