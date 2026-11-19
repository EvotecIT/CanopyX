# Select

A searchable select for forms and settings pages: one value or several as chips, options with descriptions, badges, icons,
avatars and flags, tags the reader creates, and matches loaded from the host. It enhances a native `<select>`, which stays in
the page and holds the answer, so plain forms submit it and the page works without the runtime. It ships in the lazy
`ui-select` part, which needs `ui-overlays`, and works outside flows and grid editing.

## Write a select from .NET

```csharp
using CanopyX;
using CanopyX.Html.Ui;

var country = new CanopySelect("country", "country", "Country", new CanopySelectOptions { Placeholder = "Choose a country" });
country.Items.Add(new CanopySelectOption("pl", "Poland") { Flag = "PL", Description = "Warsaw", Group = "Europe", Selected = true });
country.Items.Add(new CanopySelectOption("de", "Germany") { Flag = "DE", Badge = "EU", BadgeTone = CanopyTone.Info, Group = "Europe" });
string fragment = country.ToHtmlFragment();
```

The fragment is a `<label>` and a `[data-cx-select]` wrapper around the native select. Option data travels as `data-description`,
`data-badge`, `data-tone`, `data-icon`, `data-avatar` and `data-flag`, and `<optgroup>` labels become group headings. The builder
refuses script and non-image data addresses and flags that are not two-letter codes.

| Option | Meaning |
| --- | --- |
| `Multiple` | Several values, shown as chips with Remove buttons. `Max` limits how many. |
| `Search` | `true` by default: typing filters, ignoring case and accents, and matches descriptions too. `false` opens the list like a button. |
| `Tags` | Typed text can become a new value ("Add “Iceland”"); the runtime adds it to the native select. |
| `Source`, `MinLength` | An address that answers `?q=` with a JSON list of options (or `{ "options": [...] }`); asked from `MinLength` characters (1 by default). |
| `Placeholder`, `Required`, `Disabled` | As on a native select. |

## Control it from JavaScript

`select()` picks options the native select already has (or that a load answered), so the page writes them first:

```html
<label for="owner-field">Owner</label>
<div id="owner"><select id="owner-field" name="owner" multiple><option value="ada">Ada Lovelace</option></select></div>
```

```javascript
const owner = CanopyX.select('#owner', {
  load: async (query, signal) => (await fetch('/api/users?q=' + encodeURIComponent(query), { signal })).json(),
  renderIcon: name => myIcons.render(name),
  onChange: value => save(value)
});
await owner.ready;
owner.select(['ada']);
owner.getState();   // { value: ['ada'], open: false, query: '' }
```

`load(query, signal)` answers options for the typed text, 250 ms after typing stops (`delay`); a newer query cancels the older
one and its late answer is ignored. A failed load shows its message in the list. `options` replaces the native select's options.
`clear()`, `open()`, `close()` and `refresh()` (after the host changed the native options) complete the controller. The wrapper
fires `cx-select:change` with `{ value, source }`, and the native select fires `input` and `change` as when a reader picks.
`select()` and `clear()` change the value quietly unless `notifyApi` is set.

## Keyboard, screen readers and phones

The field follows the WAI-ARIA combobox pattern: the input is the combobox, its list is a listbox (multiselectable for a
multiple select), and `aria-activedescendant` follows the highlighted option. Down and Up open the list and move through it
(skipping disabled options), Home and End jump, Enter picks, Escape closes the list or clears a single value, Backspace removes
the last chip, and Tab leaves. A polite status says how many options match. The page's label for the native select names the
combobox.

The list opens above the page in the top layer, flips to stay on screen and fits phone widths; below 40rem the field and options
grow to touch size. The built-in locale packs translate `selectNoMatches`, `selectResults`, `selectCreate` and `selectRemove`.
