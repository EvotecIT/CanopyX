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

Useful switches: `-SkipExamples` (also skips browser tests), `-SkipBrowserTests`, `-SkipPack`. `-DotNetCommandTimeoutSeconds` (default 900) limits every `dotnet` step so a stuck restore or test run fails with a named timeout instead of hanging.

## Browser Tests

Browser tests live in `tests/browser` and run with Node and Playwright. They are not part of the library build.

Install the test dependencies once, then let the quality loop generate the example pages and run the tests against them:

```powershell
cd tests/browser
npm ci
node node_modules/@playwright/test/cli.js install chromium
cd ../..
./Build.ps1 -Configuration Release -SkipPack
```

To rerun only the browser tests against the pages already generated, run `npm test` in `tests/browser` (it opens the Release examples; set `CANOPYX_EXAMPLES` to another output folder, for example after a Debug build). Set `CANOPYX_BROWSER_CHANNEL=msedge` (or `chrome`) to use an installed browser instead of Playwright's Chromium. After a visible change, refresh the README screenshots with `node tools/screenshots.mjs`.

The suite covers a smoke pass over every Must feature of the tree grid, an axe-core scan in light and dark themes, a keyboard walkthrough, and performance budgets on the large bundle example.

## Runtime Source Parts

The browser runtime is assembled from `CanopyX.Html/Assets/canopyx.source/*.js` in file-name order. After editing a part:

```powershell
./Build/Sync-Assets.ps1
```

`./Build/Sync-Assets.ps1 -Check` fails when the assembled file is out of date; the quality loop runs it.

The assembled file leaves out whole-line comments (`//` lines and `/* */` blocks on lines of their own), apart from the header of the first part, so document the parts freely: comments do not count against the 48 KB gzip budget. The rule works on lines, so the script refuses what it could misread: code on a line of a block comment, a block comment that opens after code on a line, template literals, and strings continued with a trailing backslash.

## Performance Evidence

Changes to row rendering or scrolling need before and after numbers from the scroll benchmark, run on both versions:

```powershell
cd tests/browser
node bench/scroll-benchmark.mjs --runs 5 --cpu 1,4
```

Add `--host-columns status,changes,links,finding` to measure a host that draws some columns itself through `renderers`. Put the median results in the pull request description. The benchmark records frames over 50 ms and 33 ms, the 95th percentile frame time, and blank viewport samples while scrolling a large expanded tree. For changes to loading, expanding, or search, report the timings the Playwright performance tests print for the large bundle example before and after the change.

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

- Add or update contract tests for new behavior.
- Update `docs/data-protocol.md`, the JSON schema, and the schema tests together when the protocol changes.
- Add or update an example when a change affects visible output.
- Keep `CanopyX` free of runtime package dependencies.
- Preserve `net472`, `netstandard2.0`, `net8.0`, and `net10.0` support in both packages.
- Do not suppress warnings with `NoWarn`.

## Package Invariants

- `CanopyX` has no NuGet dependencies.
- `CanopyX.Html` depends only on the matching `CanopyX` package.
- `README.md` is in the package root.
- Every target framework has its assembly and XML documentation.
- A `.snupkg` symbol package is created next to every `.nupkg`.
- A clean temporary console app can install the freshly packed `CanopyX.Html` package, render a tree grid page, and write a sidecar bundle.

## Releases

The owner publishes packages. `Build/project.build.json` keeps `PublishNuget` and `PublishGitHub` set to `false`, and the version comes from `CanopyXProductVersion` in `Directory.Build.props`. Contributors do not publish from local machines or CI.
