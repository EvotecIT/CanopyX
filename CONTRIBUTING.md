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

Useful switches: `-SkipExamples` (also skips browser tests), `-SkipBrowserTests`, `-SkipPack`. `-DotNetCommandTimeoutSeconds` (default 900) limits every `dotnet` step so a stuck restore or test run fails with a named timeout instead of hanging.

## Browser Tests

Browser tests live in `tests/browser` and run with Node and Playwright. They are not part of the library build.

Install the test dependencies once, then let the quality loop generate the example pages and run the tests against them:

```powershell
cd tests/browser
npm ci
npx playwright install chromium
cd ../..
./Build.ps1 -Configuration Release -SkipPack
```

To rerun only the browser tests against the pages already generated, run `npx playwright test` in `tests/browser`.

The suite covers a smoke pass over every Must feature of the tree grid, an axe-core scan in light and dark themes, a keyboard walkthrough, and performance budgets on the large bundle example.

## Runtime Source Parts

The browser runtime is assembled from `CanopyX.Html/Assets/canopyx.source/*.js` in file-name order. After editing a part:

```powershell
./Build/Sync-Assets.ps1
```

`./Build/Sync-Assets.ps1 -Check` fails when the assembled file is out of date; the quality loop runs it.

## Performance Evidence

Changes to row rendering or scrolling need before and after numbers from the scroll benchmark, run on both versions:

```powershell
cd tests/browser
node bench/scroll-benchmark.mjs --runs 5 --cpu 1,4
```

Put the median results in the pull request description. The benchmark records frames over 50 ms and 33 ms, the 95th percentile frame time, and blank viewport samples while scrolling a large expanded tree. For changes to loading, expanding, or search, report the timings the Playwright performance tests print for the large bundle example before and after the change.

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
