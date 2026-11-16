---
title: What's new in CanopyX
description: What the next CanopyX release changes: a smaller runtime, tidier grids, one-call typed grids, an accordion and a slim UI entry point.
slug: whats-new
meta.seo_title: What's new in CanopyX
---

<!-- RELEASE-TODO(version): on release day, replace "the next release" in this intro and the heading below with the NuGet and npm versions, and link the GitHub release. -->

These changes are merged and ship in the next release of the CanopyX NuGet packages and the `@evotecit/canopyx` npm package. The [changelog](https://github.com/EvotecIT/CanopyX/blob/main/CHANGELOG.md) lists every change, including the migrations below.

## In the next release

### A smaller runtime

Every entry point and lazy part now ships minified. Statements, strings, property names and the public API are unchanged, and so are CSP nonces, Trusted Types support and `file://` pages. You still embed the checked-in assets with no npm step.

| Entry point | Before (gzip) | After (gzip) | Change |
| --- | ---: | ---: | ---: |
| `canopyx.js` | 56,483 | 49,296 | −12.7% |
| `canopyx-interactive.js` | 63,536 | 55,660 | −12.4% |
| `canopyx-grid.js` | 131,018 | 116,200 | −11.3% |
| `canopyx-reporting.js` | 157,784 | 139,492 | −11.6% |
| `canopyx-flow-entry.js` | 9,361 | 8,193 | −12.5% |
| `canopyx-ui.js` | 4,722 | 4,175 | −11.6% |

Sizes are in bytes. The ES module builds shrink by the same 10–12%, and all lazy parts together go from 741,513 to 675,827 bytes gzip.

<!-- RELEASE-TODO(office-export): add "### Office export from the shared OfficeIMO core" here once CanopyX loads officeimo.min.js plus the CanopyX adapter: the office-export part drops from 132,608 bytes gzip to the measured size (about 123 KB expected), and a page that already loads OfficeIMO can share its writers. -->

### Tidier grids

A tags cell shows only the chips that fit whole and counts the rest in `+N`, so a clipped "Seco" chip no longer appears. Short headers such as "History bars" stay on one line, and a column menu no longer changes fitted widths. The select-all label in the header now lines up with the row labels beside their checkboxes.

<figure class="cnx-compare">
  <div class="cnx-frame cnx-frame--flat">
    <div class="cnx-frame__bar"><span class="cnx-frame__title">Before</span></div>
    <img class="cnx-only-light" src="/whats-new/grid-tags-before-light.png" width="800" height="250" loading="lazy" decoding="async" alt="Before: grid columns with a two-line History bars header and a clipped Seco tag chip" />
    <img class="cnx-only-dark" src="/whats-new/grid-tags-before-dark.png" width="800" height="250" loading="lazy" decoding="async" alt="Before: grid columns with a two-line History bars header and a clipped Seco tag chip" />
  </div>
  <div class="cnx-frame cnx-frame--flat">
    <div class="cnx-frame__bar"><span class="cnx-frame__title">After</span></div>
    <img class="cnx-only-light" src="/whats-new/grid-tags-after-light.png" width="800" height="250" loading="lazy" decoding="async" alt="After: History bars on one line and tags showing Primary +4" />
    <img class="cnx-only-dark" src="/whats-new/grid-tags-after-dark.png" width="800" height="250" loading="lazy" decoding="async" alt="After: History bars on one line and tags showing Primary +4" />
  </div>
  <figcaption>The graphite example grid at 1440 px, before and after.</figcaption>
</figure>

A grid that a search or filters leave empty now says why ("No services match “disk” with 2 filters.") and offers Clear search when only a search is active. Footer totals read like group rows ("Average 98.0%"), and on phones the toolbar sheets dim the page behind them and fold facets into one Refine sheet.

### Typed grids in one call

`CanopyDataGridView.From(records, x => x.Id)` builds a grid with a typed column per public property, adjusted with `[CanopyKey]`, `[CanopyColumn]` and `[CanopyIgnore]`. It also takes a `DataTable` or dictionary rows, including PowerShell hashtables. Write the result with `ToHtmlPage`, `SaveHtmlPage` or `ToHtmlFragment`, or as a script-free table with `ToStaticHtml()`.

### New components and options

- **Accordion.** `CanopyX.accordion` and C# `CanopyAccordion`: single or multiple open sections, deferred content, a filter, header actions, remembered state and readable content without JavaScript.
- **Slim UI entry point.** `canopyx-ui.js` (`@evotecit/canopyx/ui`, `CanopyRuntime.Ui`) is about 4 KB gzipped, for content pages with no grid or tree.
- **Shared-screen calendars.** Source and resource faces, merged copies of one event, faded past events, day header notes, sized days and a Reset button.
- **Smaller additions.** Tab badges that change while the page is open, `remember`/`justified` tabs, record action tones (`primary`, `neutral`, `danger`) and `SelectOnClick` for pointer selection without checkboxes.

<!-- RELEASE-TODO(scale): add "### Large directories" here once the scale work merges: measured load and scroll for grids and trees from 50 to 500,000 users and 100 to 200 domain controllers. -->

### Before you upgrade

A few changes need a small edit. The [changelog](https://github.com/EvotecIT/CanopyX/blob/main/CHANGELOG.md) has the exact migration for each.

- `requestRowAction` resolves `{ accepted, reason, message }`. Test `.accepted` instead of the result itself.
- `CanopyGridMapper<T>` is removed; use `CanopyDataGridView<T>`.
- `CanopyQueryableWriter<T>` needs a `Scope`; `UseQueryableWriter<T>` sets it up for remote endpoints.
- Remote endpoint factories should return a new provider, writer or store per request; CanopyX now disposes them when the response completes.
- `CanopyRemoteLimits.MaxSelectedIds` defaults to 1,000 (was 10,000), and the new `MaxFilterValues` defaults to 1,000.
