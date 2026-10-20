// Flows (docs/flow.md): guided forms with steps, typed fields, conditions as data, validation, a review page and one
// proposal to the host. The flow entry point (@evotecit/canopyx/flow) and the grid entry points create them.
import type { CanopyPlugin } from "./plugins.js";

/** A value a field holds: text, a number, a boolean, a list of values, rows of a records field, picked records, or nothing. Secrets never have one. */
export type FlowValue = string | number | boolean | null | readonly (string | number | boolean)[] | readonly FlowRecordRow[] | readonly FlowPickedRecord[];

/** A row of a records field: a cell per column. */
export type FlowRecordRow = Readonly<Record<string, string | number | boolean | null>>;

/** A record a pick step chose: its id and the label the tray and the review page show. */
export interface FlowPickedRecord { readonly id: string; readonly label: string }

/** The field types: the shared grid editors, the types flows add, and custom editors. */
export type FlowFieldType = "text" | "number" | "date" | "datetime" | "time" | "select" | "toggle" | "lookup" | "choice" | "multiChoice"
  | "textarea" | "list" | "secret" | "duration" | "records" | "custom";

/** A condition operator, from the filter builder's grammar. */
export type FlowOperator = "eq" | "ne" | "gt" | "ge" | "lt" | "le" | "contains" | "notContains" | "startsWith" | "endsWith" | "matches" | "notMatches"
  | "in" | "notIn" | "between" | "isNull" | "isNotNull";

/** A condition as data: groups of predicates joined by and, or and none. At most eight levels, 64 groups and 64 predicates. */
export interface FlowCondition {
  operator: "and" | "or" | "none";
  filters?: readonly { field: string; operator: FlowOperator; values?: readonly (string | number | boolean)[] }[];
  groups?: readonly FlowCondition[];
}

/** A choice: a value, and how readers see it. */
export interface FlowOption {
  value: string | number | boolean;
  label?: string;
  description?: string;
  badge?: string;
  /** Shown beside a choice that cannot be picked. */
  disabledReason?: string;
  /** Multiple choice: the heading the option sits under. */
  group?: string;
}

/** A field's checks: lengths and patterns for text, ranges for numbers, moments and durations, counts and item rules for lists. */
export interface FlowValidation {
  min?: number | string;
  max?: number | string;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  message?: string;
  minItems?: number;
  maxItems?: number;
  item?: "email" | "host" | "ip" | "cidr" | "url";
  itemPattern?: string;
}

/** A field of a flow step. */
export interface FlowField {
  id: string;
  type: FlowFieldType;
  label: string;
  help?: string;
  placeholder?: string;
  required?: boolean;
  readOnly?: boolean;
  default?: FlowValue;
  when?: FlowCondition;
  width?: "full" | "half";
  parameter?: string;
  /** The setting it writes, as dot-separated names; the host prepares parent objects before applying the JSON patch. */
  path?: string;
  sensitive?: boolean;
  validation?: FlowValidation;
  options?: readonly FlowOption[];
  /** Choice fields: cards (default up to five options) or a list. */
  display?: "cards" | "list";
  onText?: string;
  offText?: string;
  rows?: number;
  step?: number;
  /** Secrets: a blank answer keeps the stored value. */
  keepWhenBlank?: boolean;
  /** Secrets: false hides the reveal button. */
  reveal?: boolean;
  units?: readonly ("seconds" | "minutes" | "hours" | "days")[];
  /** Custom fields: the registered editor's name. */
  editor?: string;
  /** Select, choice, multiple-choice and lookup fields: "host" takes the options from hooks.options (or an endpoint). */
  source?: "document" | "host";
  /** The fields (at most 16, never secrets) whose change reloads host options, or empties this answer. */
  dependsOn?: readonly string[];
  /** Records fields: the columns of each row (1 to 16). */
  columns?: readonly FlowRecordColumn[];
}

/** A column of a records field. */
export interface FlowRecordColumn {
  id: string;
  title: string;
  type?: "text" | "number" | "date" | "time" | "select" | "toggle";
  required?: boolean;
  options?: readonly FlowOption[];
  validation?: { min?: number; max?: number; minLength?: number; maxLength?: number; pattern?: string; message?: string };
  width?: number;
}

/** A server check of some answers, such as "Send a test message", run through hooks.check (or an endpoint). */
export interface FlowCheck {
  id: string;
  label: string;
  description?: string;
  /** The fields it tests (1 to 64); a change marks its result stale. Secrets among them reach the hook through secret(id). */
  fields: readonly string[];
  /** "pass" blocks Next until it passes on the current answers; "run" until it ran on them without failing. */
  required?: "pass" | "run";
}

/** A pick step's picker: a grid or tree view whose selection is the step's answer. */
export interface FlowPick {
  field: {
    id: string; label?: string; help?: string; required?: boolean; when?: FlowCondition; parameter?: string; path?: string; sensitive?: boolean;
    validation?: Pick<FlowValidation, "minItems" | "maxItems" | "message">; default?: readonly FlowPickedRecord[];
  };
  /** The grid or tree view document (canopyx/2). */
  view: Readonly<Record<string, unknown>>;
  /** The view column whose value labels a picked record. */
  label: string;
  /** Whether the tray of picked records shows (default true). */
  tray?: boolean;
  height?: number;
}

/** A preset the reader can start from. */
export interface FlowPreset { id: string; label: string; description?: string; values: Readonly<Record<string, FlowValue>> }

/** A section of a step: a heading over some of its fields, or over fields the host supplies. */
export interface FlowSection {
  id: string;
  label: string;
  description?: string;
  /** The section's own fields; none when its fields come from the host. */
  fields?: readonly FlowField[];
  when?: FlowCondition;
  /** "host": hooks.fields (or an endpoint) supplies the fields as the step opens, and again when a field in dependsOn changes. */
  source?: "host";
  dependsOn?: readonly string[];
}

/** A step: a form, a page of text, a pick step, or the review page (which comes last). */
export interface FlowStep {
  id: string;
  title?: string;
  description?: string;
  type?: "form" | "info" | "pick" | "review";
  fields?: readonly FlowField[];
  sections?: readonly FlowSection[];
  when?: FlowCondition;
  optional?: boolean;
  /** Review steps: the text above the submit button. */
  declaration?: string;
  /** Review steps in edit mode: whether only changed answers show first (default true). */
  changesOnly?: boolean;
  /** Form steps: server checks (at most 8). */
  checks?: readonly FlowCheck[];
  /** Task lists: the heading the task sits under. */
  group?: string;
  /** Pick steps: the picker. */
  pick?: FlowPick;
  /** Review steps: a text the reader types before submitting, or a field whose answer they type. */
  confirm?: { label: string; text?: string; field?: string };
  /** Review steps: a box the reader ticks before submitting, while the condition holds. */
  acknowledge?: { label: string; when?: FlowCondition };
}

/** A flow document, the contract C# writes with CanopyFlow and any host can map. */
export interface FlowDocument {
  kind: "flow";
  version: 1;
  id: string;
  title: string;
  description?: string;
  mode?: "linear" | "free" | "tasks";
  /** Container "dialog" or "drawer" opens the flow from a launch button. */
  layout?: { orientation?: "auto" | "horizontal" | "vertical"; container?: "inline" | "dialog" | "drawer"; launch?: string };
  density?: "compact" | "normal" | "comfortable";
  timeZone?: "utc" | "local";
  steps: readonly FlowStep[];
  /** Edit mode: the values the flow edits. */
  initial?: Readonly<Record<string, FlowValue>>;
  /** Edit mode: the secret fields that already have a stored value. */
  storedSecrets?: readonly string[];
  baseline?: string;
  submit?: { label?: string };
  labels?: Readonly<Record<string, string>>;
  /** The equivalent command the review page shows; variants come from hooks.commands. */
  command?: { name: string; style?: "powershell" | "posix" | "windows"; variants?: readonly { id: string; label: string }[] };
  presets?: readonly FlowPreset[];
  /** Where the draft lives: nowhere (the default), the session, local storage, or hooks.draftStore. */
  draft?: "none" | "session" | "local" | "host";
  /** Whether the page's address names the open step (#flow-id/step-id). */
  deepLinks?: boolean;
  /** Routes on the page's own origin that answer the hooks the host left unset (CanopyX.AspNetCore's MapCanopyFlow). */
  endpoint?: { url: string; routes: readonly ("options" | "fields" | "check" | "validate" | "preview" | "status" | "draft" | "submit")[] };
}

/** The proposal flowSubmit carries: visible answers, secret states, the changes and a JSON patch. Never a secret value. */
export interface FlowSubmission {
  kind: "flowSubmission";
  flow: string;
  version: 1;
  mode: "create" | "edit";
  baseline?: string;
  values: Record<string, FlowValue>;
  secrets: Record<string, { state: "set" | "keep" }>;
  changes: { field: string; path?: string; from: FlowValue; to: FlowValue }[];
  patch: ({ op: "add" | "replace"; path: string; value: FlowValue } | { op: "remove"; path: string })[];
  /** The checks that ran on these answers, as the browser saw them: a claim the server runs again before relying on it. */
  checks?: Record<string, { status: FlowCheckStatus; at: string }>;
  /** The equivalent command of these answers; typed secrets read <secret>. */
  command?: string;
  /** The preset the answers started from. */
  preset?: string;
}

/** A check's outcome. */
export type FlowCheckStatus = "pass" | "warning" | "fail";

/** What a check answers. */
export interface FlowCheckResult {
  status: FlowCheckStatus;
  message?: string;
  details?: { label: string; value: string | number | boolean }[];
  fieldErrors?: Record<string, string>;
}

/** A task's state on a task-list flow, as the host sees it. */
export interface FlowStepState { state: "complete" | "needsAction" | "blocked" | "notStarted"; summary?: string; blockers?: string[] }

/** A row of the review page's preview. */
export interface FlowPreviewRow { label: string; value: string | number | boolean; tone?: "info" | "success" | "warning" | "danger" }

/** The review page's preview: rows of what submitting does, or a title, rows and notes. Text only. */
export type FlowPreview = readonly FlowPreviewRow[] | { title?: string; rows?: readonly FlowPreviewRow[]; notes?: readonly string[] };

/** A draft: the answers (never secrets or sensitive fields), the open step, the completed steps, the preset and the baseline. */
export interface FlowDraft {
  kind: "flowDraft";
  version: 1;
  flow: string;
  step: string;
  completed: string[];
  values: Record<string, FlowValue>;
  saved: string;
  baseline?: string;
  preset?: string;
}

/** What an asynchronous hook receives: a signal that a newer request, Cancel, the timeout or destroy aborts. */
export interface FlowHookContext { signal: AbortSignal }

/** The submit event's detail: the proposal, how to answer it, and each secret once. */
export interface FlowSubmitDetail extends Readonly<FlowSubmission> {
  respondWith(answer: FlowAnswer | Promise<FlowAnswer>): void;
  /** A secret's value, once per field, until the answer settles; null afterwards. */
  secret(fieldId: string): string | null;
}

/** The host's answer to a proposal. */
export interface FlowAnswer {
  status: "saved" | "accepted" | "error" | "conflict";
  message?: string;
  fieldErrors?: Record<string, string>;
  stepErrors?: Record<string, string>;
  /** Saved: rows the result panel shows; once rows get Copy and leave the page with the panel. */
  result?: { label: string; value: string | number | boolean; once?: boolean }[];
  links?: { label: string; href: string }[];
}

/** What a step or flow rule answers: a message, or buckets of messages. */
export type FlowRuleResult = string | null | undefined | { errors?: string[]; warnings?: string[]; fieldErrors?: Record<string, string> };

/** The host's hooks; each runs isolated, and a failure becomes a message in place and an error event. */
export interface FlowHooks {
  validators?: Record<string, (value: FlowValue, values: Record<string, FlowValue>) => string | null | undefined | Promise<string | null | undefined>>;
  validateStep?(stepId: string, values: Record<string, FlowValue>): FlowRuleResult | Promise<FlowRuleResult>;
  validateFlow?(values: Record<string, FlowValue>): FlowRuleResult | Promise<FlowRuleResult>;
  submit?(detail: FlowSubmitDetail): FlowAnswer | Promise<FlowAnswer>;
  /** The options of a field whose source is "host". */
  options?(fieldId: string, values: Record<string, FlowValue>, context: FlowHookContext): readonly FlowOption[] | Promise<readonly FlowOption[]>;
  /** The fields of a host section: at most 64, of the plain types, without path, source or dependsOn. */
  fields?(sectionId: string, values: Record<string, FlowValue>, context: FlowHookContext): readonly FlowField[] | Promise<readonly FlowField[]>;
  /** Runs a check; secret(id) reads, once, a secret among the fields it tests. */
  check?(checkId: string, values: Record<string, FlowValue>, context: FlowHookContext & { secret(fieldId: string): string | null }): FlowCheckResult | Promise<FlowCheckResult>;
  /** The review page's preview of what submitting does. */
  preview?(values: Record<string, FlowValue>, context: FlowHookContext): FlowPreview | Promise<FlowPreview>;
  /** A task list's step states, by step id. */
  status?(values: Record<string, FlowValue>, context: FlowHookContext): Record<string, FlowStepState> | Promise<Record<string, FlowStepState>>;
  /** The command's variants, by variant id: each writes the command line of the answers. */
  commands?: Record<string, (values: Record<string, FlowValue>) => string | Promise<string>>;
  /** The store of draft "host". */
  draftStore?: { load(flowId: string): FlowDraft | null | Promise<FlowDraft | null>; save(flowId: string, draft: FlowDraft): void | Promise<void>; clear(flowId: string): void | Promise<void> };
  /** Presets the host keeps; save adds "Save as preset". */
  presetStore?: { list(flowId: string): readonly FlowPreset[] | Promise<readonly FlowPreset[]>; save?(flowId: string, preset: FlowPreset): void | Promise<void> };
  /** Grid or tree options of a pick step's view, by step id, such as a remote data source. */
  pickers?: Record<string, Readonly<Record<string, unknown>>>;
}

/** Options of createFlow and CanopyX.configure for a flow fragment. */
export interface FlowOptions {
  flow: FlowDocument;
  /** Starting answers on top of the defaults or the edited values. */
  values?: Record<string, FlowValue>;
  labels?: Record<string, string>;
  hooks?: FlowHooks;
  /** Editors for custom fields, as grid editing's (docs/editing.md#custom-editors). */
  editors?: CanopyPlugin["editors"];
  onReady?(detail: { flow: string; step: string }): void;
  onStepChange?(detail: { from: string; to: string }): void;
  onValueChange?(detail: { field: string; value?: FlowValue; previous?: FlowValue; source: string }): void;
  onSubmit?(detail: FlowSubmitDetail): FlowAnswer | Promise<FlowAnswer> | void;
  onSubmitted?(answer: FlowAnswer): void;
  onReload?(detail: { baseline: string | null }): void;
  onCheck?(detail: { check: string; result: { status: FlowCheckStatus; message: string | null; details: { label: string; value: string }[]; at: string } }): void;
  /** A dialog or drawer flow closes with answers; false (or cancelling flowLeaving) keeps it open. */
  onLeaving?(detail: { reason: "close" }): boolean | void;
  /** Deep links: a step's fragment, in place of "flow-id/step-id". */
  formatLink?(stepId: string): string | null;
  /** Deep links: the step a fragment names, or null. */
  parseLink?(fragment: string): string | null;
  /** How long an asynchronous hook may take, in milliseconds: 100 to 600000, default 30000. */
  timeout?: number;
  /** Headers an endpoint's requests carry, such as an antiforgery token. */
  headers?: Record<string, string>;
}

/** A validation result: the errors and warnings of a step or the whole flow. */
export interface FlowValidationResult {
  valid: boolean;
  errors: { field?: string; step?: string; message: string }[];
  warnings: { step?: string; message: string }[];
}

/** A flow's state: the current step, the answers (never secrets) and the completed steps. */
export interface FlowState { step: string; values: Record<string, FlowValue>; completed: string[] }

/**
 * The flow's API. Async methods wait for ready; synchronous methods throw a not-ready error until the implementation loads.
 * After destroy, synchronous calls throw a destroyed error and async calls reject with it. Calls still waiting for ready also reject.
 */
export interface FlowApi {
  readonly element: HTMLElement;
  readonly flow: FlowDocument;
  /** Resolves after the first step is painted; rejects on mount failure or destruction before readiness. */
  readonly ready: Promise<FlowApi>;
  next(): Promise<boolean>;
  back(): Promise<boolean>;
  goTo(stepId: string): Promise<boolean>;
  getStep(): string;
  getValues(): Record<string, FlowValue>;
  setValues(values: Record<string, FlowValue>): void;
  getState(): FlowState;
  setState(state: Partial<FlowState>): Promise<boolean>;
  isDirty(): boolean;
  reset(): boolean;
  validate(stepId?: string): Promise<FlowValidationResult>;
  setFieldError(fieldId: string, message: string | null): void;
  submit(): Promise<FlowAnswer | null>;
  setProgress(progress: { done?: number; total?: number; message?: string }): boolean;
  complete(answer: FlowAnswer): boolean;
  /** Runs a check now; resolves with its result as the flow keeps it (field messages show in place), or null when it was cancelled. */
  runCheck(checkId: string): Promise<{ status: FlowCheckStatus; message: string | null; details: { label: string; value: string }[]; at: string } | null>;
  /** Loads a host-option field's options again. */
  refreshOptions(fieldId: string): Promise<void>;
  /** Sets a task's state as the host sees it; null returns it to what the answers say. */
  setStepState(stepId: string, state: FlowStepState | null): void;
  /** Saves the draft now; resolves with whether it was saved. */
  saveDraft(): Promise<boolean>;
  /** Starts from a preset, or from the plain start with null. */
  setPreset(presetId: string | null): Promise<void>;
  /** Dialog and drawer flows: opens the container; true once it is open, false for an inline flow. */
  open(): boolean;
  /** Dialog and drawer flows: closes the container, asking first when answers would be lost; false when it stays open. */
  close(): boolean;
  /** Releases the flow and its host's mount state, even before ready or after mount failure. Repeated calls do nothing. */
  destroy(): void;
}

/** Creates a flow in a host element; the forms and flow parts load on first use. */
export declare function createFlow(host: HTMLElement, options: FlowOptions): FlowApi;
/** Registers options for a flow fragment before it mounts; returns a disposer. */
export declare function configure(flowId: string, options: Partial<Omit<FlowOptions, "flow">>): () => void;
export declare function unconfigure(flowId: string): boolean;
/** Mounts the flow fragments under root, or root itself. */
export declare function mount(root?: ParentNode): FlowApi[];
/** Registers a plugin's editors for the flows created afterwards; returns a disposer. */
export declare function use(plugin: Pick<CanopyPlugin, "name" | "editors">): () => void;
export declare function registerPart(name: string, part: { version: string; requires?: string[]; install(context: object): void }): void;
export declare function setNonce(nonce: string): void;
declare const CanopyX: { createFlow: typeof createFlow; configure: typeof configure; unconfigure: typeof unconfigure; mount: typeof mount;
  use: typeof use; registerPart: typeof registerPart; setNonce: typeof setNonce };
export default CanopyX;
