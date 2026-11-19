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
  /** Remembers the selected tab in localStorage, under the root id (true) or this key. A link in the address wins. */
  remember?: boolean | string;
  /** Horizontal tabs share the full width equally. */
  justified?: boolean;
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
export interface UiTabsController extends UiNavigationController {
  /** Selects the next or previous enabled tab, stopping at the ends. Resolves false when there is none. */
  next(): Promise<boolean>;
  back(): Promise<boolean>;
  /**
   * Sets a tab's badge in the tab and its panel heading: text, a count in the page language's number format, or null
   * (or "") to remove it. The badge is part of the tab's accessible name. False when there is no such tab.
   */
  setBadge(idOrIndex: string | number, badge: string | number | null): UiResult<boolean>;
}

/** An accordion section. In beforeChange, open is the state being requested. */
export interface UiAccordionItem extends UiNavigationItem {
  readonly open: boolean;
}
/** Deferred settings for one section, matched by its data-accordion-id. */
export interface UiAccordionSectionOptions extends UiDeferredOptions<UiAccordionItem> {
  id: string;
}
/** Accordion over the .NET heading and panel contract. Each section loads on its own; closing one aborts its pending loader. */
export interface UiAccordionOptions extends UiDeferredOptions<UiAccordionItem> {
  /** Lets several sections stay open. Defaults to false: opening a section closes the open one. */
  multiple?: boolean;
  /** Section identities or indexes to open, instead of the markup's own. A link in the address and remembered state win over this. */
  open?: readonly (string | number)[];
  style?: "default" | "flush" | "separated" | "section";
  indicator?: "chevron" | "plus";
  indicatorPosition?: "end" | "start";
  transition?: "none" | "slide";
  print?: "all" | "selected";
  /** Writes open sections to the address as repeated `root-id=section-id` pairs. Requires a root id. */
  hash?: boolean;
  hashHistory?: "replace" | "push";
  /** Remembers open sections in localStorage, under the root id (true) or this key. */
  remember?: boolean | string;
  /** A filter box above the sections. Filtering hides sections without closing them.
   * It reads the header text; `or`, `|`, quoted phrases and a leading `-` or `!` are understood. */
  search?: boolean | {
    placeholder?: string;
    /** Delay after typing, in milliseconds. Defaults to 150. */
    debounce?: number;
  };
  /** Adds a copy-title button to every section, or removes the ones the markup asks for. */
  copyTitle?: boolean;
  /** Renders an encoded icon name from the markup into a decorative node or plain text. */
  renderIcon?: (icon: string, item: Partial<UiAccordionItem>) => Node | string | null | void;
  labels?: UiLabels;
  sections?: readonly UiAccordionSectionOptions[];
  /** Returning false cancels. In a single-open accordion from is the section that would close; to.open is the requested state. */
  beforeChange?: (from: UiAccordionItem | undefined, to: UiAccordionItem, signal: AbortSignal) => boolean | void | Promise<boolean | void>;
}
export interface UiAccordionController extends UiController {
  open(idOrIndex: string | number): Promise<boolean>;
  close(idOrIndex: string | number): Promise<boolean>;
  toggle(idOrIndex: string | number): Promise<boolean>;
  /** The open section identities in display order. */
  getOpen(): UiResult<string[]>;
  /** Filters sections by header text and returns how many remain visible. An empty query shows all. */
  filter(query?: string): UiResult<number>;
  /** Rediscovers the current markup and updates presentation. */
  refresh(): UiResult<void>;
  /** Prepares deferred print bodies without opening sections. Await before window.print(); rejects on load failure or cancellation. */
  preparePrint(): Promise<void>;
}

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
/** Body content: a node, or HTML the host trusts. */
export type UiContent = Node | string;
/** Loads body content; a newer opening aborts the signal and ignores the late result. */
export type UiBodyLoader = (signal: AbortSignal) => UiContent | null | undefined | Promise<UiContent | null | undefined>;
/** An overlay's address in the browser history. */
export interface UiOverlayHistory {
  url: string | URL;
  /** False replaces the current address and restores it on closing. Defaults to true. */
  push?: boolean;
  /** When the page was opened on `url`, the address below the overlay's entry, so Back stays on the page. */
  base?: string | URL;
}
export interface UiDialogOptions {
  trigger?: HTMLElement;
  host?: HTMLElement;
  /** The container whose width selects the drawer's phone behavior. */
  container?: HTMLElement;
  labels?: UiLabels;
  dismissible?: boolean;
  initialFocus?: HTMLElement | ((element: HTMLElement) => HTMLElement | null | undefined);
  /** Loads the body on the first opening; refresh() runs it again. */
  loader?: UiBodyLoader;
  /** The address of every opening; a page loaded on it opens the overlay. */
  history?: UiOverlayHistory;
}
export interface UiDrawerOptions extends UiDialogOptions {
  modal?: boolean;
  /** Previous and Next header buttons, and Up and Down when focus is outside an editable field. */
  records?: (direction: -1 | 1) => void;
}
/** One opening of a dialog or drawer. On an open overlay these replace what it shows without closing it. */
export interface UiDialogOpenOptions extends UiOverlayOpenOptions {
  /** The element focused when the overlay closes, instead of its trigger or the focused element. */
  returnFocus?: HTMLElement;
  content?: UiContent;
  loader?: UiBodyLoader;
  history?: UiOverlayHistory;
  /** The "n of N" label beside the record buttons; the buttons are disabled at the ends. */
  position?: { current: number; total: number };
}
export interface UiDialogState { open: boolean; modal: boolean; loading: boolean }
export interface UiDialogController extends UiOverlayController {
  /** Dialog modality is fixed; drawer modality comes from its container width and factory options. */
  open(options?: UiDialogOpenOptions): UiResult<boolean>;
  /** Replaces the body and cancels a pending load. */
  setContent(content: UiContent): UiResult<void>;
  /** Runs the current loader again; resolves false without a loader or on failure. */
  refresh(): UiResult<Promise<boolean>>;
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

/** Tone names shared with cells and badges; a host tone reads its colour from --hfx-color-status-<name>-fg. */
export type UiToastTone = "neutral" | "info" | "success" | "warning" | "danger" | "muted" | (string & {});
/** A toast action: a host callback, or a link (which suits a server-pushed toast). Selecting it closes the toast unless close is false. */
export interface UiToastAction {
  id?: string;
  label: string;
  href?: string;
  onSelect?: (detail: { id: string; action: string; event: MouseEvent }) => void;
  close?: boolean;
}
/** A toast. Showing an id that is already shown or queued updates that toast in place and restarts its timeout. */
export interface UiToastOptions {
  id?: string;
  tone?: UiToastTone;
  title?: string;
  /** Plain text; required unless content is given. */
  message?: string;
  /** A Node, or trusted host HTML, shown instead of the message. */
  content?: Node | string;
  /** Milliseconds before it closes; 0 keeps it. Defaults to the region's timeout, or 0 for danger and toasts with actions. */
  timeout?: number;
  actions?: readonly UiToastAction[];
  /** Defaults to true: a Dismiss button, and Escape inside the toast. */
  dismissible?: boolean;
  onClose?: (detail: { id: string; reason: "timeout" | "close" | "action" | "api" | "clear" }) => void;
}
export type UiToastPosition = "top-start" | "top-center" | "top-end" | "bottom-start" | "bottom-center" | "bottom-end";
export interface UiToastsOptions {
  /** Defaults to bottom-end. */
  position?: UiToastPosition;
  /** Toasts shown at once, 1 to 10; the rest wait in order. Defaults to 3. */
  max?: number;
  /** The default timeout in milliseconds, 0 to 600000. Defaults to 5000. */
  timeout?: number;
  labels?: UiLabels;
}
export interface UiToastsController extends UiController {
  /** Shows or updates a toast and returns its id. */
  show(toast: UiToastOptions | string): UiResult<string>;
  close(id: string): UiResult<boolean>;
  clear(): UiResult<void>;
  getState(): UiResult<{ visible: string[]; queued: string[] }>;
}

/** An item a lightbox shows: an image, a frame (a page or PDF), a video file, a YouTube video (address or id) or content (a Node, trusted host HTML or a function returning one). */
export interface UiLightboxItem {
  id?: string;
  type?: "image" | "frame" | "content" | "video" | "youtube";
  src?: string;
  /** The image a video shows before it plays. */
  poster?: string;
  /** A video or YouTube item starts playing, muted, when the viewer shows it. */
  autoplay?: boolean;
  alt?: string;
  caption?: string;
  content?: Node | string | (() => Node | string | null);
}
export interface UiLightboxOptions {
  /** Items to show instead of the root's [data-lightbox-item] links. */
  items?: readonly UiLightboxItem[];
  /** Moving past the last item returns to the first. Defaults to false. */
  loop?: boolean;
  labels?: UiLabels;
}
export interface UiLightboxController extends UiController {
  /** Opens the viewer at an index or item id. */
  open(item?: number | string, options?: { returnFocus?: HTMLElement }): UiResult<boolean>;
  close(): UiResult<boolean>;
  next(): UiResult<boolean>;
  back(): UiResult<boolean>;
  /** Sets the zoom of the current image, 1 (fitted) to 4, and returns the zoom applied. */
  zoom(level: number): UiResult<number>;
  getState(): UiResult<{ open: boolean; index: number; total: number; zoom: number }>;
}

export interface UiCarouselOptions {
  /** Slides shown at once, 1 to 6; narrow screens show one. */
  perView?: number;
  /** Moving past the last slide returns to the first. Defaults to false. */
  loop?: boolean;
  /** The zero-based slide shown first. */
  selected?: number;
  /** Off unless given: slides move every interval milliseconds, with a Pause button, pausing on hover and focus, never under reduced motion. */
  autoplay?: false | { interval: number; start?: boolean };
  /** "fade" stacks the slides and fades between them, one per view. Defaults to "slide". */
  transition?: "slide" | "fade";
  /** Where Previous and Next sit. Defaults to "below". */
  controls?: "below" | "above" | "sides";
  /** Where the slide picker sits, or "hidden". Defaults to "controls" (between Previous and Next). */
  indicators?: "controls" | "above" | "below" | "hidden";
  /** Where .cx-carousel-caption paragraphs in slides show. Defaults to "overlay". */
  captions?: "overlay" | "below";
  labels?: UiLabels;
}
export interface UiCarouselController extends UiController {
  select(index: number): UiResult<boolean>;
  next(): UiResult<boolean>;
  back(): UiResult<boolean>;
  play(): UiResult<boolean>;
  pause(): UiResult<boolean>;
  /** Reads the slides again after the host changed them. */
  refresh(): UiResult<void>;
  getState(): UiResult<{ index: number; total: number; visible: number; playing: boolean }>;
}

export interface UiRatingOptions {
  /** Steps, 2 to 10; read from data-max, else 5. */
  max?: number;
  value?: number | null;
  /** Choosing the current value again, or Delete, clears it. Defaults to true. */
  clearable?: boolean;
  /** For an empty element: the radio group's form name and accessible name. */
  name?: string;
  label?: string;
  onChange?: (value: number | null) => void;
  labels?: UiLabels;
}
export interface UiRatingController extends UiController {
  /** Sets the value (null clears a clearable rating); returns whether it changed. */
  select(value: number | null): UiResult<boolean>;
  clear(): UiResult<boolean>;
  getState(): UiResult<{ value: number | null; max: number }>;
}

export interface UiMaskOptions {
  /** A preset (ipv4, mac, guid, date, time, time-seconds, date-time, postcode, credit-card) or a pattern: 0 digit, a letter, A upper-case letter, h hex digit, * letter or digit, \\ literal. */
  mask?: string;
  placeholder?: string;
  onChange?: (state: { text: string; raw: string; complete: boolean }) => void;
}
export interface UiMaskController extends UiController {
  /** Sets the value, fitted to the mask; returns the formatted text. */
  select(value: string | null): UiResult<string>;
  refresh(): UiResult<void>;
  getState(): UiResult<{ text: string; raw: string; complete: boolean }>;
}
/** A signature: an SVG document and a PNG data URI of the same picture. */
export interface UiSignatureValue { readonly svg: string; readonly png: string }
export interface UiSignatureOptions {
  /** The form field name of a hidden input holding the answer. */
  name?: string;
  /** What the hidden input holds. Defaults to svg. */
  format?: "svg" | "png";
  ink?: string;
  background?: string;
  /** A pen colour button. */
  colours?: boolean;
  /** PNG and SVG download buttons; a text names the files. */
  download?: boolean | string;
  readOnly?: boolean;
  value?: UiSignatureValue;
  /** The pad's accessible name. */
  label?: string;
  onChange?: (value: UiSignatureValue | null) => void;
  labels?: UiLabels;
}
export interface UiSignatureController extends UiController {
  select(value: UiSignatureValue | null): UiResult<void>;
  clear(): UiResult<void>;
  focus(): UiResult<void>;
  getState(): UiResult<{ value: UiSignatureValue | null }>;
}

/** Mounts declarative UI under root (including root). Report/static steppers need no controller and are skipped. */
export function mountUi(root?: ParentNode): UiController[];
/** Delegates a selector, or binds one element. Inputs, links, selected text and Shift+right-click keep their native menu. */
export function contextMenu(target: UiTarget,
  items: readonly UiMenuItem[] | ((event: MouseEvent | KeyboardEvent | PointerEvent, element: HTMLElement) => readonly UiMenuItem[] | null | undefined),
  options?: UiContextMenuOptions): UiContextMenuDisposer;
export function tabs(target: UiTarget, options?: UiTabsOptions): UiTabsController;
export function stepper(target: UiTarget, options?: UiStepperOptions): UiStepperController;
export function accordion(target: UiTarget, options?: UiAccordionOptions): UiAccordionController;
/** A notification region over [data-cx-toasts] markup or an empty element. */
export function toasts(target: UiTarget, options?: UiToastsOptions): UiToastsController;
/** Shows a toast in the page's first [data-cx-toasts] region, creating one at the end of the body when there is none. Resolves to its id. */
export function notify(toast: UiToastOptions | string): Promise<string>;
/** A gallery viewer over [data-lightbox-item] links, or over items the host passes. */
export function lightbox(target: UiTarget, options?: UiLightboxOptions): UiLightboxController;
/** A live mask on a text input, or on the first text input inside the target. */
export function mask(target: UiTarget, options?: UiMaskOptions): UiMaskController;
/** A signature pad in an empty element. */
export function signature(target: UiTarget, options?: UiSignatureOptions): UiSignatureController;
/** Slides of any content over a .cx-carousel-track list. */
export function carousel(target: UiTarget, options?: UiCarouselOptions): UiCarouselController;
/** Stars over a native radio group, or a group it builds in an empty element. */
export function rating(target: UiTarget, options?: UiRatingOptions): UiRatingController;
export function dialog(target: UiTarget, options?: UiDialogOptions): UiDialogController;
export function drawer(target: UiTarget, options?: UiDrawerOptions): UiDialogController;
export function popover(target: UiTarget, options?: UiOverlayOptions): UiOverlayController;
export function tooltip(target: UiTarget, options?: UiOverlayOptions): UiOverlayController;
export function menu(target: UiTarget, options?: UiMenuOptions): UiMenuController;

/** Named UI exports shared by the tree, grid, reporting and UI entry points. */
export interface UiApi {
  mountUi: typeof mountUi;
  contextMenu: typeof contextMenu;
  notify: typeof notify;
  tabs: typeof tabs;
  stepper: typeof stepper;
  accordion: typeof accordion;
  toasts: typeof toasts;
  lightbox: typeof lightbox;
  mask: typeof mask;
  signature: typeof signature;
  carousel: typeof carousel;
  rating: typeof rating;
  dialog: typeof dialog;
  drawer: typeof drawer;
  popover: typeof popover;
  tooltip: typeof tooltip;
  menu: typeof menu;
}

/** The UI entry point (`@evotecit/canopyx/ui`): the UI factories, the part registration and the nonce setter. */
declare const CanopyXUi: UiApi & { registerPart(name: string, part: { version: string; requires?: string[]; install(context: object): void }): void; setNonce(nonce: string): void };
export default CanopyXUi;
