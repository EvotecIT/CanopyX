# Conditional Formatting

A flat grid can format its cells and rows by rules: a tone where a value needs attention, an icon or a badge, a data bar,
a colour scale or threshold bands. Rules use the filter builder's conditions, so one condition language serves filtering
and formatting. Readers can change the rules in a rule editor, and the rules they make are part of the grid's saved views.

The `conditional-formatting.html` example (and `-dark.html`) is a server health grid with every kind of rule, a legend and
the rule editor; `conditional-formatting-static.html` is the same grid as a script-free table.

## A rule

```json
{
  "id": "cpu-hot",
  "label": "CPU above 90%",
  "description": "CPU is above 90 percent",
  "column": "cpu",
  "when": { "operator": "and", "filters": [{ "column": "cpu", "operator": "gt", "values": [90] }] },
  "style": { "tone": "danger", "emphasis": "text", "icon": "up" }
}
```

| Field | Meaning |
| --- | --- |
| `id` | Unique within the grid: a letter or digit, then up to 63 letters, digits, `_`, `.`, `:` and `-`. |
| `label` | The rule's name: its legend entry, its name in the editor and its default description. |
| `description` | What screen readers hear on a formatted cell. Defaults to the label, then the rule ID. A legend entry still requires a label. |
| `enabled` | `false` keeps the rule without applying it. |
| `when` | The condition. Without one the rule matches every row, the usual choice for bars and scales. |
| `column` | The cell a `cell` rule paints, and the value a bar, scale or band reads. |
| `target` | `cell` (default), `row`, or `columns` with `columns: [ids]`. |
| `details` | `false` keeps the formatting out of the record drawer. Default true. |
| `style` | How the rule paints (below). |
| `stopIfTrue` | A match ends the rules after this one for that row, even when a missing or nonnumeric value prevents its bar, scale or band from painting. |

A grid holds at most 64 rules, in priority order. For each target cell or row, the first matched rule that sets an aspect
(tone, emphasis, icon, badge, cue, bar, scale) wins it, and every matched rule adds its description. So a rule that draws a
bar and a later rule that colours hot values in red combine on one cell.

## Conditions

A condition is a filter group with a third junction: `{ "operator": "and" | "or" | "none", "filters": [...], "groups": [...] }`.
Every filter group of a grid query is a condition as it is; in .NET, `CanopyFormatCondition.FromFilterGroup` converts one.
A rule supports eight levels, 64 groups and 64 predicates.

A predicate is `{ "column", "operator", "values" }` with optional fields:

| Field | Meaning |
| --- | --- |
| `valueColumn` | Compare with another column's value instead of `values`, for example `used gt quota`. |
| `type` | `text`, `number`, `boolean` or `date`: how values are read. The column's kind by default, so a text column holding `"1 234,5"` compares as a number with `type: "number"`. |
| `caseSensitive` | Text compares case-insensitively by default, with the same folding as search. |
| `culture` | A BCP 47 name such as `pl-PL`: numbers in text parse with its separators, and text lowercases and orders by its rules. |

| Operators | Values |
| --- | --- |
| `eq`, `ne`, `gt`, `ge`, `lt`, `le` | one |
| `contains`, `notContains`, `startsWith`, `endsWith` | one |
| `like`, `notLike` | one wildcard pattern: `*` any text, `?` one character; it tests the first 4,096 UTF-16 code units |
| `matches`, `notMatches` | a bounded regular expression of at most 256 characters; it tests the first 4,096 UTF-16 code units |
| `in`, `notIn` | 1 to 1,000 |
| `between` (inclusive), `betweenExclusive` | two, lower first |
| `isNull`, `isNotNull` | none |
| `olderThan`, `withinLast` | a number of days, for dates; grids re-evaluate them every minute |

Missing values match only `isNull`, as in filters. Dates compare as instants; ISO 8601 dates without a time zone read as UTC, and other date text does not convert. `valueColumn` works with one-operand comparisons, not with patterns or relative dates.

Regular expressions accept literals, character classes, common character escapes such as `\d`, and fixed repetitions up
to 256 characters. At most one repetition can have a variable length (`*`, `+`, `?`, or a range); it requires a leading
`^`. For example, `^web-[0-9]+$` is accepted. Groups, alternatives, lookarounds and backreferences are rejected before a
rule is applied, so a pattern cannot freeze the browser through catastrophic backtracking. Use `in` or an `or` condition
for alternatives. Wildcards keep their separate `*` and `?` syntax and support multiple stars.

## Styles

Every colour is a theme tone: `neutral`, `info`, `success`, `warning`, `danger`, `muted` or a tone the host's theme
defines (`--hfx-color-status-<name>-fg`). Tones follow the light, dark and print palettes, so formatting stays legible in each.

| Style | Draws |
| --- | --- |
| `tone` with `emphasis` | `fill` (default): a soft tint behind text in the tone's colour; `text`: the colour alone; `strong`: the fill in bold. On a row: a tint and an accent at its start. |
| `icon` | A named icon (`up`, `down`, `check`, `cross`, `warning`, `info`, `dot`, `circle`, `triangle`, `square`, `diamond`, `flag`, `star`, `minus`, `plus`, `clock`) or up to four characters, in the tone's colour. |
| `badge` | A small pill after the value, in the tone. |
| `cue` | Quiet text after the value, such as `stale`. |
| `bar` | A data bar before the value: `{ minimum, maximum, tone, showValue }`. |
| `scale` | A two- or three-stop colour scale: `{ stops: [{ type: "min" | "max" | "number" | "percent", value?, tone }] }`. |
| `bands` | Threshold bands: `[{ upperBound, tone, label?, icon? }]`, rising, the last one open. |
| `className`, `css` | The escape hatch: extra classes, and up to 16 plain declarations (no `url()` or other image sources, expressions, imports, quotes, braces or semicolons). A row rule puts them on the row. |

A rule draws one of a bar, a scale and bands; they read the rule's `column` and paint its cell or its `columns`. Without
`minimum`, `maximum` or a numeric stop, the bounds come from every row of an inline grid, or from the rows a host grid has
received so far: give explicit bounds when a host grid's rows arrive in pages.

## Accessibility: never colour alone

- A style that only colours gets its tone's icon: a cross for danger, a warning sign, a check for success, an information
  sign, a dot for other tones. Set `icon: "none"` to opt out, and give the rule a cue, a badge or the legend instead.
- Every formatted cell carries its rules' descriptions as screen reader text, after the value: "84, CPU above 90%". A row
  rule's description goes into the row's first cell.
- Bars keep the value visible beside them (or readable by screen readers with `showValue: false`); bands name themselves
  with their label.
- `formatting: { legend: true }` adds a legend above the grid: each enabled rule with a label, its swatch and icon, and each
  band. It is a list named "Formatting legend".
- With forced colours (Windows high contrast) icons, badges and cues stay, accents and bars use system colours, and fills
  are outlined.

## The record drawer and phones

A cell rule's formatting follows its column into the record drawer, and a row rule marks the drawer's heading, for each
record the drawer shows. On phones, columns that do not fit hide behind the "+N" button of the first cell: the button
is the flag: it takes the strongest tone of the flagged fields it hides (a tone, an icon, a badge or a cue; bars and scales
are not flags) with an underline, inside the width the fitting reserves for it, and its accessible name lists them; the
drawer shows them formatted. `details: false` keeps a rule out of both.

Column fitting counts icons, badges, cues and bars, and a flagged value's full width is its column's floor while the rules
apply. A narrow grid therefore hides a column by its priority, behind "+N", rather than cut a flagged value short: on a phone
the server health grid keeps the server name and the whole status ("⚠ Maintenance") and moves CPU into the drawer.

## The rule editor

`formatting: { editor: true }` adds **Conditional formatting** to the more menu. The editor lists the rules with a switch,
a preview, a summary and buttons to move, edit and delete each; switching, moving and deleting apply at once, and **Show
legend** toggles the legend. Editing a rule opens its form: name, screen reader description, the style (highlight, data
bar, colour scale or threshold bands), where it applies, and **Only rows where**, the filter builder's condition rows with
the formatting operators added for the column's kind, a match-case switch for text, and all/any/none groups two levels
deep. Escape steps back from a form to the list and closes the list. The editor is a modal dialog, full screen on phones.

Hosts open it with `api.openFormatRules()`, read rules with `api.getFormatRules()` and replace them with
`api.setFormatRules(rules)`, which validates the whole set (a bad set changes nothing) and resolves with the new rules.
`canopyx:format` (and `onFormat`) reports every change.

## Saved views

Rules that differ from the view's are part of the grid state: `getState()` returns them as `formatRules`, saved views and
the remembered state keep them, and `setState` and `applySavedView` bring them back. Resetting the view, or applying a view
saved without edits, returns to the view's rules.

## Print and export

- **Print.** Script-free output keeps the formatting: `CanopyStaticHtml.RenderGrid` evaluates the same rules and writes
  inline tints, accents, bars, icons, badges and cues, with the descriptions as cell titles and the legend under the
  table. In the browser, formatted cells print with exact colours.
- **Export records.** The records an export enumerates (the reporting runtime's print snapshots and host exports, and every
  export format's rows) carry each cell's resolved `format` beside its value and text, and a row rule's `format` on the
  record: `{ rules, tone?, icon?, badge?, cue?, band?, bar?: { fraction, tone }, color?, description? }`.
- **CSV** reads only values and text, so it is unchanged.
- **Styled spreadsheets.** A styled Excel export format (the planned OfficeIMO-based writer) carries rules in two ways: it
  paints each cell from its record's `format` (a fill for the tone, the icon and cue in the text, a bar as a cell bar), and
  it can map the declarative rules from `getFormatRules()` to native spreadsheet conditional formatting over the exported
  range: tones and conditions to formula rules with fills, `bar` to data bars, `scale` to two- and three-colour scales, and
  `bands` to icon sets or stacked rules, with theme tones resolved to the palette of the export.

## Remote grids

Rules evaluate in the browser on the rows a host source returns, as they arrive, so a host grid needs nothing on the server.
Automatic bounds use the rows received; give bounds when they matter across pages.

## Performance

Rules compile once into plain functions. A row is evaluated when it paints, and its result is cached by its data object for
the current rule set, so scrolling back repaints from the cache. A grid of 100,000 rows evaluates the few dozen rows it
shows; automatic bounds are one pass over the rows when the rules change. The browser tests hold a budget for scrolling a
100,000-row grid with rules against the same grid without them.

## .NET

```csharp
var view = new CanopyDataGridView("server-health", "Server health") { Formatting = new CanopyFormatOptions { Legend = true, Editor = true } };
// columns and rows ...
view.FormatRules.Add(CanopyFormatRule.ForRow("down", CanopyFormatStyle.Highlight(CanopyTone.Danger),
    CanopyFormatCondition.Where("status", CanopyFormatOperator.Equal, "Down")));
view.FormatRules[0].Label = "Server down";
view.FormatRules.Add(CanopyFormatRule.ForCell("cpu", "cpu", CanopyFormatStyle.DataBar(CanopyTone.Info, 0, 100)));
view.FormatRules.Add(CanopyFormatRule.ForCell("latency", "latency",
    CanopyFormatStyle.ColorScale(CanopyFormatColorScale.ThreeColor(CanopyTone.Success, CanopyTone.Warning, CanopyTone.Danger))));
view.FormatRules.Add(CanopyFormatRule.ForCell("disk", "disk",
    CanopyFormatStyle.ThresholdBands(new CanopyFormatBand(10, CanopyTone.Danger, "Critical"), new CanopyFormatBand(null, CanopyTone.Warning, "Low")),
    CanopyFormatCondition.Where("disk", CanopyFormatOperator.LessThanOrEqual, 20)));
```

`CanopyFormatRule`, `CanopyFormatCondition`, `CanopyFormatPredicate`, `CanopyFormatStyle`, `CanopyFormatDataBar`,
`CanopyFormatColorScale`, `CanopyFormatScaleStop`, `CanopyFormatBand`, `CanopyFormatIcons` and `CanopyFormatOptions` write
the same JSON the browser reads, and validate it as the browser does. A grid with rules carries the formatting part in
single-file pages, and the rule editor part when the editor is on.

## Parts and budgets

The formatting part (`canopyx-formatting.js` and `.css`) loads with a grid that has rules or formatting options, and with
the API methods; the rule editor part (`canopyx-format-editor.js` and `.css`) loads when the editor opens and requires the
filter editor part, whose condition rows it reuses. Each part has its own gzip guard: 13 KiB for the formatting part and
12.5 KiB for the editor, script and stylesheet together. The grid entry points carry only the loaders, the state hooks and the
manifest entries.

The editor's labels (`format*`) are in the label packs; their English texts ship with the parts, so every entry point
accepts them.
