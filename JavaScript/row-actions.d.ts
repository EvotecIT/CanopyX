import type { GridFormatCondition } from "./formatting.js";

/** The icon of a row action's button and menu entry. */
export type GridRowActionIcon = "check" | "play" | "pause" | "stop" | "retry" | "edit" | "delete" | "copy" | "open" | "close" | "download";

/** An action each row may offer. CanopyX raises a proposal; the host's onRowAction carries it out or refuses it. */
export interface GridRowActionDefinition {
  /** Unique among the grid's row actions; the proposal's action. */
  id: string;
  /** The button's accessible name and tooltip, and the menu entry's text (at most 200 characters). */
  label: string;
  /** Default check. */
  icon?: GridRowActionIcon;
  /** Default neutral. */
  tone?: "neutral" | "primary" | "danger";
  /** The rows that offer the action; absent offers it on every row that is not locked. */
  when?: GridFormatCondition;
  /** The rows on which the action shows but cannot run. */
  disabledWhen?: GridFormatCondition;
  /** Why it is disabled: the button's description on those rows (at most 500 characters). */
  disabledReason?: string;
  /** After the host accepts, a live grid runs refreshRows() and any other grid reloads its accepted query. Default false. */
  refresh?: boolean;
}

/** The grid's actions column at the end edge (docs/row-actions.md). Sources, exports and static output leave it out. */
export interface GridRowActionsDefinition {
  /** The column's header and the button group's name. Default the rowActionColumn label. */
  label?: string;
  /** Actions shown as buttons, 0 to 4; the rest go into the More menu (one left over shows inline instead). Default 2. */
  inline?: number;
  /** hover shows the buttons on the hovered, focused, selected or busy row; the keyboard and touch reach them on every row. */
  reveal?: "always" | "hover";
  /** right keeps the column at the end edge while the grid scrolls sideways. Default right. */
  pin?: "right" | "none";
  /** Rows that show a lock and no actions. */
  lockedWhen?: GridFormatCondition;
  /** The lock's accessible name. Default the rowActionLocked label. */
  lockedLabel?: string;
  /** 1 to 16 actions in their order. */
  actions: GridRowActionDefinition[];
}

/** The frozen proposal onRowAction and canopyx:beforeRowAction receive. */
export interface GridRowActionProposal {
  readonly id: string;
  readonly action: string;
  /** A copy of the row as the grid had it: { id, cells }. */
  readonly row: { readonly id: string; readonly cells: Readonly<Record<string, unknown>> };
}

/** The second argument of onRowAction, as for a tree's context actions. */
export interface GridRowActionRequest<Q = unknown> {
  /** Aborts on the deadline (interactionTimeoutMs), cancelRowAction, a caller's signal or destruction. */
  readonly signal: AbortSignal;
  /** pointer, keyboard, menu, api, or the reason a requestRowAction caller passed. */
  readonly reason: string;
  readonly query: Q | null;
  readonly revision: string | null;
}

/** What onRowAction answers: acceptance, or a refusal with the message the status line shows. */
export type GridRowActionResult = boolean | { accepted: boolean; message?: string };

/** The detail of canopyx:rowAction once the host answered. */
export interface GridRowActionOutcome {
  readonly proposal: GridRowActionProposal;
  readonly accepted: boolean;
  readonly reason: string;
  /** The host's message, the rejection label, or the failure; null when accepted. */
  readonly message: string | null;
}

/** Host options of a grid with row actions. */
export interface GridRowActionOptions<Q = unknown> {
  /** Carries out or refuses a proposal; CanopyX applies nothing. A row has one proposal at a time. */
  onRowAction?: (proposal: GridRowActionProposal, request: GridRowActionRequest<Q>) => GridRowActionResult | PromiseLike<GridRowActionResult>;
  /** Synchronous eligibility per row and action; false disables the button. The host still authorizes in onRowAction. */
  isRowActionEnabled?: (row: Readonly<{ id: string; cells: Readonly<Record<string, unknown>> }>, action: Readonly<{ id: string; label: string }>) => boolean;
  /** Returning false (or cancelling canopyx:beforeRowAction) vetoes a proposal before onRowAction. */
  onBeforeRowAction?: (proposal: GridRowActionProposal) => boolean | void;
  /** The deadline of a proposal in milliseconds. Default 30000. */
  interactionTimeoutMs?: number;
}

/**
 * What requestRowAction resolves: the outcome canopyx:rowAction reports, without the proposal. A proposal that was never
 * made (an unknown row or action, a disabled action, a pending proposal or a veto) or was cancelled is not accepted and
 * has no message.
 */
export interface GridRowActionRequestResult {
  readonly accepted: boolean;
  readonly reason: string;
  /** The host's message, the rejection label, or the failure; null when accepted or never proposed. */
  readonly message: string | null;
}

/** The row action members of a flat grid's API. */
export interface GridRowActionApi {
  /** Raises an action of a loaded row as if it were activated; resolves with the host's answer. */
  requestRowAction(id: string, action: string, options?: { signal?: AbortSignal; reason?: string }): Promise<GridRowActionRequestResult>;
  /** Cancels the pending proposal of a row, or of every row; true when one was pending. */
  cancelRowAction(id?: string): boolean;
}
