// The calendar of flat grids (docs/calendar.md, docs/resource-timeline.md): month, week, day, N days, agenda, year and the
// resource timeline over the grid's own records, with the grid's query, record panel, linked views, facets, live data and editing.
import type { InlineView, RemoteView } from "./protocol.js";
import type { GridRow, GridColumnId, GridQuery } from "./grid.js";
import type { GridLiveDefinition } from "./live.js";
import type { GridFacetPanelDefinition } from "./facets.js";

/** The views a calendar offers. */
/** mini: a small month like a date picker; weekList and dayList: each day's events as a list; months: stacked months that scroll. */
export type GridCalendarView = "month" | "week" | "day" | "days" | "agenda" | "year" | "timeline" | "mini" | "weekList" | "dayList" | "months";

/** The grid toolbar controls a calendar may show above itself. */
export type GridCalendarToolbarItem = "search" | "filters" | "columns" | "views" | "export" | "more";

/** An event source with a legend switch; ics names a same-origin iCalendar file whose events join read-only. */
export interface GridCalendarSource {
  id: string;
  label: string;
  tone?: string;
  ics?: string;
  /** Starts switched off. */
  hidden?: boolean;
}
/** The resource timeline's zoom levels. */
export type GridCalendarZoom = "hour" | "day" | "week" | "month" | "quarter";
/** A time of day, "HH:mm" (24:00 allowed for an end). */
export type GridCalendarTime = `${number}:${number}`;
/** A weekday, 0 (Sunday) to 6 (Saturday). */
export type GridCalendarWeekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** Editing a calendar: moving, resizing and dragging across resources through the grid's editing contract. */
export interface GridCalendarEditing<Row extends GridRow = GridRow> {
  /** Events move (default true). */
  move?: boolean;
  /** Events change their start or end (default true; needs an end column). */
  resize?: boolean;
  /** Events move across resources in the timeline and resource columns (default true; needs a resource column). */
  resources?: boolean;
  /** Events may overlap on one resource (default true); false refuses a drop that overlaps. */
  overlap?: boolean;
  /** Events stay inside working hours, the resource's business hours and outside unavailable time (default false). */
  workingHours?: boolean;
  /** A text column of comma-separated resource ids each record may move to. */
  allowedResources?: GridColumnId<Row>;
  /** Minutes a drag snaps to: 1, 5, 10, 15, 20, 30 or 60 (default slotMinutes). */
  snapMinutes?: 1 | 5 | 10 | 15 | 20 | 30 | 60;
  /** "auto" (default) commits each drop through commitChanges; "manual" leaves changes for the edit bar. */
  commit?: "auto" | "manual";
}

/** The resources of the timeline and of resource columns: an ordinary CanopyX tree, with aggregates in its columns. */
export interface GridCalendarResources {
  /** A tree view document (inline roots, or a remote source with lazy children); node ids are resource ids. */
  view: InlineView | RemoteView;
  /** The resource pane's width, 120..800 pixels (default 280). */
  width?: number;
  /** The heading of the resource pane in print. */
  label?: string;
  /** Tree column ids filled with each resource's (and group's) event count, busy hours or overlap count. */
  aggregates?: Readonly<Record<string, "count" | "busy" | "overlap">>;
}

/** A background range: a holiday, a freeze, a maintenance window, or time a resource is unavailable. */
export interface GridCalendarRange {
  start: string;
  end: string;
  label: string;
  tone?: string;
  /** A resource id; absent covers every resource. */
  resource?: string;
  kind?: "background" | "unavailable";
  /** An RRULE (the calendar's subset) the range repeats by. */
  recurrence?: string;
  /** Shades the time outside the range (outside the union of the inverse ranges of the same resource, or the global ones); the label names the shaded time. */
  inverse?: boolean;
}

/** The calendar field of a grid definition (the C# CanopyCalendar writes it). Columns are the grid's own column ids. */
export interface GridCalendarDefinition<Row extends GridRow = GridRow> {
  /** The date column with each event's start (required). */
  start: GridColumnId<Row>;
  end?: GridColumnId<Row>;
  title?: GridColumnId<Row>;
  subtitle?: GridColumnId<Row>;
  /** A text column holding booleans: true makes an all-day event (dates read as UTC dates, the end exclusive). */
  allDay?: GridColumnId<Row>;
  /** A text column with the event's resource id (a node id of resources.view). */
  resource?: GridColumnId<Row>;
  /** The column whose presenter draws the event's status; its tone colours the event. */
  status?: GridColumnId<Row>;
  /** A text column with an RRULE (FREQ DAILY, WEEKLY, MONTHLY or YEARLY with INTERVAL, COUNT, UNTIL, BYDAY, BYMONTHDAY, BYMONTH, BYSETPOS, WKST). */
  recurrence?: GridColumnId<Row>;
  /** A text column of EXDATE values separated by commas, semicolons or white space (at most 1,000): instants with Z or an offset, wall times in the series zone, or yyyy-MM-dd dates. */
  exceptions?: GridColumnId<Row>;
  /** With recurrenceId: the id of the series an overriding record replaces an occurrence of. */
  series?: GridColumnId<Row>;
  /** With series: the original start of the replaced occurrence. */
  recurrenceId?: GridColumnId<Row>;
  /** A text column; "background" draws the record as a background range. */
  display?: GridColumnId<Row>;
  /** The end of a series' last occurrence (null for endless), which servers read to find series in a range. */
  seriesEnd?: GridColumnId<Row>;
  view?: GridCalendarView;
  views?: readonly GridCalendarView[];
  /** The first date shown, yyyy-MM-dd (default today). */
  date?: string;
  /** Days of the "days" view, 2..14 (default 3). */
  days?: number;
  firstDay?: GridCalendarWeekday;
  hiddenDays?: readonly GridCalendarWeekday[];
  slotMinutes?: 5 | 10 | 15 | 20 | 30 | 60;
  minTime?: GridCalendarTime;
  maxTime?: GridCalendarTime;
  scrollTime?: GridCalendarTime;
  workingHours?: { days?: readonly GridCalendarWeekday[]; start: GridCalendarTime; end: GridCalendarTime };
  nowIndicator?: boolean;
  /** Events per month cell before "+N more", 1..20, or "auto" from the row height (default). */
  eventLimit?: number | "auto";
  eventStyle?: "quiet" | "strong";
  /** "utc", "local" or an IANA zone; the grid's timeZone by default. An IANA zone is also the zone recurring series expand in (otherwise UTC). */
  timeZone?: string;
  /** true, or the editing settings; absent leaves the calendar read-only. */
  editable?: boolean | GridCalendarEditing<Row>;
  resources?: GridCalendarResources;
  zoom?: GridCalendarZoom;
  zooms?: readonly GridCalendarZoom[];
  /** Concurrency thresholds of group lanes, rising: { at, tone }. */
  capacity?: { thresholds: readonly { at: number; tone: string }[]; label?: string };
  ranges?: readonly GridCalendarRange[];
  /** Business hours per resource (no resource: every resource). */
  availability?: readonly { resource?: string; days?: readonly GridCalendarWeekday[]; start: GridCalendarTime; end: GridCalendarTime }[];
  /** Occurrences one range shows, 1..100000 (default 20000). */
  limit?: number;
  /** The view phones start in. */
  phone?: GridCalendarView;
  /** Which grid toolbar controls show: true (all, default), false (calendar controls only) or a list. */
  toolbar?: boolean | readonly GridCalendarToolbarItem[];
  /** What activating an event opens: the record drawer (default) or a small details popover. */
  details?: "drawer" | "popover";
  /** A text column with the event's description (popover, hover card). */
  description?: GridColumnId<Row>;
  /** A text column with each record's tone name; wins over the status tone. */
  tone?: GridColumnId<Row>;
  /** A text column with each record's source id (see sources). */
  source?: GridColumnId<Row>;
  /** 1..50 event sources with a legend; requires source unless every source has ics. */
  sources?: readonly GridCalendarSource[];
  /** Creating events by click, drag over slots or days, Enter or N; minutes (5..1440, default 60) is a clicked slot's length. */
  create?: boolean | { minutes?: number; allDay?: boolean };
  /** Accepts rows dragged from a grid whose view has dragRows, and elements marked data-canopyx-event. */
  drop?: boolean;
  /** What moving an occurrence of a series changes; this and following need series and recurrenceId. Default ask with them, else all. */
  occurrence?: "ask" | "this" | "following" | "all";
  weekNumbers?: false | "iso" | "locale";
  /** Day names and numbers open that day (default true). */
  navLinks?: boolean;
  /** yyyy-MM-dd, start inclusive, end exclusive: navigation, selection, creation and drops stay inside. */
  validRange?: { start?: string; end?: string };
  /** The month always shows six weeks. */
  fixedWeeks?: boolean;
  /** The month shows the days of the months around it (default true). */
  outsideDays?: boolean;
  /** The timeline's span instead of the zoom's default. */
  span?: { count: number; unit: "day" | "week" | "month" };
  /** Context menus on events, slots, days and timeline cells (default true). */
  menu?: boolean;
  /** A delayed hover card on pointer devices (default true). */
  hover?: boolean;
  /** The year view lists each day's events instead of shading only. */
  yearEvents?: boolean;
  /** The agenda's period (default month). */
  agendaSpan?: "day" | "week" | "month" | "year";
  /** Months of the stacked months view, 2..24 (default 6). */
  months?: number;
  /** A print button in the calendar bar. */
  print?: boolean;
}

/** An occurrence as the calendar shows it. */
export interface GridCalendarEvent {
  /** The record id, or record@start for an occurrence of a series. */
  readonly id: string;
  readonly record: string;
  readonly start: string;
  readonly end: string;
  readonly allDay: boolean;
  readonly title: string;
  readonly resource: string | null;
  readonly recurring: boolean;
  readonly background?: boolean;
  /** The event's source id (sources), or null. */
  readonly source?: string | null;
  /** An event of an iCalendar source: read-only, and its record id is not a record of the grid. */
  readonly external?: boolean;
}

/** The template hook: draws an event's content into a fresh element; return true to own it. Text is the host's to escape. */
export type GridCalendarTemplate = (context: {
  readonly event: GridCalendarEvent;
  readonly row: GridRow;
  readonly element: HTMLElement;
  readonly kind: "bar" | "chip" | "block" | "item" | "lane";
  readonly labels: Readonly<Record<string, string>>;
}) => boolean | void;

/** What a context menu is about. */
export interface GridCalendarMenuContext {
  readonly kind: "event" | "slot" | "day" | "resource";
  readonly event?: GridCalendarEvent;
  /** yyyy-MM-dd of a slot, day or timeline cell. */
  readonly day?: string;
  /** Minutes after midnight of a slot; null for a day. */
  readonly minutes?: number | null;
  readonly resource?: string | null;
}
/** A context menu item: a default (open, move, new) kept by id, or the host's own with a label and run. */
export interface GridCalendarMenuItem {
  id?: string | null;
  label?: string;
  run?: (context: GridCalendarMenuContext) => unknown;
  disabled?: boolean;
}

/** The host's calendar options. */
export interface GridCalendarOptions {
  render?: GridCalendarTemplate;
  /** Changes a context menu: return the items to show, null or false for none (the browser's menu stays), or nothing to keep the defaults. */
  menu?: (context: GridCalendarMenuContext, defaults: readonly { readonly id: string; readonly label: string }[]) => readonly GridCalendarMenuItem[] | null | false | void;
  /** Decides how an occurrence change applies before the calendar asks: a mode, false to cancel, or nothing to keep the setting. */
  occurrence?: (change: GridOccurrenceChange) => "this" | "following" | "all" | false | void | PromiseLike<"this" | "following" | "all" | false | void>;
}

/** canopyx:eventCreate (cancelable; cancel it to open your own form): the proposed new event. */
export interface GridEventCreate {
  readonly start: string;
  readonly end: string;
  readonly allDay: boolean;
  readonly resource: string | null;
}
/** canopyx:eventReceive (cancelable): an item dropped on the calendar and where it lands. */
export interface GridEventReceive extends GridEventCreate {
  readonly item: { readonly source: "grid" | "element"; readonly view?: string; readonly id: string | null; readonly title: string; readonly minutes: number | null; readonly allDay: boolean; readonly cells: Readonly<Record<string, string | number | boolean | null>> };
}

/** A basic calendar's event: no grid schema to write. A yyyy-MM-dd start makes an all-day event. */
export interface CalendarEventInput {
  id?: string;
  title: string;
  start: Date | string;
  end?: Date | string | null;
  allDay?: boolean;
  description?: string;
  tone?: string;
  resource?: string;
  recurrence?: string;
  exceptions?: string;
  source?: string;
}
/** The options of CanopyX.createCalendar: a preset's defaults, each overridden by its own option. */
export interface CalendarOptions {
  events?: readonly CalendarEventInput[];
  /** basic (default): calendar controls only, read-only, a details popover; standard: search, filters and export; scheduler: editing, creating, the drawer and with resources the timeline. */
  preset?: "basic" | "standard" | "scheduler";
  id?: string;
  label?: string;
  views?: readonly GridCalendarView[];
  view?: GridCalendarView;
  date?: string;
  timeZone?: string;
  firstDay?: GridCalendarWeekday;
  toolbar?: boolean | readonly GridCalendarToolbarItem[];
  details?: "drawer" | "popover";
  /** true opens the record drawer, false the popover. */
  drawer?: boolean;
  /** Adds the Export control to a calendar without a toolbar. */
  export?: boolean;
  editable?: boolean | GridCalendarEditing;
  create?: boolean | { minutes?: number; allDay?: boolean };
  drop?: boolean;
  print?: boolean;
  sources?: readonly GridCalendarSource[];
  /** A resource tree document, or a list of { id, label, parent? }. */
  resources?: readonly { id: string; label?: string; parent?: string | null }[] | InlineView | RemoteView;
  timeline?: boolean;
  live?: boolean | GridLiveDefinition;
  facets?: readonly string[] | GridFacetPanelDefinition;
  links?: boolean;
  /** Any other calendar key, applied last; its functions (render, menu, occurrence) are the host's calendar hooks. */
  calendar?: Omit<Partial<GridCalendarDefinition>, "menu" | "occurrence"> & Omit<GridCalendarOptions, "menu" | "occurrence"> &
    { menu?: boolean | GridCalendarOptions["menu"]; occurrence?: GridCalendarDefinition["occurrence"] | GridCalendarOptions["occurrence"] };
  [hostOption: string]: unknown;
}

/** The calendar's state, from getCalendar() and the canopyx:calendar event. */
export interface GridCalendarState {
  readonly view: GridCalendarView;
  readonly date: string;
  readonly zoom: GridCalendarZoom;
  readonly from: string;
  readonly to: string;
  readonly timeZone: string;
  readonly events: number;
  readonly collapsed: readonly string[];
}

/** The calendar part of the grid state (saved views keep it). */
export interface GridCalendarSavedState {
  view: GridCalendarView;
  date: string | null;
  zoom: GridCalendarZoom;
  collapsed?: string[];
}

/** canopyx:occurrenceChange: moving one occurrence of a series; cancel it to keep the series and handle the occurrence yourself. */
export interface GridOccurrenceChange {
  readonly id: string;
  readonly occurrence: string;
  readonly start: string;
  readonly end: string;
  readonly resource: string | null;
}

/** The request a hosted source's range capability receives for the visible range. */
export interface GridRangeQuery<Q extends GridQuery = GridQuery> {
  readonly protocol: "canopyx/2"; readonly type: "gridRangeQuery"; readonly view: string;
  readonly query: Q;
  readonly from: string; readonly to: string;
  readonly start: string; readonly end?: string; readonly recurrence?: string; readonly seriesEnd?: string; readonly resource?: string;
  readonly resources?: readonly string[];
  readonly calendarView?: GridCalendarView;
  readonly limit: number;
}
/** The answer to a range query: the overlapping records, ordered by start. */
export interface GridRangePage<Row extends GridRow = GridRow> {
  readonly protocol: "canopyx/2"; readonly type: "gridRangePage"; readonly view: string; readonly revision: string;
  readonly from: string; readonly to: string;
  readonly matched: number; readonly truncated: boolean;
  readonly items: readonly Row[];
}
/** A hosted source that answers range queries (CanopyX.AspNetCore maps POST {pattern}/range). */
export interface GridRangeSource<Row extends GridRow = GridRow> {
  range?(request: GridRangeQuery, options: { signal: AbortSignal }): GridRangePage<Row> | PromiseLike<GridRangePage<Row>>;
}

/** Calendar methods of a flat grid; each loads the calendar part first. */
export interface GridCalendarApi {
  getCalendar(): GridCalendarState | Promise<GridCalendarState>;
  setCalendarView(view: GridCalendarView): Promise<GridCalendarState>;
  /** yyyy-MM-dd */
  setCalendarDate(date: string): Promise<GridCalendarState>;
  setCalendarZoom(zoom: GridCalendarZoom): Promise<GridCalendarState>;
  calendarStep(direction: 1 | -1): Promise<GridCalendarState>;
  calendarToday(): Promise<GridCalendarState>;
  getCalendarEvents(): readonly GridCalendarEvent[] | Promise<readonly GridCalendarEvent[]>;
  /** iCalendar text of the visible events (default) or of the grid's export scopes. */
  exportCalendar(options?: { scope?: "visible" | "filtered" | "selected" | "all"; fileName?: string; download?: boolean }): Promise<{ blob: Blob; fileName: string; text: string }>;
  /** Opens an event's record (by occurrence or record id). */
  openCalendarEvent(id: string): Promise<unknown>;
  clearCalendarSelection(): void | Promise<void>;
  /** Shows (true) or hides a source's events; omitted switches it. Resolves with whether they show. */
  setCalendarSource(id: string, visible?: boolean): boolean | Promise<boolean>;
}
