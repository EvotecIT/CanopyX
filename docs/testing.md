# Correctness checks and benchmarks

The normal quality loop builds the libraries, checks their contracts, generates examples, runs browser correctness and accessibility checks, and validates packages:

```powershell
./Build.ps1 -Configuration Release
```

Quality runs the full loop on Linux in Chromium, Firefox and WebKit, on Windows in Chromium (including visual baselines and packages), and on macOS in WebKit for pull requests. Pushes to `main`, manual runs and the nightly run at 02:23 UTC cover all three engines on all three platforms, retaining the two Windows Firefox and macOS WebKit shards. PRs use five matrix jobs, including one unsharded macOS job; full runs use eleven, including four macOS jobs.

Browser files run on three workers in Quality CI, with tests inside each file kept in order (`fullyParallel: false`) and no retries. `CANOPYX_TEST_WORKERS` selects a different positive worker count for local validation; without it the browser config uses two. The existing 135-minute job deadline and 7,200-second browser-process deadline remain in place.

A PR whose complete diff changes only `Website/**`, `docs/**` or Markdown files skips the build matrix. Changes under `docs/schema/**` always require it, including Markdown there. The three required platform checks still run and succeed after a confirmed documentation-only skip; failed coverage selection, failed tests and cancelled builds fail those checks. Website validation runs in its own workflow. Only superseded runs for the same PR are cancelled; each main, manual and nightly run has its own concurrency group.

Check coverage selection locally without building or installing browser packages:

```powershell
node --test .github/scripts/quality-plan.test.mjs
```

The suite checks returned data, ordering, cancellation, lifecycle cleanup, bounded requests and DOM, generated artifacts and visible behavior. Ordinary test and process timeouts still catch hangs. Elapsed time, relative speed, long tasks, observed heap growth and allocation measurements run only when explicitly requested; shared-runner measurements do not decide PR correctness.

For a C# correctness change, the shorter command is:

```powershell
dotnet test ./CanopyX.sln -c Release --filter "Category!=Benchmark"
```

The default browser command also excludes benchmark cases:

```powershell
cd tests/browser
npm test
```

## Run measurements explicitly

Browser measurements carry the `@benchmark` tag. After generating the examples with the normal quality loop, run all measurement cases or one engine:

```powershell
cd tests/browser
npm run test:benchmarks
node tools/browsers.mjs webkit --benchmarks
```

These commands select only tagged measurements. Direct Playwright users can set `CANOPYX_BENCHMARKS=1` for the same selection. `Build.ps1` always selects correctness tests and restores any prior browser selection afterward. To inspect either selection without launching browsers, append `--list` to its browser command.

The opt-in cases retain their original workload sizes, timers and numerical targets. They include cold and warm tree interactions, 10,000-row table enhancement, 4x CPU large-data loads, formatted navigation, highlighting and retained-memory probes. A failed target remains performance work to investigate; moving it out of required CI does not erase the result. Mixed suites keep separate untimed checks for page counts, complete match counts, visible navigation and destroy cleanup.

The .NET allocation measurement uses the `Benchmark` category:

```powershell
dotnet test ./CanopyX.Tests/CanopyX.Tests.csproj -c Release --filter "Category=Benchmark"
```

## Compare performance

The existing scripts under `tests/browser/bench` provide raw samples and broader normal/4x comparisons: `scroll-benchmark.mjs`, `search-benchmark.mjs`, `expand-benchmark.mjs` and `load-benchmark.mjs`. Their headers document inputs and output paths; [large-data.md](large-data.md#reproducing-the-measurements) describes large fixture generation. Use a task-owned folder under the configured scratch root for substantial fixture, trace and report output.

Compare equivalent inputs and work on the same host, record browser/runtime versions and host load, and retain every sample, failure and slower result. Validate that expected rows, hits and paths were produced before interpreting timing. The load benchmark records failed rows in its JSON report, so inspect those failures even when its process exits successfully. Keep performance reports outside required correctness aggregators.

The focused resource-column comparison uses the same calendar fixture and browser runner. In `tests/browser`, set
`CANOPYX_BENCH_OUTPUT` to a task-owned output folder, then run
`node tools/browsers.mjs chromium --benchmarks calendar-c1-benchmark.spec.mjs --workers=1`.
It retains three samples for 24, 48 and 1,000 resources, day and week views, at normal speed and 4x CPU slowdown, against the
pre-window baseline. It records mounted columns, slots, nodes and asset hashes alongside mount-to-paint time. The fixture's
events are on Friday; week view starts on Monday. Both its initial paint and the current window after scrolling to Friday
are recorded, with visible and logical event counts. Above 24
resources the baseline omits resource columns; those timings describe different rendered work and are not an equivalent-view
speed comparison. The 24-resource day case preserves the same view on both candidates.

PSPublishModule/PowerForge owns reusable benchmark policy, normalized artifacts and comparison tooling. Browser-specific fixtures and assertions remain here; reusable runner additions belong in that shared owner.
