# Change views

Three views answer "did it really change, and what changed?" for any host that watches files or settings: a **text diff**, a
**change list** of files or items, and a **propagation view** of how one change reached its replicas. CanopyX draws them; the
host computes the facts (hashes, flags, states) and carries out every action.

- [Quick start](#quick-start)
- [The text diff](#the-text-diff)
- [The change list](#the-change-list)
- [The propagation view](#the-propagation-view)
- [Static output, print and email](#static-output-print-and-email)
- [Keyboard and screen readers](#keyboard-and-screen-readers)
- [Labels, themes and right to left](#labels-themes-and-right-to-left)
- [API](#api)
- [Packaging and size](#packaging-and-size)
- [Limits](#limits)

## Quick start

```csharp
var list = new CanopyChangeList("share-changes", "Changes on the deployment share");
list.Action("copy-unc", "Copy the network path", CanopyChangeActionIcon.Copy, copy: "unc")
    .Action("acknowledge", "Acknowledge", CanopyChangeActionIcon.Check);
var item = list.Add("payload", CanopyChangeKind.Added, "Scripts/Logon/agent.exe");
item.After = new CanopyChangeVersion { Size = 1_248_256, Hash = sha256, Time = seen };
item.Flag("unsigned", "Unsigned", "The file has no embedded signature.", CanopyTone.Danger);
item.Values["unc"] = @"\\fs01\deploy\Scripts\Logon\agent.exe";

var script = list.Add("logon", CanopyChangeKind.Modified, "Scripts/Logon/map-drives.ps1");
script.Diff = CanopyTextDiff.FromTexts("logon-diff", "map-drives.ps1", before, after, compare: true);

var propagation = new CanopyPropagation("p", "Propagation") { Start = seen, AsOf = now, Title = "File server" };
propagation.Witness("fs01", "FS01", CanopyPropagationState.Converged).FirstSeen = seen;

string html = list.ToHtmlFragment() + propagation.ToHtmlFragment();     // with a data-grid or reporting entry point on the page
string mail = CanopyStaticHtml.RenderChanges(list);                       // script-free, for email and print
```

In JavaScript, `createDiff(host, { view })`, `createChangeList(host, { view })` and `createPropagation(host, { view })` take
the same documents. The grid and reporting entry points carry these functions; the views themselves load with the lazy
`changes` part on first use. Classic scripts reach them as `CanopyX.createDiff` and so on.

```js
import { createChangeList, createDiff } from "@evotecit/canopyx/grid";
import "@evotecit/canopyx/grid.css";
import "@evotecit/canopyx/changes.js";
import "@evotecit/canopyx/changes.css";

// The host serves serialized canopyx/2 view documents at these endpoints.
async function loadView(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`View request failed: ${response.status}`);
  return response.json();
}
const [changeListDocument, diffDocument] = await Promise.all([
  loadView("/api/views/changes"), loadView("/api/views/diff")
]);
const list = createChangeList(document.getElementById("changes"), { view: changeListDocument });
const diff = createDiff(document.getElementById("diff"), { view: diffDocument });
```

`ChangeViewsExample` in `CanopyX.Examples` writes
`changes.html` (and its dark page), `changes-diff-large.html` (a 20,000-line file) and `changes-static.html`.

## The text diff

A diff shows one file: its path (`previousPath → path` for a move), the lines added and removed, and the lines themselves, inline
or side by side (side by side when the diff is 900 pixels wide or more, unless the document or the reader chooses). Lines carry
both numbers; inside a removed line and the added line that takes its place, the words that changed are marked (`del` and `ins`).
Unchanged runs longer than the context (3 lines by default) fold into a row that opens in place ("Show 18 more lines"), and the
lines before, between and after the hunks fold the same way when the diff has its texts.

**Hunks or texts.** Prefer hunks the host computed:

```json
{ "protocol": "canopyx/2", "type": "diff", "id": "logon", "label": "map-drives.ps1", "path": "Scripts/Logon/map-drives.ps1",
  "hunks": [{ "before": 5, "after": 5, "lines": [" Sales = 1", "-Support = 2", "+Support = 3", "+Legal = 4"] }] }
```

Each hunk names its first line on each side and lists its lines as a unified diff writes them (`" "`, `"-"`, `"+"`). In C#,
`AddLines` builds hunks from numbered lines (a host's own comparison), and `Compare()` computes them from `BeforeText` and
`AfterText`. A diff that carries only the texts is compared in the browser when each has at most 5,000 lines
(`ClientCompareLines`); longer texts say they are too long to compare there. Both sides use the same comparison: the common
start and end are set aside, the middle is compared with Myers' algorithm, removed lines come before added ones within a change,
and a middle that needs more than 2,000 edits is one replacement. `tests/fixtures/diff-cases.json` holds the cases both must agree on.

| Property | Meaning |
| --- | --- |
| `path`, `previousPath` | The file and, for a move or rename, where it was. |
| `content` | `binary`, `unavailable` or `identical` instead of text: no lines, the `message` (or a default text) instead. |
| `message` | Why there are no lines, or a note shown first. |
| `beforeTitle`, `afterTitle` | The side-by-side column titles, such as "Before · DC01, 10:31". "Before" and "After" by default. |
| `before`, `after` | The whole texts: both or neither. With hunks they must match them; they let folded regions open. |
| `hunks` | The hunks in order; the unchanged lines between them are as many on both sides. |
| `context` | Unchanged lines around a change, 0 to 20; 3 by default. |
| `layout` | `inline` or `split`; side by side when there is room, by default. |
| `notes` | Up to 16 notes the lines cannot show (`{ text, tone }`), such as changed line endings. |
| `truncated` | The host left changes out; the diff says so. |
| `unified` | The host's copy-ready unified diff. Otherwise Copy writes one from the hunks (`--- a/…`, `+++ b/…`, `@@ -12,7 +12,8 @@`). |

The rows are windowed: only those in view (and an overscan) are elements, so a diff of 200,000 lines scrolls as one of 20.
Lines do not wrap; long lines scroll sideways. The scroll area is at most `--cx-diff-max-height` tall (70vh by default), or fills
a host given a height.

## The change list

A change list shows files or items with what happened to them: **Added**, **Removed**, **Modified** and **Renamed** badges (an
item's `kindLabel` can say more, such as "Owner changed"), grouped under their folders. Each row shows the name (or the whole path
when the list is not grouped), the earlier path of a renamed item, its risk flags, a quiet line with its secondary text and time,
its size and short hash before and after (the whole hash is the tooltip; a click copies it), and its actions.

The bar above lists each kind that occurs with its count; pressing kinds filters to them. **Flagged only** keeps the items with a
flag. Opening an item shows its flags with their reasons, its versions and facts side by side (values that changed are bold) and
its diff, which mounts the first time.

| Property | Meaning |
| --- | --- |
| `items` | Up to 10,000: `id`, `kind`, `path`, `previousPath` (required when renamed), `kindLabel`, `secondary`, `before` and `after` (`{ size, hash, time }`), `facts` (`{ label, before?, after?, tone?, note? }`; an added item shows only after values and a removed one only before values, and `note` is quiet text under the values), `flags` (`{ id, label, reason, tone? }`; warning by default), `diff` (a diff without its envelope), `actions` and `values`. |
| `actions` | Up to 8: `id`, `label`, `icon` (copy, diff, check, open, download, compare, flag) and at most one of `copy`, `link`, `reveal` and `reason` (see below). An item offers the actions it names, or all of them, and only those it has a value, an address or a diff for. |
| `toolbar` | Up to 8 actions of the list's bar: host actions, those that ask for a reason, and copy and link actions on the list's own `values`. |
| `values` | Up to 16 values of the list, for the bar's copy and link actions, such as the address of the object that changed. |
| `exports` | `csv`, `json` or both: buttons in the bar that download the items the filters keep, in the order the list shows them. |
| `groupByFolder` | Group by folder (default); false lists whole paths. |
| `flaggedOnly`, `expandFlagged` | Open on the flagged items; open the flagged items' details. |
| `hashLength` | Characters of a hash shown, 4 to 64; 8 by default. |
| `pageSize` | Items shown before "Show more", 10 to 1,000; 200 by default. |
| `timeZone` | `utc` (default, marked "UTC") or `local`. |

CanopyX never acts on an item. An action is one of these:

- **A host action** raises `canopyx:changeAction` (cancelable) with the list, action and item ids, the kind, paths and values (the
  list's values and a null item for a bar action). The host claims it by cancelling the event or by passing `onAction`. An action
  nobody claims says so in the list ("This page cannot carry out “Acknowledge” itself") and offers **Copy request**, the event's
  detail as JSON, so a read-only page (a report, an email's link) never drops the reader's request silently.
- **`reason: true`** makes a host action ask for a reason first: a field with the action's own button and Cancel opens under the
  item (or the bar); confirming without a reason says "Enter a reason first."; Ctrl+Enter confirms and Escape cancels. The event
  carries `reason`. Governed changes, such as acknowledging or marking a change as expected, need one.
- **`copy`** writes `path`, `previousPath` or a value to the clipboard (the Clipboard API, or a selected text area where it is
  unavailable) and raises the event with `copied` true or false.
- **`link`** opens `path` or a value as a link (`#…`, `/…`, `./…`, `../…`, `http(s)://…` and `mailto:` addresses without backslashes or control characters; any other address leaves
  the action out), and raises the event with `href`.
- **`reveal`** (`details` or `diff`) opens the item and brings its details or its diff into view, focused, and raises the event with
  `reveal`.

The exports write `<id>.csv` (UTF-8 with a byte-order mark: kind, label, paths, secondary text, sizes, hashes, times, flags with their
reasons, facts and one column per value key; text that a spreadsheet would read as a formula starts with `'`) and `<id>.json` (the
list, the filters in effect and each item with its versions, flags, facts, values and its diff as unified text when it has one),
then raise `canopyx:changeExport` with the format and count.

## The propagation view

The propagation view shows how a change reached its replicas (servers, domain controllers): the overall state and a summary, a
count of each state, then a row per replica with its state, when the change was first seen there and how long after the change,
when it last reported, and a lane that draws the delay against the time since the change.

| State | Symbol | Meaning |
| --- | --- | --- |
| `converged` | check | The replica has the change. |
| `propagating` | clock | Not there yet, within the time it is allowed. The lane runs on, striped. |
| `fault` | cross | Still different past the time it is allowed, or holding something else. |
| `unknown` | question mark | No current proof either way. |

`start` is when the change happened (the earliest first sighting by default) and `asOf` when the evidence is from (the latest
sighting or report by default). `state` overrides the worst replica's, `summary` the count sentence, `title` the replica column's
title. Replicas with a `group` show under its heading, counted with `groupCount` (`"[one]{count} server[other]{count} servers"`).
Narrow hosts (560 pixels and less) stack each replica's cells.

## Static output, print and email

`CanopyStaticHtml.RenderDiff`, `RenderChanges` and `RenderPropagation` write script-free tables with inline styles. The diff is
one column of lines with both numbers and a `+` or `−` sign, the changed words as `del` and `ins` on a stronger tint and folded
regions as a counted row; the list is a row per item with its badge, flags and reasons, under folder headings; the propagation view
is a row per replica with its symbol and state, times in UTC and delays. Every table asks print to keep its tints
(`print-color-adjust: exact`), and no state relies on colour alone. In the browser, printing draws every diff line (up to 5,000)
as one table and hides the tools, also for a diff that mounts while the page prints (a tab the host opens for printing). A printed
change list shows every item the filters keep (up to 2,000) and names the filters in effect ("Filtered: Added, Flagged only").

## Keyboard and screen readers

- The diff's lines are one tab stop (`role="table"` with `aria-rowcount` for every row): arrows, Page Up and Down, Home and End
  scroll; `n` and `p` (or Alt with Down and Up) move to the next and previous change, as the toolbar buttons do, and a live region
  says "Change 2 of 5". Each line starts with hidden text ("Removed line 12: "); the layout choice is a radio group.
- The change list's details buttons say which item they open and whether they are open; Up, Down, Home and End move between them.
  Each item's actions and the bar's tools are labelled groups; icon buttons carry their label as their name and tooltip. A reason
  field is labelled, described by its hint and marked invalid with an alert when it is empty; focus returns to the action after it.
- The propagation view is a table with row and group headers; the lanes are decorative and the delays are text.

## Labels, themes and right to left

The texts the views write are the `change…` labels, translated in the five label packs. The views follow the host's theme,
including dark (`data-cx-theme`), and use logical properties, so right-to-left pages mirror them.

## API

| View | Members |
| --- | --- |
| Diff | `getLayout()`, `setLayout("inline" \| "split")`, `next()`, `previous()`, `expandAll()`, `copy()`, `getHunks()`, `update(view)`, `destroy()`, `ready`. Events `canopyx:diffReady`, `canopyx:diffLayout`, `canopyx:diffCopy`; options `onReady`, `onLayout`, `onCopy`. |
| Change list | `getState()`, `setState({ kinds, flaggedOnly, open })`, `toggle(id, open?)`, `focusItem(id)`, `update(view)`, `destroy()`, `ready`. Events `canopyx:changesReady`, `canopyx:changeAction`, `canopyx:changeToggle`, `canopyx:changesState`, `canopyx:changeExport`; options `onReady`, `onAction`, `onToggle`, `onStateChange`, `onExport`, `state`. |
| Propagation | `update(view)`, `destroy()`, `ready`. Event `canopyx:propagationReady`. |

TypeScript: `DiffDocument`, `ChangeListDocument`, `PropagationDocument` and their options and APIs from `@evotecit/canopyx/grid`.

Invalid documents show an alert and raise `canopyx:error` with the validation error. If a supplied diff's hunks do not match its
file text, the alert explains the mismatch. An invalid `update(view)` removes the preceding view and its Copy/export actions,
then throws the validation error; it never leaves the preceding diff available as if it represented the rejected document.
Pass a valid document to `update(view)` to recover. An initial invalid document rejects `ready`.

## Packaging and size

The views ship as the lazy `changes` part (`canopyx-changes.js` and `.css`, about 28 KB gzip, guard 30 KiB), loaded by the grid
and reporting entry points when a change view mounts; those entry points carry only the three create functions. CanopyX.Html writes
a change view's page with the data-grid entry point and embeds the part in single-file pages.

## Limits

- A diff: 200,000 lines in its hunks, 20,000 characters a line, 2,000,000 characters a text; the browser compares texts of up to
  5,000 lines. Lines do not wrap on screen.
- A change list: 10,000 items, 8 actions and 8 bar actions, 16 values of its own, 16 flags, 32 facts and 16 values an item. All
  items render (in pages of `pageSize`).
- A propagation view: 2,000 replicas.
