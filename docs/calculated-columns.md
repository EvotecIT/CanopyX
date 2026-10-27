# Calculated columns

A calculated column derives one scalar value per record from declared raw column values. Its result participates in
the normal grid query and presentation: searching, sorting, filtering, grouping, pivoting and exporting use the
calculated value. Calculated cells are read-only. An optional inline editor lets readers change the definitions;
it does not make the result cells directly editable.

Calculations use a bounded expression interpreter. The browser and C# implementations share the conformance cases in
`tests/conformance/calculations.json`. Expressions do not execute arbitrary code, use `eval`, or introduce a runtime
package dependency.

## Author a column

On the wire, a flat-grid column adds a `calculation` expression string:

```json
{
  "id": "total", "title": "Total", "width": 160, "kind": "number", "sortable": true,
  "calculation": "[quantity] * [price]"
}
```

The expression has one to 2,048 UTF-16 code units and must contain a valid program. Calculation metadata belongs to
grid columns; tree columns do not accept it. A calculated column cannot set `editable: true`.

In C#, `CanopyColumn.Calculation` holds an immutable parsed `CanopyCalculation`, and the writer serializes its
original expression string:

```csharp
var view = new CanopyDataGridView("records", "Records");
view.Columns.Add(new CanopyColumn("quantity", "Quantity") { Kind = CanopyColumnKind.Number });
view.Columns.Add(new CanopyColumn("price", "Price") { Kind = CanopyColumnKind.Number });
view.Columns.Add(new CanopyColumn("total", "Total") {
    Kind = CanopyColumnKind.Number,
    Sortable = true,
    Calculation = CanopyCalculation.Parse("[quantity] * [price]")
});
view.CalculatedColumnsEditable = true;
```

`CalculatedColumnsEditable` is false by default. Authored calculated columns work without enabling the editor.
Setting it to true requires an inline source; browser editing also requires the built-in inline source rather than
a host-supplied query implementation. Compact inline row data is supported through the same materialization path.

## Expressions

References use `[columnId]`, matching declared column IDs exactly. A calculation can refer to another calculated
column. Literals are finite JSON numbers, double-quoted JSON strings, booleans and null. String escapes follow JSON.
Function names and boolean/null keywords are case-insensitive. Arrays, objects and arbitrary function calls are
outside the grammar.

| Syntax | Meaning |
| --- | --- |
| `+value`, `-value` | Unary numeric sign |
| `a * b`, `a / b`, `a % b` | Multiplication, division and remainder |
| `a + b`, `a - b` | Numeric addition and subtraction |
| `=`, `==`, `!=`, `<>` | Equality and inequality |
| `<`, `<=`, `>`, `>=` | Ordered comparison of the same scalar kind |
| `(expression)` | Explicit grouping |

Unary signs bind before multiplication/division/remainder, which bind before addition/subtraction. Comparisons bind
last. Operators at the same precedence associate left to right. Addition is numeric; use `CONCAT` to build text.

Comparisons require the same non-null scalar kind. For example, `3 = "3"` is a `type` error rather than a numeric
conversion. Strings compare exactly by ordinal value. Equality can compare null: `null = null` is true and
`null != 3` is true. Other arithmetic and ordered comparisons return null when an evaluated operand is null.
An error in an evaluated operand propagates.

| Function | Contract |
| --- | --- |
| `IF(condition, whenTrue, whenFalse)` | Exactly three arguments. The condition is a boolean or null; null selects the false branch. Only the selected branch is evaluated. |
| `COALESCE(value, ...)` | One to 32 arguments. Returns the first non-null value, evaluating only as far as needed. An encountered error propagates; it is not treated as null. |
| `ROUND(number, digits)` | Exactly two arguments. Integer digits from -12 to 12. Uses binary64 arithmetic with ties toward positive infinity, matching `Math.round`. Thus `ROUND(-1.5, 0)` is -1. |
| `CONCAT(value, ...)` | One to 32 arguments. Null becomes empty text; finite numbers and booleans use invariant scalar text. The complete result is bounded to 4,096 UTF-16 code units. |
| `DATEPART(unit, date)` | Exactly two arguments. Returns the named UTC calendar part. |
| `DATEDIFF(unit, start, end)` | Exactly three arguments. Returns elapsed time, including a fractional remainder, rather than a count of crossed calendar boundaries. |

For example, `IF([quantity] = null, 0, [quantity] * [price])` supplies a numeric fallback for a missing quantity.
`COALESCE([note], "No note")` preserves an existing note. `IF(false, 1 / 0, 7)` returns 7 without evaluating the
failing branch; `COALESCE(1 / 0, 7)` reports `divide-by-zero`.

### Dates

Date functions accept a strict ISO date in years 0001–9999. A date-only value such as `"2026-10-25"` means midnight
UTC. A timestamp must include `Z` or an explicit numeric offset; an unzoned timestamp is invalid. Fractional seconds
are truncated to milliseconds. Invalid calendar dates and instants outside the supported year range report `date`.

`DATEPART` accepts `year`, `quarter`, `month`, `day`, `hour`, `minute`, `second` and `weekday`. Parts are evaluated
in UTC; weekday is Monday 1 through Sunday 7. `DATEDIFF` accepts `day`, `hour`, `minute`, `second` and `millisecond`.
Units are case-insensitive. For example:

```text
DATEPART("month", "2026-10-25T01:00:00+02:00")
DATEDIFF("day", "2026-10-25T00:00:00Z", "2026-10-25T12:00:00Z")
```

These return 10 and 0.5, respectively. A datetime result column follows the grid's normal date-value contract;
choose a number column for `DATEPART` or `DATEDIFF` results.

## Definition and result limits

| Bound | Limit |
| --- | --- |
| Calculated columns in one grid or saved definition set | 32 |
| Expression source | 1–2,048 UTF-16 code units |
| AST depth | 32 |
| AST nodes | 256 |
| Arguments to one function | 32, within the function's own arity |
| Distinct referenced column IDs in one expression | 64 |
| Source/result text | 4,096 UTF-16 code units |
| Numeric evaluation | Finite binary64; non-finite results are errors |
| Reader-defined title | 1–256 code units, containing visible text |

The schema validates document shape and expression length. The parser and definition validator enforce program
syntax, UTF-16 code-unit bounds, declared references and dependency rules. JSON Schema's Unicode-character length
check does not replace the runtime code-unit check.

`CanopyCalculationSet` captures parsed programs and materializes rows in dependency order, with at most 32 calculated
columns. Unknown references and cycles reject the definition set before it is used, including references inside lazy
branches. A program can read raw values, not formatted labels, badges or other display decorations.

Result kinds are strict:

| Declared column kind | Non-null result |
| --- | --- |
| `number` | A numeric value within the grid wire range, ±9,007,199,254,740,991 |
| `text` | A string or boolean |
| `datetime` | A valid date, normalized to UTC at millisecond precision before dependent calculations and serialization |

There is no implicit number-to-text or text-to-number conversion when materializing a column. Use `CONCAT` to turn
scalars into text. Null is a missing result in every kind. Calculated values are available before an inline query
filters, sorts, groups, pivots or exports the records.

Inline live transactions calculate each added or updated record before matching filters, comparing sort keys or
reporting changed cells. The same rule applies when `setRows` replaces the inline records; hosts supply the ordinary
input cells, and calculated cells are derived from them.

The standalone evaluator permits any finite binary64 result. Materializing it as a numeric grid cell applies the
grid's narrower wire range; an out-of-range result becomes a `number-range` cell error.

## Errors stay with their cells

A row-level calculation error has raw value null and a danger tone. Division or remainder by zero shows `#DIV/0`;
other errors show `#ERROR`. The tooltip identifies the column and its expression, followed by the localized
`gridCalculationError` label (`GridCalculationError` in C#). Division by zero uses a translated explanation; other
reasons retain their stable code. Codes are
`type`, `divide-by-zero`, `number-range`, `text-limit`, `date` and `reference`. Division or remainder by zero is an
error; it does not produce infinity.

Dependent calculated columns propagate an evaluated upstream error. Independent columns continue to calculate, and
unused lazy branches do not introduce errors. Raw filtering and raw exports see the null value; display output can
retain the error marker and its tooltip, including in script-free output. Invalid syntax, unknown references, cycles and definition limits are definition
errors, not missing cells silently accepted by the editor.

## Inline editor and saved state

After the grid is ready, its controller exposes:

```typescript
await grid.ready;
const current = grid.getCalculatedColumns();
const accepted = await grid.setCalculatedColumns([
  ...current,
  { id: "caption", title: "Caption", kind: "text", expression: 'CONCAT("Total: ", [total])' }
]);
await grid.openCalculatedColumn();
```

`getCalculatedColumns()` returns read-only `{ id, title, kind, expression }` definitions, or an empty array.
`setCalculatedColumns(definitions)` validates and replaces the complete set, then resolves with the accepted read-only
definitions. It requires the inline editor opt-in. Every authored calculated column ID and result kind must remain in that set;
reader-added columns can be omitted when restoring or resetting a saved state. IDs must be unique and cannot replace
ordinary source columns. `openCalculatedColumn(anchor?)` opens the editor, optionally anchored to an `HTMLElement`.

With the editor enabled, grid state may include `calculatedColumns`, using the same array with at most 32 entries.
Views without that opt-in reject saved calculation definitions. Restoration validates the expressions and dependencies
against the prospective column set. Reset restores the authored set and removes reader-added columns. The normal
column layout and query state remain separate from the expression definitions.

Changing an expression, result kind or calculated-column ID advances the inline projection revision. Summaries,
facets and active pivots read that new projection. An export captured before the change is rejected if it has not
finished, including between records of the same page; capture it again to export the new values. Changing only a
title or restoring unchanged expressions keeps the existing projection revision.

## Hosted data boundary

An authored hosted column may declare `calculation`, but its row values come from the server. The browser does not
calculate a hosted page or enable its expression editor. In-memory data providers materialize configured calculations
before evaluating the query. A queryable provider uses an explicitly authorized host mapping that the store can
translate; it does not fall back to calculating individual client pages.

Queries can sort or filter an allowed calculated column by its declared ID. They do not serialize `calculation`,
`calculatedColumns` or the editor opt-in. A saved inline expression is not a request to modify the server's schema or
execute a client-supplied program on hosted data. The host defines the permitted columns and their server mappings.
See the [data protocol](data-protocol.md#calculated-columns) for the additive `canopyx/2` fields.
