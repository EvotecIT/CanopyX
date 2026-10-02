# Agent Guidance

CanopyX is a generic, dependency-free engine for large interactive data views. The tree grid is the first view; a data grid and a 2D matrix come later. The C# side owns view definitions, the `canopyx/2` data protocol, the bundle writer, and the static fallback renderer. The browser runtime renders the views. Keep changes generic, testable, and usable by any host.

## Boundaries

- CanopyX knows nothing about Active Directory, PKI, TestimoX, ADPlayground, CertNoob, or any other product. Products map their own data into nodes, cells, badges, flags, and rollup values; CanopyX never computes domain facts.
- Keep `CanopyX` free of runtime package dependencies. `CanopyX.Html` depends only on `CanopyX`.
- CanopyX never performs writes. Future context actions call hooks that the host provides and governs.
- Keep the static fallback renderer script-free and inline-style friendly so the output survives email clients, print, and Word.
- Static non-interactive tables, lists, and KPI cards belong to `ChartForgeX.VisualBlocks`. Charts come from ChartForgeX. Do not rebuild either here.
- HtmlForgeX hosts CanopyX through its own `HtmlForgeX.CanopyX` bridge. Do not reference HtmlForgeX from this repository.
- Database paging belongs to DbaClientX, reached through a host bridge. CanopyX takes no DbaClientX dependency.
- Add a package or feature only when a real consumer needs it. `TODO.md` names the consumer for every milestone.

## Browser Runtime

- Keep the runtime as plain modern JavaScript source parts in `CanopyX.Html/Assets/canopyx.source/NN-name.js`. `Build/Sync-Assets.ps1` assembles them into `canopyx.js`, without their whole-line comments (keep code off the lines of a `/* */` comment); never edit the assembled file by hand.
- No TypeScript, bundler, or npm step in the library build. JSDoc types are fine. Node and Playwright are used only under `tests/browser`.
- Keep each runtime source part under 350 lines and split parts by responsibility.
- Theme through CSS custom properties with a small set of base colours; derive hover, selection, and muted colours with `color-mix()`.
- Keep the ARIA tree grid contract, the keyboard model, and the DOM order of virtual rows intact. Add or update a browser test when changing any of them.

## Change Expectations

- A protocol change updates `docs/data-protocol.md`, `docs/schema/canopyx-2.schema.json`, and the schema contract tests together. Additive optional fields stay in `canopyx/2`; anything that breaks an existing reader needs a new protocol version.
- Add or update contract tests for new behavior. Test the protocol, bundle layout, static output, and browser behavior that hosts rely on, not incidental structure.
- Add or update generated examples when a change affects visible output.
- Performance changes need measured before/after numbers at normal speed and at a 4x CPU slowdown from `tests/browser/bench`.
- Preserve `net472`, `netstandard2.0`, `net8.0`, and `net10.0` support in `CanopyX` and `CanopyX.Html`.
- One public type per file. XML documentation on every public API. Keep production C# files under 800 lines (`Build.ps1` enforces it) and split by responsibility before a file gets close.
- Do not add `NoWarn` suppressions.
- Breaking C# API changes are allowed before 1.0 when they produce a cleaner design. Prefer a short migration note over a compatibility layer.

## Documentation

- Keep `README.md` readable as the product and developer entry point.
- Keep durable technical reference in focused files under `docs/` (`architecture.md`, `data-protocol.md`).
- Keep active future work in `TODO.md`.
- Do not create extra roadmap, handoff, or "next work" documents.
- Remove stale "next" language once the described work has landed.

## Validation

Run the repository quality loop before trusting packaging, asset, or visual changes:

```powershell
./Build.ps1 -Configuration Release
```

Use the faster loop for C#-only changes:

```powershell
dotnet test .\CanopyX.sln -c Release
```

After editing runtime source parts, reassemble the runtime, then rebuild so the embedded runtime and the example pages are fresh. The quality loop runs the browser tests against the regenerated examples (run `npm ci` and `node node_modules/@playwright/test/cli.js install chromium` in `tests/browser` once first):

```powershell
./Build/Sync-Assets.ps1
./Build.ps1 -Configuration Release -SkipPack
```
