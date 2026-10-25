# Layout modes and density

A view with `layout` gets a **Layout** menu after Columns. The reader chooses how the columns are laid out and how dense
the rows are, and the choice is part of the state saved views and the remembered session keep.

| Mode | Behaviour | Views |
| --- | --- | --- |
| **Fit to width** (`fit`) | Today's behaviour: columns size to their content and give way by priority; hidden fields wait behind "+N" and the record drawer. | grids, trees |
| **All columns, scroll sideways** (`scroll`) | Every column keeps its own width, the identity column (the row header, or a tree's tree column) stays pinned, and the view scrolls sideways. | grids, trees |
| **Cards** (`cards`) | Records form a responsive grid of raised cards, with the first shown column as the title, presenter status pills and labeled fields. Phones show one card across. Group headings and expanded details retain their single-column projection. | grids |

| Density | Grid rows | Tree rows |
| --- | --- | --- |
| Compact | 28 px, 13 px text, 8 px padding | 24 px |
| Normal (`default`) | 34 px | 28 px |
| Comfortable | 42 px, 14 px padding | 36 px |

A view with its own row height keeps the same steps from it (an explicit 30 px grid row becomes 24 and 38 px).

## Turn it on

```csharp
grid.Layout = new CanopyLayoutOptions();                                  // every mode, starting in fit
phoneList.Layout = new CanopyLayoutOptions { Mode = CanopyLayoutMode.Cards, Density = CanopyGridDensity.Compact };
phoneList.Layout.Modes.Add(CanopyLayoutMode.Cards);                        // offer only cards and fit
phoneList.Layout.Modes.Add(CanopyLayoutMode.Fit);
tree.Layout = new CanopyLayoutOptions { Mode = CanopyLayoutMode.Scroll };  // trees offer fit and scroll
```

```js
createDataGrid(host, { view: { ...view, layout: { mode: "cards", modes: ["cards", "fit"], density: "compact" } } });
```

| Option | Default | Meaning |
| --- | --- | --- |
| `mode` | `fit`, or the first of `modes` | The layout the view opens with. |
| `modes` | every layout the view supports | The layouts the menu offers, in order. |
| `density` | the view's own density | The density the view opens with. A flat grid's `layout.density` takes the place of its `density` field. |

`toolbar.layout: false` (`Toolbar.Layout = false`) leaves the menu out while `setLayout` keeps working, so a host can
switch layouts from its own controls, for example by the panel's width.

## What switching keeps

Switching never runs a new query: the sort, the filters, the search and the selection stay, and the match count follows the
cells now shown (a card or the scroll layout shows the columns fit had hidden). The first
row in view stays in view (at the same share of its height), and keyboard focus stays on the same row and the same column's
cell. The menu and `setLayout` announce the new layout through the live region ("Layout: Cards, Compact"), fire
`canopyx:layout` with `{ mode, density }`, and save it with the view's state (`layout: { mode, density }`); **Reset view**
returns to the declared layout. A flat grid's remembered fit or scroll layout and density are in place before its first rows
are painted; cards, and a tree's remembered layout, follow as soon as the layouts part is installed.

## Cards

### Safe card token slots

`cardTemplate` replaces text within named column slots while retaining their column order, labels, selection controls and
keyboard navigation. Each `{columnId}` token reads that column's formatted cell text. Unspecified slots keep their ordinary
presenters. Templates and substituted values are literal text; HTML is displayed as text. A template allows at most 64 slots
of 2,048 UTF-16 code units each. Both slot names and tokens must refer to declared columns, and braces must form complete tokens.

```js
layout: { mode: "cards" },
cardTemplate: { name: "{name} — {status}", due: "Due: {due}" }
```

In C#, set `view.CardTemplate = new CanopyCardTemplate()` and populate `view.CardTemplate.Slots` with the same strings.
The static fallback uses those text templates when the declared layout is cards and escapes them as ordinary table content.
Switching back to fit or scroll restores each slot's ordinary presenter. Leave a status slot untemplated to keep its
existing `enum` or `state` presenter and tone. The gallery's `template-cards.html` combines a literal title slot with a
Status pill, Owner, Team and Priority fields, and a muted Due footer. No HTML or object-valued template is needed.

### Page-scroll headers

Set `stickyHeader: true` (`CanopyDataGridView.StickyHeader`) to keep an auto-height grid's real header visible while the page
scrolls through the grid. The default is off. It applies when all rows fit inside the grid; a vertically scrolling grid or
`autoHeight: false` keeps its ordinary header. Cards have no visible column header. Sorting, column menus and keyboard focus
continue to use the original header; there is no cloned interactive row. Set `--cx-sticky-top: 48px` on the host when a page
toolbar occupies the top of the viewport. The header stops at the grid's end, restores on layout changes and is released on
destruction. It uses the optional layouts part even when the view has no Layout menu. See `sticky-grid.html` in the gallery.

### Card sizing

Cards share the available width in equal columns with a minimum width of about 280 px and 16 px gutters. A 1440 px
page normally shows four cards across; a 390 px page shows one. Inside each card, the first shown column is a strong title,
`enum` and `state` presenters occupy a full-width status slot, and ordinary fields flow in column order into a label/value
grid. Wrapping and long-text fields occupy a full line. A final date/time column becomes a muted footer. Colors, border,
radius and selection use the host's existing theme tokens.

Every card has the same computed height. The optional layouts part maps logical record positions into visual bands;
virtualization, paging and `scrollToRow` still count records. ARIA indices and DOM order stay in logical record order,
Arrow Up/Down continue moving by one record, and Page Up/Down move by a viewport of card bands. Resizing retains the first
visible band and focused record; changing layout retains the query and selection. Values that do not fit their slot end
with an ellipsis: the record drawer (a tap on a phone or Enter) shows them whole.

Group and expanded-detail projections retain their existing single-column layout and measured offsets. Their records
receive the same card surfaces and field hierarchy while full-width headings, collapse controls and detail rows keep their
existing navigation and loading behavior. Hosted flat grids use the responsive grid, including loading placeholders.

The header row steps aside in the card layout, since every field carries its column title. A **Sort by** menu appears in the
toolbar instead (a bottom sheet on phones): a press on a column sorts by it and a second press reverses it (Shift adds it to
the sort), the active sort shows its direction, the button beside each column opens that column's menu (filter, hide, pin
and the rest), and a reporting grid's select-all commands (`selectionControls`) sit at the top. The menu leaves with the card
layout.

Trees keep their rows in cards' place: a tree's levels, expanders and keyboard model belong to rows, and on a phone the fit
layout already gives the tree column the width while "+N" opens a node's other fields.

## Print

Print never scrolls. Without an `onPrint` hook, a flat grid prints its bounded captured records as stacked cards or a
table. Card templates keep their formatted token values, including inputs from hidden exportable columns, without adding
those inputs as separate printed fields. Tokens use the same formatted cell text as the card, without adding secondary
presenter text. If a template references a non-exportable column, that slot prints its own formatted cell text instead.
CSV and other exports retain their own column projection.

A flat grid's `onPrint` hook receives `layout: "stacked"` from a grid in the card layout and `layout: "table"` otherwise,
with the original export projection. A tree prints its outline table in every layout.

## API

| Member | Meaning |
| --- | --- |
| `getLayout()` | `{ mode, density, modes }`. |
| `setLayout({ mode, density })` | Switches either or both; resolves to the new `getLayout()`. Rejects a mode the view does not offer. |
| `canopyx:layout` event | `{ mode, density }` after each switch. |

`setLayout` rejects on a view that does not declare `layout`.

## Loading

The Layout menu, the card layout and density for trees come with the `layouts` part (`canopyx-layouts.js` and `.css`),
which loads when a view declares `layout`. The scroll mode's fitting is part of the runtime, so a remembered scroll layout
needs no part before the first rows. Single-file pages carry the part only when a view declares the feature.
