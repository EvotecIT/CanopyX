# Changelog

## Unreleased

- Add `CanopyDataGridView.SelectOnClick` and mutable `api.selectOnClick` for pointer selection without reporting checkboxes, including Ctrl/Command toggles and Shift ranges.
- Address fragment and page hosts by their view id, or override it with `CanopyHtmlOptions.HostId`.
- Name each field in multi-field linked-filter chips while keeping one removable chip per source and honoring explicit labels.
- Read canonical HtmlForgeX surface, border and text roles first, with legacy role names as fallbacks.
