# Layout modes and density

A view with `layout` gets a **Layout** menu after Columns. The reader chooses how the columns are laid out and how dense
the rows are, and the choice is part of the state saved views and the remembered session keep.

| Mode | Behaviour | Views |
| --- | --- | --- |
| **Fit to width** (`fit`) | Today's behaviour: columns size to their content and give way by priority; hidden fields wait behind "+N" and the record drawer. | grids, trees |
| **All columns, scroll sideways** (`scroll`) | Every column keeps its own width, the identity column (the row header, or a tree's tree column) stays pinned, and the view scrolls sideways. | grids, trees |
| **Cards** (`cards`) | Each record is a card: its first shown column (the row header by default) as the title, then every other shown field with its column title as a label. For phones and narrow panels. Group headings of a grouped grid stay one-line headings. | grids |

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

A card's height follows the grid's width: the fields flow into as many columns as fit (each at least 140 px wide), spread
evenly over the fewest lines; free text (wrapping, long text, tags, lists and flexible columns) takes two slots. Every card
of a grid has the same height, so virtual rows, scroll positions, `scrollToRow` and Page Up/Down keep working on any number
of records; a wider panel re-flows the cards and keeps the first card in view. Values that do not fit their slot end with an
ellipsis: the record drawer (a tap on a phone, Enter, or the "+N" button) shows them whole.

The header row steps aside in the card layout, since every field carries its column title. A **Sort by** menu appears in the
toolbar instead (a bottom sheet on phones): a press on a column sorts by it and a second press reverses it (Shift adds it to
the sort), the active sort shows its direction, the button beside each column opens that column's menu (filter, hide, pin
and the rest), and a reporting grid's select-all commands (`selectionControls`) sit at the top. The menu leaves with the card
layout.

Trees keep their rows in cards' place: a tree's levels, expanders and keyboard model belong to rows, and on a phone the fit
layout already gives the tree column the width while "+N" opens a node's other fields.

## Print

Print never scrolls. A flat grid's `onPrint` hook receives `layout: "stacked"` from a grid in the card layout and
`layout: "table"` otherwise, so the host prints stacked records or a table; a tree prints its outline table in every
layout.

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
