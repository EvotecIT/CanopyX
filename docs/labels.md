# Label packs

CanopyX ships complete Polish, German, Spanish, French and Italian labels for search, filtering, grouping, selection, column controls, saved views, paging, export, host interactions and the static fallback. Host data and column titles remain the host's own text. Set the page language as well: it controls number and date formatting independently of the UI labels.

## .NET

Each factory returns an independent editable `CanopyLabels` instance:

```csharp
view.Labels = CanopyLabels.Polish(); // Also German(), Spanish(), French() and Italian().
view.Labels.Columns = "Pola raportu";
view.SaveHtmlPage("report.html", new CanopyHtmlOptions { Language = "pl" });
```

The writer carries browser labels in the view's `labels` object. A tree view carries the labels the tree runtimes read, its toolbar menus' `Grid*` labels (Views, Export, More, …) among them, and leaves the other flat-grid labels out, so a tree with a complete pack stays on a tree runtime (the interactive one, for the interaction texts) with translated menus. The same pack supplies the script-free fallback's notes, boolean values and time suffixes. `CanopyStaticHtmlOptions.Culture` controls its number formatting. Cloning or editing a pack does not change another factory result.

## JavaScript modules

```javascript
import { createDataGrid } from "@evotecit/canopyx/reporting";
import polish from "@evotecit/canopyx/locales/pl";

document.documentElement.lang = "pl";
const grid = createDataGrid(host, {
  view,
  labels: { ...polish, columns: "Pola raportu" }
});
```

Use `/locales/de` for German, `/locales/es` for Spanish, `/locales/fr` for French and `/locales/it` for Italian. The default export and named `labels` export contain every browser key, including the optional interaction/reporting strings. They are frozen. The ordinary `@evotecit/canopyx/grid` entry only knows the labels of the controls it draws: pass a complete pack to the reporting entry, or pick the keys you need. The tree entries (`core.js`, and `classic.js` and `@evotecit/canopyx` with the interaction texts) know the core texts and the tree toolbar menus' `grid*` labels (`CanopyX.labels` lists them); pick those keys from a pack for a tree. In .NET, setting a reporting-only label (`CanopyLabels.RequiresReportingRuntime`) on a flat grid selects the reporting entry automatically; a tree leaves flat-grid labels out instead. The named `staticLabels` export contains the four static-only keys (`overflowNote`, `unknownTotal`, `hiddenRows`, `fullReport`); a host rendering its own fallback can consume these separately. Static-only keys are not browser view fields.

The conditional formatting labels (`format*`, see [conditional formatting](conditional-formatting.md)) are part of every pack. Their English texts ship with the formatting parts rather than the entry points, so every entry point accepts them and `CanopyX.labels` does not list them; trees ignore them, and .NET leaves them out of tree documents.

## Offline classic scripts

Load the matching `canopyx-labels-pl.js`, `canopyx-labels-de.js`, `canopyx-labels-es.js`, `canopyx-labels-fr.js` or `canopyx-labels-it.js` asset alongside the chosen runtime. These assets are also exported as `/locales/pl.js`, `/de.js`, `/es.js`, `/fr.js` and `/it.js` in the JavaScript package.

```html
<script src="canopyx-reporting.js"></script>
<script src="canopyx-labels-pl.js"></script>
<script>
CanopyX.configure("inventory", { labels: CanopyXLocales.pl.labels });
</script>
```

Configure an automatically mounted fragment before `DOMContentLoaded`. Each classic pack exposes its frozen browser and static labels through `CanopyXLocales.<language>`. Portable .NET pages already contain their translated view labels and need no separate locale script. No network service or production dependency is required.

## Maintaining translations

`CanopyX/Views/Locales/labels.json` is the shared source, with Polish, German, Spanish, French and Italian values in that order. `Build/Sync-Assets.ps1` generates the .NET factories, JavaScript modules and classic assets. Edit the table and regenerate; do not edit generated files. The build rejects missing/extra keys and missing or changed placeholders. Coverage tests compare all `CanopyLabels` properties with every generated pack.

Keep placeholders such as `{count}`, `{total}`, `{column}` and `{time}` intact. A label whose wording depends on a number can give one form per plural category of the page language, chosen in the browser with `Intl.PluralRules`: `[one]{count} match[other]{count} matches`, or for Polish `[one]{count} dopasowanie[few]{count} dopasowania[many]{count} dopasowań[other]{count} dopasowania`. The categories are `zero`, `one`, `two`, `few`, `many` and `other`; `other` is required, every form keeps the label's placeholders (the build checks both), and a form cannot contain `[`. Any label may use plural forms; the match counts do. Polish count labels use forms such as “Wyniki: {count}” so they work with any number. Host overrides apply after view labels; omitted custom labels continue to use English defaults.

The editing labels (`gridEdit…`, see [editing.md](editing.md#labels)) are in every pack too. The grid's editing part brings their English texts when it loads; the grid entry points accept those names before it does, so a pack set on the view or passed by the host translates the editors, messages and edit bar.
