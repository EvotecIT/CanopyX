---
title: Use CanopyX from JavaScript
order: 1
description: Install the npm package, mount a tree grid in your page, choose a runtime for trees, flat grids or reporting, and translate the controls.
layout: docs
---

## Install

```shell
npm install @evotecit/canopyx
```

The package includes ES modules, classic scripts, stylesheets and TypeScript declarations, with no runtime package dependencies.

## Mount a tree grid

Add a container to your page:

```html
<div id="files" style="height: 360px"></div>
```

Then mount the view:

```javascript
import { createTreeGrid } from "@evotecit/canopyx";
import "@evotecit/canopyx/styles.css";

const grid = createTreeGrid(document.getElementById("files"), {
  view: {
    protocol: "canopyx/2", type: "view", id: "files", label: "Project files",
    rowHeight: 28, pageSize: 100, selection: "single",
    search: { minLength: 1, maxResults: 50 },
    columns: [{ id: "name", title: "Name", kind: "text", width: 320 }],
    source: { kind: "inline" },
    roots: [{
      id: "projects", label: "Projects",
      children: [{ id: "quarterly-report", label: "Quarterly report.pdf" }]
    }]
  }
});

await grid.ready;
```

The stylesheet import uses your application's asset pipeline. For a page without a bundler, serve `classic.js` and `styles.css` from the installed package and load them with `<script>` and `<link>` elements; the script exposes `window.CanopyX`. Use one matching runtime and stylesheet per page.

## Choose a runtime

| Import | Use it for | Stylesheet |
| --- | --- | --- |
| `@evotecit/canopyx` | Interactive tree grids | `@evotecit/canopyx/styles.css` |
| `@evotecit/canopyx/grid` | Flat data grids | `@evotecit/canopyx/grid.css` |
| `@evotecit/canopyx/reporting` | Flat grids with reporting controls | `@evotecit/canopyx/reporting.css` |

Module imports are safe on the server; mounting a view requires a browser. The included TypeScript declarations describe the view, data-source and event APIs.

## Translate the controls

Import labels from `@evotecit/canopyx/locales/pl`, `/locales/de` or `/locales/es` and pass them as `labels` in your view definition. In C#, set the view's `Labels` to `CanopyLabels.Polish()`, `German()` or `Spanish()` before writing the page.