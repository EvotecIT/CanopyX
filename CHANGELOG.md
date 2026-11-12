# Changelog

## Unreleased

- Breaking: a grid left without rows by a search or filters says why in plain words ("No services match “disk” with 2 filters."), its button reads Clear search when only a search is active, and the query summary no longer shows a second Clear all beside it. Migration: `GridNoMatchesReason` / `gridNoMatchesReason` is gone; move a custom text to `GridNoMatchesSearch`, `GridNoMatchesSearchFilters` or `GridNoMatchesFilters` (the last two take `{count}` and plural forms). `GridClearSearch` is new.
- Breaking: `requestRowAction` resolves `{ accepted, reason, message }`, as `canopyx:rowAction` reports it, so a caller can show the host's refusal message. Migration: replace `if (await grid.requestRowAction(id, action))` with `if ((await grid.requestRowAction(id, action)).accepted)`; the object is always truthy.
- Add `tone` to record actions: a prominent action's footer button is `primary` (default), `neutral` (secondary) or `danger`, which stands apart at the footer's end and is marked in the menu.
- Add `setBadge(id, badge)` to tabs, for counts that change while the page is open.
- Read footer totals as group rows do ("Average 98.0%"); a hidden column's total names the column ("Success rate, average 98.0%").
- Add `stack` to the identifier presenter (C# `Identifier(stack: true)`): rows that size to their content put the secondary text under the value, as relative times do. The record drawer always does; fixed-height rows keep it beside the value.
- Hide the actions column's clipped header text; the column keeps its accessible name.
- Keep record panel lists as tables while the drawer has room for their columns, measured in the drawer rather than the page, and drop a field's title when it repeats its section's heading.
- Dim the page behind a phone toolbar sheet (More, Views, Export, Columns); a tap on the scrim closes the sheet without reaching the rows beneath it.
- Fold toolbar facets into the one Refine sheet on phones.
- Give the record drawer a clearer hierarchy (a larger title, section headings above values, quieter collection cards) and group its footer actions on phones: primary first, a danger action on its own row.

- Build a grid in one call with `CanopyDataGridView.From(records, x => x.Id)`: a typed column per public property, adjusted with `[CanopyKey]`, `[CanopyColumn(Title, Order, Hidden, Format)]` and `[CanopyIgnore]`. `From` also takes a `DataTable` or dictionary rows (`Dictionary<string, object?>`, PowerShell hashtables) with a named key column.
- Write typed grids directly with `ToHtmlPage`, `SaveHtmlPage` and `ToHtmlFragment`, and any tree or grid as a script-free table with `ToStaticHtml()`.
- Add `CanopyHtmlOptions.HeadHtml` for host styles and scripts in a page's head, in place of replacing `</head>` in the written page.
- Breaking: remove `CanopyGridMapper<T>`. Use `CanopyDataGridView<T>`: `Column(id, selector, title, configure)` per column, `Row(record)` for `MapRow`, and `AddRows(records)` with settings on `View` for `CreateView` (see [authoring](docs/authoring.md#flat-data-grid)).

- Let deferred host scripts configure views before automatic mounting when Firefox has not exposed its navigation timing entry yet.
- Mount late-loaded runtimes while the page is still loading resources when legacy performance timing is disabled.
- Keep visible text in accessible names for calendar events, grid summaries, sort priorities, details buttons, matrix groups, linked filters and check retries. Calendar names follow font loads, layout changes and host-rendered content updates. Picker buttons use their visible labels directly, including on narrow layouts.
- Add shared-screen options to the calendar (`calendar-screen` part): source and resource faces (avatar, initials or icon), merging copies of one event across sources, fading finished events (`fadePast`), day header notes and the `dayHeader` hook, `dayWidth`, `listDays` and `listBelow` for days that fit the calendar's width, and a Reset button (`reset`, `resetCalendar()`). Events take a `location`.
- Fold a calendar legend that does not fit on one line into a menu with a checkbox per source.
- Add a first-party accordion (`CanopyX.accordion`, C# `CanopyAccordion`): single or multiple open sections, disabled sections, deferred content, a filter, copy-title and header actions, hash and remembered state, nesting and readable content without JavaScript.
- Add the slim UI entry point (`canopyx-ui.js`, `@evotecit/canopyx/ui`, `CanopyRuntime.Ui`): about 5 KB gzipped, for content pages with no grid or tree.
- Add tab `remember`, `justified`, `next()` and `back()`.
- Add `CanopyDataGridView.SelectOnClick` and mutable `api.selectOnClick` for pointer selection without reporting checkboxes, including Ctrl/Command toggles and Shift ranges.
- Address fragment and page hosts by their view id, or override it with `CanopyHtmlOptions.HostId`.
- Name each field in multi-field linked-filter chips while keeping one removable chip per source and honoring explicit labels.
- Read canonical HtmlForgeX surface, border and text roles first, with legacy role names as fallbacks.
- Scope remote writes to the grid's query with `CanopyRemoteEndpointOptions.UseQueryableWriter<T>`. Migration: `CanopyQueryableWriter<T>` now takes its options and refuses to be created without `Scope`; replace `options.Writer = http => new CanopyQueryableWriter<T>(map, store, new() { Scope = () => query(http), … })` with `options.UseQueryableWriter(http => store, (http, writer) => { … })`, or set `AllowUnscoped = true` when every caller may change every stored record.
- Dispose providers, writers, record providers and stores that the remote endpoint's per-request factories return, when the response completes. Migration: return a new instance per request, not a shared disposable one.
- Answer regex quick search as client errors: `MapCanopyRemote` refuses an `IQueryable` callback for a view with `AllowRegexSearch`, a regex query over a query provider answers `unsupported`, and an in-memory pattern over its time budget answers `limitExceeded`. A searchable cell longer than 4,096 characters no longer fails the search; `CanopyGridRegexSearch.IsMatch` returns false for it.
- Add `CanopyRemoteLimits.MaxFilterValues` (default 1,000 operands per query) and lower the `MaxSelectedIds` default from 10,000 to 1,000, so a default query stays within SQL Server's 2,100 parameters when a provider expands lists. Migration: raise both when your provider sends a list as one parameter.
- Filter, sort and group local `DateTime` values of an in-memory query at the UTC instant they display, lower in-memory `Lowercase` text comparisons invariantly, and answer numbers beyond a `float` or `decimal` member with the new `CanopyCommitMessages.OutOfRange` cell error.
