// The calendar of flat grids (docs/calendar.md, docs/resource-timeline.md): month, week, day, N days, agenda, year and the
// resource timeline over the grid's own records, with the grid's query, record panel, linked views, facets, live data and editing.
import type { InlineView, RemoteView } from "./protocol.js";
import type { GridRow, GridColumnId, GridQuery } from "./grid.js";

/** The views a calendar offers. */
export type GridCalendarView = "month" | "week" | "day" | "days" | "agenda" | "year" | "timeline";
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
}

/** The template hook: draws an event's content into a fresh element; return true to own it. Text is the host's to escape. */
export type GridCalendarTemplate = (context: {
  readonly event: GridCalendarEvent;
  readonly row: GridRow;
  readonly element: HTMLElement;
  readonly kind: "bar" | "chip" | "block" | "item" | "lane";
  readonly labels: Readonly<Record<string, string>>;
}) => boolean | void;

/** The host's calendar options. */
export interface GridCalendarOptions {
  render?: GridCalendarTemplate;
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
}
