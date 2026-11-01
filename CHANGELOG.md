# Changelog

## Unreleased

- Add a first-party accordion (`CanopyX.accordion`, C# `CanopyAccordion`): single or multiple open sections, disabled sections, deferred content, a filter, copy-title and header actions, hash and remembered state, nesting and readable content without JavaScript.
- Add the slim UI entry point (`canopyx-ui.js`, `@evotecit/canopyx/ui`, `CanopyRuntime.Ui`): about 5 KB gzipped, for content pages with no grid or tree.
- Add tab `remember`, `justified`, `next()` and `back()`.
- Add `CanopyDataGridView.SelectOnClick` and mutable `api.selectOnClick` for pointer selection without reporting checkboxes, including Ctrl/Command toggles and Shift ranges.
- Address fragment and page hosts by their view id, or override it with `CanopyHtmlOptions.HostId`.
- Name each field in multi-field linked-filter chips while keeping one removable chip per source and honoring explicit labels.
- Read canonical HtmlForgeX surface, border and text roles first, with legacy role names as fallbacks.
