# Contributing

## Local Quality Loop

Run the full repository quality loop before opening a pull request:

```powershell
./Build.ps1 -Configuration Release
```

The loop checks source line budgets and that `canopyx.js` matches its source parts, then restores, builds, and tests the solution. It generates the examples, runs the Playwright browser tests against them, packs both packages, verifies the package invariants below, and installs the fresh packages into a temporary console app that renders a page and writes a bundle.

For a faster C#-only loop:

```powershell
dotnet test .\CanopyX.sln -c Release
```

The solution also holds `CanopyX.Tests.NetFramework`, which runs the framework-sensitive contract tests (search folding) against the `net472` build. It builds on every platform and runs on Windows.

Useful switches: `-SkipExamples` (also skips browser tests), `-SkipBrowserTests`, `-SkipPack`. `-DotNetCommandTimeoutSeconds` (default 900) limits every `dotnet` step so a stuck restore or test run fails with a named timeout instead of hanging. `-BrowserTestTimeoutSeconds` separately bounds the browser suite; CI runs one engine per job and gives it 1200 seconds (1500 on Windows).

## Browser Tests

The [README](README.md) introduces the packages and runnable first examples. Keep
detailed configuration and integration material in the [authoring reference](docs/authoring.md),
with protocol details in [docs/data-protocol.md](docs/data-protocol.md).

Browser tests live in `tests/browser` and run with Node and Playwright. They are not part of the library build.

Install the test dependencies once, then let the quality loop generate the example pages and run the tests against them:

```powershell
cd tests/browser
npm ci
dotnet run --project ../BrowserInstall/BrowserInstall.csproj -c Release -- chromium
cd ../..
./Build.ps1 -Configuration Release -SkipPack
```

To rerun only the browser tests against the pages already generated, run `npm test` in `tests/browser` (it opens the Release examples; set `CANOPYX_EXAMPLES` to another output folder, for example after a Debug build). Set `CANOPYX_BROWSER_CHANNEL=msedge` (or `chrome`) to use an installed browser instead of Playwright's Chromium. After a visible change, refresh the README screenshots with `node tools/screenshots.mjs`.

The local loop uses Chromium by default. Set `CANOPYX_TEST_BROWSERS=all` (or `chromium,firefox,webkit`) to run all three engines, or choose a comma-separated subset; `npm run test:all`, `npm run test:firefox` and `npm run test:webkit` in `tests/browser` do the same on any shell. Install the chosen engines with `dotnet run --project ../BrowserInstall/BrowserInstall.csproj -c Release -- chromium firefox webkit` in `tests/browser`. This test-only executable uses the published HtmlTinkerX installer and verifies that its Playwright version matches the browser tests. On Linux, set `HTMLTINKERX_PLAYWRIGHT_WITH_DEPS=1` when system dependencies also need installation; root CI runners install them automatically. Installed-browser channels and `CANOPYX_BROWSER_EXECUTABLE` apply only to the Chromium project. CI runs all three engines on Linux, Windows and macOS, one engine per job. Firefox reports the machine's own pointers, so the configuration pins a mouse for it: a laptop's touch screen would otherwise switch every page to the touch layout. Tests that need touch emulate it with `hasTouch`.

The suite covers a smoke pass over every Must feature of the tree grid, an axe-core scan in light and dark themes, a keyboard walkthrough, and performance budgets on the large bundle example. `memory-leaks.spec.mjs` mounts and destroys a grid and a tree 200 times and checks, through the Chromium DevTools protocol, that the heap, the live and detached DOM nodes and the event listeners return to their baseline. `touch-phone.spec.mjs` drives the phone paths (the "+N" record drawer, sheets, menus, row activation and scrolling) with touch emulation and asserts behaviour, not pixels.

### Visual Baselines

`visual-baselines.spec.mjs` compares the curated examples at 1440 and 390 pixels, in the light and dark themes, with the PNG baselines in `tests/browser/specs/__screenshots__`. The baselines come from Playwright's Chromium on Windows, so this `visual` project runs when the engines include Chromium on Windows and no installed browser channel is selected; set `CANOPYX_VISUAL=0` to leave it out, or `CANOPYX_VISUAL=1` to run it elsewhere, which the `test:visual` npm scripts need there too (expect anti-aliasing differences on other platforms). Every element renders in the bundled Inter subset (`tests/browser/fonts`, SIL Open Font License), with grayscale text and an sRGB colour profile, so the images do not depend on installed fonts or display settings. Each image is the first view cropped to its top (420 pixels at 1440, 600 at 390). A pixel may differ by Playwright's default colour threshold, and at most 0.15% of an image may differ: a changed full-width border line fails at either width. Elements marked `data-cx-volatile` and host status lines are masked.

After an intended visual change, regenerate the examples, then refresh and review the images:

```powershell
./Build.ps1 -Configuration Release -SkipPack -SkipBrowserTests
cd tests/browser
npm run test:visual:update
```

Open every changed image (`git diff --stat` lists them) and commit only the ones the change explains. When CI on another Windows machine disagrees with a baseline that looks right, take the `actual` image from the failed job's `canopyx-playwright-report` artifact rather than loosening the threshold.

## Runtime Source Parts

The browser runtime is assembled from `CanopyX.Html/Assets/canopyx.source/*.js` in file-name order. After editing a part:

```powershell
./Build/Sync-Assets.ps1
```

`./Build/Sync-Assets.ps1 -Check` fails when the assembled file is out of date; the quality loop runs it.

The assembled file leaves out whole-line comments (`//` lines and `/* */` blocks on lines of their own), apart from the header of the first part, so document the parts freely: comments do not count against the gzip asset budgets. The rule works on lines, so the script refuses what it could misread: code on a line of a block comment, a block comment that opens after code on a line, template literals, and strings continued with a trailing backslash.

## Performance Evidence

Changes to row rendering or scrolling need before and after numbers from the scroll benchmark, run on both versions:

```powershell
cd tests/browser
node bench/scroll-benchmark.mjs --runs 5 --cpu 1,4
```

Add `--host-columns status,changes,links,finding` to measure a host that draws some columns itself through `renderers`. Put the median results in the pull request description. The benchmark records frames over 50 ms and 33 ms, the 95th percentile frame time, and blank viewport samples while scrolling a large expanded tree. For changes to loading, expanding, or search, report the timings the Playwright performance tests print for the large bundle example before and after the change.

The JSON report records the runtime and stylesheet paths and SHA-256 hashes, the generated fixture hash and viewport, Node version, and each run's browser version and frame cadence. Keep the browser, viewport, CPU placement, process priority, and power plan consistent across a comparison; alternate before and after runs and retain outliers. The blank-row probe runs on the main thread and does not measure compositor checkerboarding. With `--out <folder>/scroll.json`, both the report and its generated HTML fixture stay in that folder.

For a diagnostic run, `--profile-dir <folder>` saves a Chrome DevTools CPU profile for each run and slowdown. Keep these runs separate from timing comparisons: profiling changes their overhead. Use a task-owned output folder, retain the summary needed to explain the result, and clean superseded generated benchmark pages and traces.

Changes to the bundle search index or to sidecar search also need the search benchmark. It reports the index size next to the pages, and the cold and warm time from a query to an expanded hit, on the large bundle example, on two benchmark bundles (an adversarial deep tree and a directory-shaped tree), and on the packed catalog of the packing benchmark (write it with `--pack-bench` first):

```powershell
dotnet run --project CanopyX.Examples -c Release -- --search-bench
cd tests/browser
node bench/search-benchmark.mjs --runs 5 --cpu 1,4
```

Write the bundles of the version before the change into another folder and pass it with `--examples` and `--bench` to measure both sides on the same machine.

Changes to the bundle layout (pages, packs, the file budget) need the expand benchmark. It reports the files and bytes of a large bundle, the time to the first rows, and cold expands level by level; `--pack-bench` prints the generation time and the peak memory of the writer (add `--in-memory` to build the whole tree first instead of streaming it):

```powershell
dotnet run --project CanopyX.Examples -c Release -- --pack-bench
cd tests/browser
node bench/expand-benchmark.mjs --runs 5 --cpu 1,4
```

Pass `--bundle <folder>` to measure a bundle written by the version before the change, or the `bundle` folder of the examples and the `directory` folder of `--search-bench`, which have expand steps of their own. `--child-pack <bytes>` and `--search-pack <bytes>` on `CanopyX.Examples` write the bundles with other pack sizes (write each into an empty folder: the writer leaves files it did not write, and the benchmarks count every file), and `--only catalog` limits the search benchmark to the scenarios whose names start with it.

## Change Expectations

- Keep the source, protocol, schema, native, browser and package contracts together, with all four .NET targets, strict JavaScript
  consumers and the asset budgets. Keep optional interaction and presentation parts out of the ordinary tree runtime where
  practical, and audit unsafe text and links, renderer lifetime, CSP-compatible hosting and prototype-shaped IDs at the boundary
  that owns them.
- Add or update contract tests for new behavior.
- Update `docs/data-protocol.md`, the JSON schema, and the schema tests together when the protocol changes.
- Add or update an example when a change affects visible output.
- Keep `CanopyX` free of runtime package dependencies.
- Preserve `net472`, `netstandard2.0`, `net8.0`, and `net10.0` support in both packages.
- Do not suppress warnings with `NoWarn`.
- Update the public API baselines under `api/` in the same change when the C# or TypeScript API changes, and follow
  [docs/versioning.md](docs/versioning.md) for removals and deprecations.

## Package Invariants

- `CanopyX` has no NuGet dependencies.
- `CanopyX.Html` depends only on the matching `CanopyX` package.
- `README.md` is in the package root.
- Every target framework has its assembly and XML documentation.
- A `.snupkg` symbol package is created next to every `.nupkg`.
- A clean temporary console app can install the freshly packed `CanopyX.Html` package, render a tree grid page, and write a sidecar bundle.

## Releases

The owner publishes packages. `Build/project.build.json` keeps `PublishNuget` and `PublishGitHub` set to `false`, and the version comes from `CanopyXProductVersion` in `Directory.Build.props`. Contributors do not publish from local machines or CI.
