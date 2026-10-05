# Label packs

CanopyX ships complete Polish, German and Spanish labels for search, filtering, grouping, selection, column controls, saved views, paging, export, host interactions and the static fallback. Host data and column titles remain the host's own text. Set the page language as well: it controls number and date formatting independently of the UI labels.

## .NET

Each factory returns an independent editable `CanopyLabels` instance:

```csharp
view.Labels = CanopyLabels.Polish(); // Also German() and Spanish().
view.Labels.Columns = "Pola raportu";
view.SaveHtmlPage("report.html", new CanopyHtmlOptions { Language = "pl" });
```

The writer carries browser labels in the view's `labels` object. The same pack supplies the script-free fallback's notes, boolean values and time suffixes. `CanopyStaticHtmlOptions.Culture` controls its number formatting. Cloning or editing a pack does not change another factory result.

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

Use `/locales/de` for German and `/locales/es` for Spanish. The default export and named `labels` export contain every browser key, including the optional interaction/reporting strings. They are frozen. The named `staticLabels` export contains the four static-only keys (`overflowNote`, `unknownTotal`, `hiddenRows`, `fullReport`); a host rendering its own fallback can consume these separately. Static-only keys are not browser view fields.

## Offline classic scripts

Load the matching `canopyx-labels-pl.js`, `canopyx-labels-de.js` or `canopyx-labels-es.js` asset alongside the chosen runtime. These assets are also exported as `/locales/pl.js`, `/de.js` and `/es.js` in the JavaScript package.

```html
<script src="canopyx-reporting.js"></script>
<script src="canopyx-labels-pl.js"></script>
<script>
CanopyX.configure("inventory", { labels: CanopyXLocales.pl.labels });
</script>
```

Configure an automatically mounted fragment before `DOMContentLoaded`. Each classic pack exposes its frozen browser and static labels through `CanopyXLocales.<language>`. Portable .NET pages already contain their translated view labels and need no separate locale script. No network service or production dependency is required.

## Maintaining translations

`CanopyX/Views/Locales/labels.json` is the shared source, with Polish, German and Spanish values in that order. `Build/Sync-Assets.ps1` generates the .NET factories, JavaScript modules and classic assets. Edit the table and regenerate; do not edit generated files. The build rejects missing/extra keys and missing or changed placeholders. Coverage tests compare all `CanopyLabels` properties with every generated pack.

Keep placeholders such as `{count}`, `{total}`, `{column}` and `{time}` intact. Polish count labels use forms such as “Wyniki: {count}” so they work with any number. Host overrides apply after view labels; omitted custom labels continue to use English defaults.
