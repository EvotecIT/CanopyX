# Changelog

## Unreleased

- Build a grid in one call with `CanopyDataGridView.From(records, x => x.Id)`: a typed column per public property, adjusted with `[CanopyKey]`, `[CanopyColumn(Title, Order, Hidden, Format)]` and `[CanopyIgnore]`. `From` also takes a `DataTable` or dictionary rows (`Dictionary<string, object?>`, PowerShell hashtables) with a named key column.
- Write typed grids directly with `ToHtmlPage`, `SaveHtmlPage` and `ToHtmlFragment`, and any tree or grid as a script-free table with `ToStaticHtml()`.
- Add `CanopyHtmlOptions.HeadHtml` for host styles and scripts in a page's head, in place of replacing `</head>` in the written page.
- Breaking: remove `CanopyGridMapper<T>`. Use `CanopyDataGridView<T>`: `Column(id, selector, title, configure)` per column, `Row(record)` for `MapRow`, and `AddRows(records)` with settings on `View` for `CreateView` (see [authoring](docs/authoring.md#flat-data-grid)).

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
