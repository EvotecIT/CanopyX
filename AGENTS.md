# CanopyX

Generic, dependency-free engine for large interactive data views: tree grid,
data grid, matrix, pivot, calendar, board, plan, flow and related views. The
C# side owns view definitions, the `canopyx/2` data protocol, the bundle
writer and the static fallback renderer. The browser runtime renders the views.
It ships as NuGet packages and as the `@evotecit/canopyx` npm package.

## Layout

- `CanopyX/`: core model, protocol and bundle writer.
- `CanopyX.Html/`: HTML rendering and the browser runtime under `Assets/`.
- `CanopyX.Data/`: host data sources, paging and grid commits.
  `CanopyX.AspNetCore/`: ASP.NET Core endpoints.
- `CanopyX.Tests/`, `CanopyX.Data.Tests/`, `CanopyX.Tests.NetFramework/`
  (`net472` contract tests, run on Windows).
- `CanopyX.Examples/`: example pages; `samples/FleetInventory/`: a host sample.
- `tests/browser/`: Node + Playwright tests and benchmarks. `tests/BrowserInstall/`
  installs browsers. `tests/exports/`, `tests/ReleasedCompatibility/`,
  `tests/fixtures/`, `tests/conformance/`: export, compatibility and shared data checks.
- `JavaScript/`: TypeScript declarations and locale modules for the npm package.
- `api/`: public API baselines. `docs/`: reference (`architecture.md`,
  `data-protocol.md`, `testing.md`, `versioning.md`) and `docs/schema/`.
- `Build/`: asset assembly, label and design-token sync, packaging.
- `Website/`: canopyx.dev. It has its own `Website/AGENTS.md`.

## Build and test

```powershell
./Build.ps1 -Configuration Release              # full quality loop: build, tests, examples, browser tests, packs
./Build.ps1 -Configuration Release -SkipPack    # same without packaging
dotnet test ./CanopyX.sln -c Release --filter "Category!=Benchmark"   # C#-only loop
./Build/Sync-Assets.ps1                         # reassemble runtime assets after editing source parts
```

Browser tests, once per machine:

```powershell
cd tests/browser
npm ci
dotnet run --project ../BrowserInstall/BrowserInstall.csproj -c Release -- chromium   # add firefox webkit for other engines
npm test
```

Targets: `CanopyX`, `CanopyX.Html` and `CanopyX.Data` build `net472`,
`netstandard2.0`, `net8.0` and `net10.0`; keep all four. `CanopyX.AspNetCore`
builds `net8.0` and `net10.0`.

Release-only: `Build/Build-Project.ps1` (NuGet via `Build/project.build.json`)
and the `publish-npm.yml` workflow.

## Generated files

- `CanopyX.Html/Assets/canopyx.js`, `canopyx.css` and every
  `canopyx-<name>.js`/`.css` are assembled from `canopyx.source/` and
  `canopyx.<name>.source/` part folders by `Build/Sync-Assets.ps1`
  (`Build/parts.json` lists the lazy parts). Edit the parts, never the
  assembled files. Whole-line comments are stripped, so keep code off the lines
  of a `/* */` comment. `Build.ps1` runs `Sync-Assets.ps1 -Check`.
- Locale labels: `CanopyX/Views/CanopyLabels.<Language>*.cs`,
  `JavaScript/locales/*.mjs` and `canopyx-labels-*.js` come from
  `CanopyX/Views/Locales/labels.json` and `CanopyLabels.Defaults*.cs` via
  `Build/Sync-Labels.ps1` (run by `Sync-Assets.ps1`).
- `api/*.txt`: .NET API baselines checked by the tests; rewrite with
  `CANOPYX_API_UPDATE=1` after an intended change. `api/canopyx.d.ts.txt`:
  `node tools/api-report.mjs --update` in `tests/browser`. Follow
  `docs/versioning.md`.
- `Build/design-token-source.json` comes from `Build/Sync-DesignTokens.mjs`;
  `Build/Lint-DesignTokens.mjs` keeps its baseline shrinking only.
- `CanopyX/Validation/CanopyPattern.CaseData.cs` comes from
  `Build/Update-PatternCaseData.ps1` (manual, needs Unicode data files).

## Conventions

- CanopyX knows nothing about any consuming product. Hosts map their data
  into nodes, cells, badges, flags and rollups; CanopyX never computes domain facts.
- `CanopyX` has no runtime package dependencies. `CanopyX.Html` depends only on
  `CanopyX`. `CanopyX.Data` depends only on `CanopyX` (plus `System.Text.Json`
  and `Microsoft.Bcl.AsyncInterfaces` on `net472`/`netstandard2.0`).
  `CanopyX.AspNetCore` adds only the ASP.NET Core shared framework. EF Core and
  database drivers stay in hosts and samples.
- CanopyX never writes data. Grid commits go only through a host-mapped writer
  (`ICanopyDataWriter`, or `CanopyQueryableWriter<T>` over the host's
  `ICanopyWriteStore<T>`) behind a host-named write policy.
- Keep the static fallback renderer script-free and inline-style friendly so
  output survives email, print and Word.
- Don't rebuild static tables, KPI cards or charts here (ChartForgeX owns
  them), don't reference HtmlForgeX (it hosts CanopyX through its own bridge),
  and don't take a DbaClientX dependency.
- Runtime: plain modern JavaScript, JSDoc types allowed. No TypeScript,
  bundler or npm step in the library build. Keep each source part under 350
  lines, split by responsibility. Theme through CSS custom properties and
  derive hover, selection and muted colours with `color-mix()`.
- Keep the ARIA tree grid contract, keyboard model and virtual row DOM order.
  Change them only with a browser test.
- A protocol change updates `docs/data-protocol.md`,
  `docs/schema/canopyx-2.schema.json` and the schema contract tests together.
  Additive optional fields stay in `canopyx/2`; breaking changes need a new version.
- C#: one public type per file, XML docs on every public API, production files
  under 800 lines (`Build.ps1` enforces it), no `NoWarn` suppressions.
  Breaking API changes are fine before 1.0; prefer a short migration note over
  a compatibility layer.
- Add a package or feature only for a real consumer; `TODO.md` names it.
  Keep active future work in `TODO.md` and reference in `docs/`. Don't add
  roadmap or handoff documents.
- Commit titles are plain imperative sentences.

## Gotchas

- Benchmarks are opt-in: browser cases carry `@benchmark`
  (`npm run test:benchmarks`, or `CANOPYX_BENCHMARKS=1`), .NET cases use
  `Category=Benchmark`. Keep timing and memory measurements out of correctness
  tests. Performance changes need before/after numbers at normal speed and 4x
  CPU slowdown from `tests/browser/bench`.
- Install browsers through `tests/BrowserInstall`, never Playwright's own
  `install` command; a failed download can remove browsers from the shared cache.
- `CANOPYX_TEST_OUTPUT_DIR` moves browser artifacts out of the checkout;
  `CANOPYX_TEST_WORKERS` changes the local worker count; `CANOPYX_TEST_SHARD=2/4
  node tools/shards.mjs` runs one CI shard.
- Visual baselines (`tests/browser/specs/__screenshots__/`) run only on
  Windows Chromium by default (`CANOPYX_VISUAL=0`/`1` overrides). Update them
  with `npm run test:visual:update` only for an intended visual change.
- After editing runtime parts, run `Sync-Assets.ps1` and rebuild so the
  embedded runtime and example pages are fresh before browser tests.
