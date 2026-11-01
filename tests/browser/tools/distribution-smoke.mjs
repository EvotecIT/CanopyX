// Run through npm: its CLI path is supplied by npm_execpath on Windows, Linux, and macOS.
// This is validation tooling, never part of the dependency-free library build.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execute = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const browserRoot = path.resolve(here, "..");
const repo = path.resolve(browserRoot, "../..");
const npmCli = process.env.npm_execpath;
assert.ok(npmCli, "Run npm run test:distribution in tests/browser.");
const parent = path.join(browserRoot, "bench-results");
await fs.mkdir(parent, { recursive: true });
const output = await fs.mkdtemp(path.join(parent, "distribution-"));
try {
  const run = (file, args, cwd) => execute(file, args, { cwd, timeout: 120000, maxBuffer: 2 * 1024 * 1024 });
  const result = await run(process.execPath, [npmCli, "pack", "--ignore-scripts", "--json", "--pack-destination", output], repo);
  const [packed] = JSON.parse(result.stdout);
  const expected = ["LICENSE", "ThirdParty/OfficeIMO/LICENSE", "ThirdParty/OfficeIMO/README.md", "README.md", "README.nuget.md", "package.json", "docs/images/tree-grid-light.png", "docs/images/tree-grid-dark.png", "docs/images/static-outline.png", "JavaScript/index.d.ts", "JavaScript/ui.d.ts", "JavaScript/hosts.d.ts", "JavaScript/protocol.d.ts", "JavaScript/plugins.d.ts", "JavaScript/enhance.d.ts", "JavaScript/editing.d.ts", "JavaScript/formatting.d.ts", "JavaScript/column-groups.d.ts", "JavaScript/cell-ranges.d.ts", "JavaScript/records.d.ts", "JavaScript/live.d.ts", "JavaScript/facets.d.ts", "JavaScript/calendar.d.ts", "JavaScript/time-slider.d.ts", "JavaScript/stack.d.ts", "JavaScript/path.d.ts", "JavaScript/plan.d.ts", "JavaScript/board.d.ts", "JavaScript/flow.d.ts", "JavaScript/matrix.d.ts", "JavaScript/changes.d.ts", "JavaScript/view-intents.d.ts",
    "CanopyX.Html/Assets/canopyx-module.mjs", "CanopyX.Html/Assets/canopyx.js", "CanopyX.Html/Assets/canopyx.css",
    "CanopyX.Html/Assets/canopyx-interactive.js", "CanopyX.Html/Assets/canopyx-interactive.css", "JavaScript/grid.d.ts", "JavaScript/pivot.d.ts",
    "CanopyX.Html/Assets/canopyx-grid-module.mjs", "CanopyX.Html/Assets/canopyx-grid.js", "CanopyX.Html/Assets/canopyx-grid.css",
    "CanopyX.Html/Assets/canopyx-ui-module.mjs", "CanopyX.Html/Assets/canopyx-ui.js", "CanopyX.Html/Assets/canopyx-ui.css",
    "CanopyX.Html/Assets/canopyx-reporting-module.mjs", "CanopyX.Html/Assets/canopyx-reporting.js", "CanopyX.Html/Assets/canopyx-reporting.css",
    "CanopyX.Html/Assets/canopyx-filter-editor.js", "CanopyX.Html/Assets/canopyx-filter-editor.css", "CanopyX.Html/Assets/canopyx-export.js", "CanopyX.Html/Assets/canopyx-history.js", "CanopyX.Html/Assets/canopyx-pager.js", "CanopyX.Html/Assets/canopyx-pager.css", "CanopyX.Html/Assets/canopyx-enhance.js", "CanopyX.Html/Assets/canopyx-data.js", "CanopyX.Html/Assets/canopyx-editing.js", "CanopyX.Html/Assets/canopyx-editing.css", "CanopyX.Html/Assets/canopyx-forms.js", "CanopyX.Html/Assets/canopyx-forms.css", "CanopyX.Html/Assets/canopyx-flow.js", "CanopyX.Html/Assets/canopyx-flow.css", "CanopyX.Html/Assets/canopyx-matrix.js", "CanopyX.Html/Assets/canopyx-matrix.css", "CanopyX.Html/Assets/canopyx-changes.js", "CanopyX.Html/Assets/canopyx-changes.css", "CanopyX.Html/Assets/canopyx-flow-module.mjs", "CanopyX.Html/Assets/canopyx-flow-entry.js", "CanopyX.Html/Assets/canopyx-flow-entry.css", "CanopyX.Html/Assets/canopyx-tree-tools.js", "CanopyX.Html/Assets/canopyx-tree-tools.css", "CanopyX.Html/Assets/canopyx-detail-rows.js", "CanopyX.Html/Assets/canopyx-detail-rows.css", "CanopyX.Html/Assets/canopyx-grouping.js", "CanopyX.Html/Assets/canopyx-grouping.css",
    "CanopyX.Html/Assets/canopyx-links.js", "CanopyX.Html/Assets/canopyx-search.js", "CanopyX.Html/Assets/canopyx-link.js", "CanopyX.Html/Assets/canopyx-link.css",
    "CanopyX.Html/Assets/canopyx-formatting.js", "CanopyX.Html/Assets/canopyx-formatting.css", "CanopyX.Html/Assets/canopyx-format-editor.js", "CanopyX.Html/Assets/canopyx-format-editor.css",
    "CanopyX.Html/Assets/canopyx-column-groups.js", "CanopyX.Html/Assets/canopyx-column-groups.css", "CanopyX.Html/Assets/canopyx-cell-range.js", "CanopyX.Html/Assets/canopyx-cell-range.css",
    "CanopyX.Html/Assets/canopyx-highlight.js", "CanopyX.Html/Assets/canopyx-highlight.css", "CanopyX.Html/Assets/canopyx-layouts.js", "CanopyX.Html/Assets/canopyx-layouts.css", "CanopyX.Html/Assets/canopyx-record-panel.js", "CanopyX.Html/Assets/canopyx-record-panel.css", "CanopyX.Html/Assets/canopyx-live.js", "CanopyX.Html/Assets/canopyx-live.css", "CanopyX.Html/Assets/canopyx-facets.js", "CanopyX.Html/Assets/canopyx-facets.css",
    "CanopyX.Html/Assets/canopyx-calendar.js", "CanopyX.Html/Assets/canopyx-calendar.css", "CanopyX.Html/Assets/canopyx-calendar-recurrence.js", "CanopyX.Html/Assets/canopyx-calendar-edit.js", "CanopyX.Html/Assets/canopyx-calendar-ics.js", "CanopyX.Html/Assets/canopyx-timeline.js", "CanopyX.Html/Assets/canopyx-timeline.css",
    ...['pl','de','es','fr','it'].flatMap(code=>[`JavaScript/locales/${code}.mjs`,`JavaScript/locales/${code}.d.ts`,`CanopyX.Html/Assets/canopyx-labels-${code}.js`])];
  // Lazy parts are loaded relative to the shipped entry points. Their manifest is the asset contract, including features
  // that an import-only smoke check never loads.
  const manifest = JSON.parse(await fs.readFile(path.join(repo, "CanopyX.Html/Assets/canopyx-parts.json"), "utf8"));
  const partAssets = manifest.parts.flatMap(part => [part.script, part.style].filter(Boolean).map(file => "CanopyX.Html/Assets/" + file));
  assert.deepEqual(packed.files.map(file => file.path).sort(), [...new Set([...expected, ...partAssets])].sort(),
    "Package only the declared user assets and types, including every lazy runtime part.");
  const metadata = JSON.parse(await fs.readFile(path.join(repo, "package.json"), "utf8"));
  assert.equal(metadata.repository?.url, "git+https://github.com/EvotecIT/CanopyX.git", "npm provenance identifies the publishing repository.");
  assert.match(metadata.version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/, "npm uses a three-part release version.");
  assert.equal(packed.version, metadata.version, "The packed archive has the selected npm release version.");
  assert.equal(metadata.dependencies, undefined, "The JavaScript runtime has no package dependencies.");
  const consumer = path.join(output, "consumer");
  await fs.mkdir(consumer);
  await fs.writeFile(path.join(consumer, "package.json"), JSON.stringify({ private: true, type: "module" }));
  await run(process.execPath, [npmCli, "install", "--ignore-scripts", "--no-audit", "--no-fund", "--package-lock=false",
    path.join(output, packed.filename)], consumer);
  await fs.copyFile(path.join(browserRoot, "types/consumer.ts"), path.join(consumer, "consumer.ts"));
  await run(process.execPath, [path.join(browserRoot, "node_modules/typescript/bin/tsc"), "--noEmit", "--strict",
    "--module", "NodeNext", "--moduleResolution", "NodeNext", "--target", "ES2022", "--lib", "ES2022,DOM", "consumer.ts"], consumer);
  const importCheck = `import assert from 'node:assert/strict';
    import CanopyX, * as runtime from '@evotecit/canopyx';
    import GridRuntime, { createDataGrid, createCalendar, createMatrix, createDiff, createChangeList, createPropagation, enhance, grid } from '@evotecit/canopyx/grid';
    import ReportingRuntime from '@evotecit/canopyx/reporting';
    import FlowRuntime, { createFlow } from '@evotecit/canopyx/flow';
    import UiRuntime, { accordion, mountUi } from '@evotecit/canopyx/ui';
    import polish, { staticLabels } from '@evotecit/canopyx/locales/pl';
    import german from '@evotecit/canopyx/locales/de';
    import spanish from '@evotecit/canopyx/locales/es';
    import french from '@evotecit/canopyx/locales/fr';
    import italian from '@evotecit/canopyx/locales/it';
    assert.equal(polish.columns, 'Kolumny'); assert.equal(german.columns, 'Spalten'); assert.equal(spanish.columns, 'Columnas'); assert.equal(french.columns, 'Colonnes'); assert.equal(italian.columns, 'Colonne');
    assert.equal(staticLabels.fullReport, 'Otwórz pełny raport');
    assert.equal(Object.hasOwn(globalThis, 'CanopyXLocales'), false);
    assert.equal(runtime.protocol, 'canopyx/2');
    assert.equal(runtime.createTreeGrid, CanopyX.createTreeGrid);
    assert.equal(createDataGrid, GridRuntime.createDataGrid); assert.equal(createCalendar, GridRuntime.createCalendar);
    assert.equal(enhance, GridRuntime.enhance); assert.equal(grid, GridRuntime.grid); assert.equal(typeof ReportingRuntime.enhance, 'function');
    assert.equal(typeof ReportingRuntime.createDataGrid, 'function');
    assert.equal(accordion, UiRuntime.accordion); assert.equal(mountUi, UiRuntime.mountUi); assert.equal(UiRuntime.createTreeGrid, undefined);
    assert.equal(createFlow, FlowRuntime.createFlow); assert.equal(typeof GridRuntime.createFlow, 'function');
    assert.equal(createMatrix, GridRuntime.createMatrix); assert.equal(typeof ReportingRuntime.createMatrix, 'function');
    assert.equal(createDiff, GridRuntime.createDiff); assert.equal(createChangeList, GridRuntime.createChangeList); assert.equal(createPropagation, GridRuntime.createPropagation);
    assert.equal(typeof ReportingRuntime.createChangeList, 'function');
    assert.equal(typeof runtime.use, 'function'); assert.equal(runtime.registerPart, CanopyX.registerPart);
    assert.equal(Object.hasOwn(globalThis, 'CanopyX'), false);
    assert.equal(Object.hasOwn(globalThis, 'CanopyXSidecar'), false);
    const view = { pageSize: 2, roots: [{id:'a',label:'Atlas'}] };
    const page = await runtime.sources.inline(view).page(null, null);
    assert.deepEqual(page.items, view.roots);
    for (const name of ['compare.js','compare.css','view-intents.js','view-intents.css','styles.css','core.css','classic.js','core.js','grid.css','grid.js','reporting.css','reporting.js','presenters.js','filter-editor.js','filter-editor.css','export.js','office-export.js','history.js','pager.js','pager.css','enhance.js','data.js','editing.js','editing.css','tree-tools.js','tree-tools.css','links.js','search.js','formatting.js','formatting.css','format-editor.js','format-editor.css','link.js','link.css','detail-rows.js','detail-rows.css','grouping.js','grouping.css','column-groups.js','column-groups.css','cell-range.js','cell-range.css','highlight.js','highlight.css','layouts.js','layouts.css','record-panel.js','record-panel.css','forms.js','forms.css','flow.js','flow.css','matrix.js','matrix.css','changes.js','changes.css','flow-entry.js','flow-entry.css','locales/pl.js','locales/de.js','locales/es.js','locales/fr.js','locales/it.js']) {
      assert.ok(import.meta.resolve('@evotecit/canopyx/' + name).startsWith('file:'));
    }`;
  await fs.writeFile(path.join(consumer, "import-check.mjs"), importCheck);
  await run(process.execPath, ["import-check.mjs"], consumer);
  console.log(`JavaScript package smoke passed: ${packed.files.length} files, ${packed.size} packed bytes; strict consumer and server import.`);
} finally {
  // The unique directory contains only this smoke run's tarball and isolated consumer.
  await fs.rm(output, { recursive: true });
}
