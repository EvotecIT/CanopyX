// Flows (docs/flow.md): guided forms with steps, typed fields, conditions as data, validation, a review page and one
// proposal to the host. The flow entry point (@evotecit/canopyx/flow) and the grid entry points create them.
import type { CanopyPlugin } from "./plugins.js";

/** A value a field holds: text, a number, a boolean, a list of values, or nothing. Secrets never have one. */
export type FlowValue = string | number | boolean | null | readonly (string | number | boolean)[];

/** The field types: the shared grid editors, the types flows add, and custom editors. */
export type FlowFieldType = "text" | "number" | "date" | "datetime" | "time" | "select" | "toggle" | "lookup" | "choice" | "multiChoice"
  | "textarea" | "list" | "secret" | "duration" | "custom";

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
  /** The setting it writes, as dot-separated names; the proposal's JSON patch uses it. */
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
}

/** A section of a step: a heading over some of its fields. */
export interface FlowSection { id: string; label: string; description?: string; fields: readonly FlowField[]; when?: FlowCondition }

/** A step: a form, a page of text, or the review page (which comes last). */
export interface FlowStep {
  id: string;
  title?: string;
  description?: string;
  type?: "form" | "info" | "review";
  fields?: readonly FlowField[];
  sections?: readonly FlowSection[];
  when?: FlowCondition;
  optional?: boolean;
  /** Review steps: the text above the submit button. */
  declaration?: string;
  /** Review steps in edit mode: whether only changed answers show first (default true). */
  changesOnly?: boolean;
}

/** A flow document, the contract C# writes with CanopyFlow and any host can map. */
export interface FlowDocument {
  kind: "flow";
  version: 1;
  id: string;
  title: string;
  description?: string;
  mode?: "linear" | "free";
  layout?: { orientation?: "auto" | "horizontal" | "vertical" };
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
}

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
}

/** A validation result: the errors and warnings of a step or the whole flow. */
export interface FlowValidationResult {
  valid: boolean;
  errors: { field?: string; step?: string; message: string }[];
  warnings: { step?: string; message: string }[];
}

/** A flow's state: the current step, the answers (never secrets) and the completed steps. */
export interface FlowState { step: string; values: Record<string, FlowValue>; completed: string[] }

/** The flow's API. Calls made before ready resolve once it has. */
export interface FlowApi {
  readonly element: HTMLElement;
  readonly flow: FlowDocument;
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
