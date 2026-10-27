# Gallery finish quality

The browser quality loop checks every HTML page linked from the generated example gallery at 1440 light, 390 dark and 720 light. The gallery supplies the inventory; adding a link includes that page automatically. The checks run on Chromium on each CI platform, alongside the existing browser and visual regression tests.

The detector reports a rule, element selector and relevant measurements. Failures retain a JSON report and a frame in the test output. These checks catch measurable layout defects; the frames still need visual review.

| Rule | Failure |
| --- | --- |
| `band-width` | A footer, summary, group header or toolbar ends before its body rows. |
| `minute-precision` | A minute-precision editor or value exposes seconds or milliseconds. |
| `header-wrap` | Header text wraps while enough unused row width could hold it. |
| `empty-band` | Unused space after content inside a view exceeds one row. |
| `single-sort-priority` | A priority number appears for a single user sort. Fixed ordering is excluded; responsive hiding does not remove an active user sort. |
| `text-clipped` | Text is clipped without an ellipsis or tooltip. |
| `phone-overflow` | Content exceeds the phone viewport outside a scrolling or clipping container. |
| `phone-chip-wrap` | A chip occupies a separate line below its row text. |

An intentional layout can declare a narrow exception on the element or its containing region:

```html
<section data-cx-finish-allow="empty-band">...</section>
```

The value is a space-separated list of rule IDs. Keep it on the smallest region that needs it and explain the intended layout in source. The compact mini-month picker marks its intentional spare canvas; full calendar layouts remain checked. Do not exempt an entire gallery or a rule globally to hide a defect.

`tests/browser/tools/finish-quality.mjs` exports `inspectFinishQuality(root)`. A capture host can evaluate the function inside a loaded page and collect the same findings without depending on the test runner. It neither changes the page nor starts a browser.

The rule fixtures demonstrate that every check rejects its defective layout and respects its local exception. Optional retained-baseline tests also exercise generated footer and calendar pages. Set `CANOPYX_FINISH_BASELINE_GRID` and `CANOPYX_FINISH_BASELINE_CALENDAR` to the corresponding generated output folders to reproduce that negative proof. They check actual rendered defects without modifying those pages.
