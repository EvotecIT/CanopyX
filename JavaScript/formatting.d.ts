// Conditional formatting of flat grids (docs/conditional-formatting.md). The same schema as the .NET CanopyFormatRule
// family writes; the browser's rule editor reads and writes it too.

/** Every flat-grid filter operator, plus negations, suffixes, patterns, ranges and relative dates in days. */
export type GridFormatOperator = "eq" | "ne" | "gt" | "ge" | "lt" | "le" | "contains" | "notContains" | "startsWith" | "endsWith" | "like" | "notLike"
  | "matches" | "notMatches" | "in" | "notIn" | "between" | "betweenExclusive" | "isNull" | "isNotNull" | "olderThan" | "withinLast";
/** A raw operand: text, a finite number or a boolean. Dates are ISO 8601 strings with a time zone. */
export type GridFormatValue = string | number | boolean;
/** One test: a column, an operator and operands, or another column to compare with. */
export interface GridFormatPredicate {
  readonly column: string;
  readonly operator: GridFormatOperator;
  /** None for the null tests, two for ranges, 1..1000 for in/notIn, days for relative dates, one otherwise. */
  readonly values?: readonly GridFormatValue[];
  /** Compare with this column's value instead of values (one-operand comparisons). */
  readonly valueColumn?: string;
  /** How values are read; the column's kind by default. */
  readonly type?: "text" | "number" | "boolean" | "date";
  /** Text compares case-insensitively unless true. */
  readonly caseSensitive?: boolean;
  /** A BCP 47 culture for parsing numbers in text and comparing text. */
  readonly culture?: string;
}
/** A condition group: a filter group with a third junction, none. Eight levels, 64 groups and 64 predicates at most. */
export interface GridFormatCondition {
  readonly operator: "and" | "or" | "none";
  readonly filters?: readonly GridFormatPredicate[];
  readonly groups?: readonly GridFormatCondition[];
}
/** An icon name, "auto" (the tone's shape) or "none", or up to four characters of the host's own. */
export type GridFormatIcon = "auto" | "none" | "up" | "down" | "check" | "cross" | "warning" | "info" | "dot" | "circle" | "triangle" | "square" | "diamond"
  | "flag" | "star" | "minus" | "plus" | "clock" | (string & {});
/** A data bar: absent bounds run from zero (or the lowest value) to the highest value of the rows in hand. */
export interface GridFormatDataBar { readonly minimum?: number; readonly maximum?: number; readonly tone?: string; readonly showValue?: boolean; }
/** A colour scale stop at the lowest or highest value, at a number, or at a percentage of the range. */
export interface GridFormatScaleStop { readonly type: "min" | "max" | "number" | "percent"; readonly value?: number; readonly tone: string; }
export interface GridFormatColorScale {
  readonly stops: readonly [GridFormatScaleStop, GridFormatScaleStop] | readonly [GridFormatScaleStop, GridFormatScaleStop, GridFormatScaleStop];
}
/** A threshold band: values up to its inclusive upper bound take its tone; the last band may leave its bound open. */
export interface GridFormatBand { readonly upperBound?: number; readonly tone: string; readonly label?: string; readonly icon?: GridFormatIcon; }
/** Theme tones with an emphasis, an icon, a badge and a cue, or one of a bar, a scale and bands; className and css are the escape hatch. */
export interface GridFormatStyle {
  readonly tone?: string;
  readonly emphasis?: "fill" | "text" | "strong";
  readonly icon?: GridFormatIcon;
  readonly badge?: string;
  readonly cue?: string;
  readonly bar?: GridFormatDataBar;
  readonly scale?: GridFormatColorScale;
  readonly bands?: readonly GridFormatBand[];
  readonly className?: string;
  readonly css?: Readonly<Record<string, string>>;
}
/** A rule: identity, condition (absent matches every row), target and style. Rules apply in order; the first rule that sets an aspect of a target wins it. */
export interface GridFormatRule {
  readonly id: string;
  /** The legend entry and default screen reader description. */
  readonly label?: string;
  /** What screen readers hear on a formatted cell. */
  readonly description?: string;
  readonly enabled?: boolean;
  readonly when?: GridFormatCondition;
  /** The cell a cell rule paints and the value bars, scales and bands read. */
  readonly column?: string;
  readonly target?: "cell" | "row" | "columns";
  readonly columns?: readonly string[];
  /** Follow the column into the record drawer and the phone's hidden fields (default true). */
  readonly details?: boolean;
  readonly style: GridFormatStyle;
  readonly stopIfTrue?: boolean;
}
/** A legend of the labelled rules, and the rule editor in the more menu. */
export interface GridFormatOptions { readonly legend?: boolean; readonly editor?: boolean; }
/** A cell's or record's resolved format in export records, for writers that paint (a styled spreadsheet, a print snapshot). */
export interface GridExportFormat {
  readonly rules: readonly string[];
  readonly tone?: string;
  readonly icon?: string;
  readonly badge?: string;
  readonly cue?: string;
  readonly band?: string;
  /** Where the value lies between the bar's bounds, 0..1, and the bar's tone. */
  readonly bar?: { readonly fraction: number; readonly tone: string };
  /** A colour scale's CSS colour, mixed from theme tone variables. */
  readonly color?: string;
  readonly description?: string;
}
