---
title: Use CanopyX from JavaScript
order: 2
description: Install the npm package, mount a tree grid in your page, choose a runtime for trees, flat grids or reporting, and translate the controls.
layout: docs
---

## Install

```shell
npm install @evotecit/canopyx
```

The package includes ES modules, classic scripts, stylesheets and TypeScript declarations, with no runtime package dependencies.

## Mount a tree grid

Add a container with a height to your page:

```html
<div id="files" style="height: 360px"></div>
```

Then mount a view document on it. The document is the same `canopyx/2` view the C# writer produces, so a server can send it as JSON instead of the page building it.

{{< cnx-example id="js-mount" caption="This snippet running in a page that loads the classic script, which exposes the same createTreeGrid as window.CanopyX. Click a row, sort by Name or search for plan." >}}

The stylesheet import uses your application's asset pipeline. For a page without a bundler, serve `classic.js` and `styles.css` from the installed package and load them with `<script>` and `<link>` elements; the script exposes `window.CanopyX`. Use one matching runtime and stylesheet per page.

## Choose a runtime

Each entry point has its own stylesheet. A flat grid needs a grid-capable runtime; the reporting runtime adds grouping, facets, aggregates and presenters on top of the flat grid.

{{< cnx-render id="runtimes" label="CanopyStaticHtml.RenderGrid(runtimes)" caption="The npm entry points, as a table the CanopyX static renderer drew for this page." >}}

Module imports are safe on the server; mounting a view requires a browser. The included TypeScript declarations describe the view, data-source and event APIs. Flat grids mount with `createDataGrid` from `@evotecit/canopyx/grid`.

## Translate the controls

Import labels from `@evotecit/canopyx/locales/pl`, `/locales/de`, `/locales/es`, `/locales/fr` or `/locales/it` and pass them as `labels` in your view definition. In C#, set the view's `Labels` before writing the page:

{{< cnx-example id="labels" caption="The file explorer from Getting started with the Polish labels: the search box, the Columns menu and the messages the runtime writes are translated, while your column titles and data stay as you wrote them." >}}

`CanopyLabels.German()`, `CanopyLabels.Spanish()`, `CanopyLabels.French()` and `CanopyLabels.Italian()` work the same way.
