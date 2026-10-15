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
  const expected = ["LICENSE", "README.md", "README.nuget.md", "package.json", "docs/images/tree-grid-light.png", "docs/images/tree-grid-dark.png", "docs/images/static-outline.png", "JavaScript/index.d.ts", "JavaScript/hosts.d.ts", "JavaScript/protocol.d.ts", "JavaScript/plugins.d.ts",
    "CanopyX.Html/Assets/canopyx-module.mjs", "CanopyX.Html/Assets/canopyx.js", "CanopyX.Html/Assets/canopyx.css",
    "CanopyX.Html/Assets/canopyx-interactive.js", "CanopyX.Html/Assets/canopyx-interactive.css", "JavaScript/grid.d.ts",
    "CanopyX.Html/Assets/canopyx-grid-module.mjs", "CanopyX.Html/Assets/canopyx-grid.js", "CanopyX.Html/Assets/canopyx-grid.css",
    "CanopyX.Html/Assets/canopyx-reporting-module.mjs", "CanopyX.Html/Assets/canopyx-reporting.js", "CanopyX.Html/Assets/canopyx-reporting.css",
    "CanopyX.Html/Assets/canopyx-filter-editor.js", "CanopyX.Html/Assets/canopyx-filter-editor.css", "CanopyX.Html/Assets/canopyx-export.js", "CanopyX.Html/Assets/canopyx-history.js", "CanopyX.Html/Assets/canopyx-tree-tools.js", "CanopyX.Html/Assets/canopyx-tree-tools.css",
    "CanopyX.Html/Assets/canopyx-links.js", "CanopyX.Html/Assets/canopyx-search.js",
    ...['pl','de','es'].flatMap(code=>[`JavaScript/locales/${code}.mjs`,`JavaScript/locales/${code}.d.ts`,`CanopyX.Html/Assets/canopyx-labels-${code}.js`])];
  assert.deepEqual(packed.files.map(file => file.path).sort(), expected.sort(), "Package only the declared user assets and types.");
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
    import GridRuntime, { createDataGrid } from '@evotecit/canopyx/grid';
    import ReportingRuntime from '@evotecit/canopyx/reporting';
    import polish, { staticLabels } from '@evotecit/canopyx/locales/pl';
    import german from '@evotecit/canopyx/locales/de';
    import spanish from '@evotecit/canopyx/locales/es';
    assert.equal(polish.columns, 'Kolumny'); assert.equal(german.columns, 'Spalten'); assert.equal(spanish.columns, 'Columnas');
    assert.equal(staticLabels.fullReport, 'Otwórz pełny raport');
    assert.equal(Object.hasOwn(globalThis, 'CanopyXLocales'), false);
    assert.equal(runtime.protocol, 'canopyx/2');
    assert.equal(runtime.createTreeGrid, CanopyX.createTreeGrid);
    assert.equal(createDataGrid, GridRuntime.createDataGrid);
    assert.equal(typeof ReportingRuntime.createDataGrid, 'function');
    assert.equal(typeof runtime.use, 'function'); assert.equal(runtime.registerPart, CanopyX.registerPart);
    assert.equal(Object.hasOwn(globalThis, 'CanopyX'), false);
    assert.equal(Object.hasOwn(globalThis, 'CanopyXSidecar'), false);
    const view = { pageSize: 2, roots: [{id:'a',label:'Atlas'}] };
    const page = await runtime.sources.inline(view).page(null, null);
    assert.deepEqual(page.items, view.roots);
    for (const name of ['styles.css','core.css','classic.js','core.js','grid.css','grid.js','reporting.css','reporting.js','filter-editor.js','filter-editor.css','export.js','history.js','tree-tools.js','tree-tools.css','links.js','search.js','locales/pl.js','locales/de.js','locales/es.js']) {
      assert.ok(import.meta.resolve('@evotecit/canopyx/' + name).startsWith('file:'));
    }`;
  await fs.writeFile(path.join(consumer, "import-check.mjs"), importCheck);
  await run(process.execPath, ["import-check.mjs"], consumer);
  console.log(`JavaScript package smoke passed: ${packed.files.length} files, ${packed.size} packed bytes; strict consumer and server import.`);
} finally {
  // The unique directory contains only this smoke run's tarball and isolated consumer.
  await fs.rm(output, { recursive: true });
}
