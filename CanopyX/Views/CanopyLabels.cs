using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

/// <summary>
/// The texts CanopyX writes itself, in the browser and in the static outline: the search box, "show more" and error
/// rows, the column chooser, screen-reader announcements, date suffixes, and the notes of the outline. They are
/// English by default; a host that shows its pages in another language sets them once on
/// <see cref="CanopyTreeView.Labels"/>, and the view document carries them to the browser.
/// </summary>
/// <remarks>
/// <para>
/// A text can hold placeholders in braces, which CanopyX replaces: <c>{count}</c>, <c>{total}</c>, <c>{loaded}</c>,
/// <c>{shown}</c>, <c>{min}</c>, <c>{error}</c>, <c>{column}</c>, <c>{width}</c>, and <c>{time}</c>, as each
/// property says. Numbers are formatted in the page language (in the browser) or in
/// <c>CanopyStaticHtmlOptions.Culture</c> (in the outline). For a language with plural forms, phrase the text so the
/// number stands on its own, for example <c>Wyniki: {count}</c>, or give one form per plural category of the page language:
/// <c>[one]{count} match[other]{count} matches</c> (categories <c>zero</c>, <c>one</c>, <c>two</c>, <c>few</c>, <c>many</c> and
/// <c>other</c>, which every plural text needs). The browser picks the form with the language's plural rules for the count;
/// a form cannot contain "[". The match counts use plural forms.
/// </para>
/// <para>
/// Host data is never translated here: node labels, column titles, cells, badges, and the view's accessible name are
/// the host's own text. A browser host can also pass <c>labels</c> to <c>createTreeGrid</c> or
/// <c>CanopyX.configure</c>, which applies on top of the view's.
/// </para>
/// </remarks>
public sealed partial class CanopyLabels {
    private readonly Dictionary<string, string> _values = new Dictionary<string, string>(StringComparer.Ordinal);

    /// <summary>Gets or sets the placeholder and accessible name of the search box when the view's search options set none (<see cref="CanopySearchOptions.Placeholder"/>). Default "Search".</summary>
    public string SearchPlaceholder { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the result summary when a source cannot provide a matching count. Default "Result count unavailable".</summary>
    public string GridUnknownCount { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the known matching count when the unfiltered total is unknown, including <c>{count}</c>. Default "{count} matching rows".</summary>
    public string GridMatchedCount { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the returned range when its matching total is unknown, including <c>{first}</c> and <c>{last}</c>. Default "Rows {first}–{last}".</summary>
    public string GridCursorRange { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the grid export panel label. Default "Export".</summary>
    public string GridExport { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the filtered export scope label. Default "Filtered results".</summary>
    public string GridFilteredResults { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the selected export scope label. Default "Selected rows".</summary>
    public string GridSelectedRows { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the full dataset export scope label. Default "All results".</summary>
    public string GridAllResults { get => Get(); set => Set(value); }
    /// <summary>Gets or sets a tree's visible-rows export scope label. Default "Visible rows".</summary>
    public string GridVisibleRows { get => Get(); set => Set(value); }
    /// <summary>Gets or sets a tree's every-row export scope label. Default "All rows".</summary>
    public string GridAllRows { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the client CSV action label. Default "Download CSV".</summary>
    public string GridDownloadCsv { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the clipboard action label. Default "Copy".</summary>
    public string GridCopy { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the host record-details action label. Default "Record details".</summary>
    public string GridDetails { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the accessible name of the list of search results. Default "Search results".</summary>
    public string SearchResults { get => Get(); set => Set(value); }

    /// <summary>Gets or sets what a screen reader hears when a search found <c>{count}</c> results. Default "{count} results".</summary>
    public string SearchResultCount { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the announcement when the list shows <c>{count}</c> of <c>{total}</c> matches. Default "{count} of {total} results".</summary>
    public string SearchResultCountOfTotal { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the announcement when the list shows <c>{count}</c> of an unknown number of matches. Default "{count} of many results".</summary>
    public string SearchResultCountOfMany { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the announcement when a search found nothing. Default "No results".</summary>
    public string SearchNoResults { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the hint for a query shorter than <c>{min}</c> characters. Default "Type at least {min} characters".</summary>
    public string SearchTooShort { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the hint when every word of a query is one character long, which a bundle's index cannot look up; <c>{min}</c> is 2. Default "Type a word of at least {min} characters".</summary>
    public string SearchWordTooShort { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the announcement when a search failed with <c>{error}</c>. Default "Search failed: {error}".</summary>
    public string SearchFailed { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the button of the column chooser. Default "Columns".</summary>
    public string Columns { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the flat-grid control text. Default "Filters".</summary>
    public string GridFilters { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the accepted-result summary using <c>{count}</c> and <c>{total}</c>. Default "{count} of {total} rows".</summary>
    public string GridResultCount { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the page navigation form name. Default "Result pages".</summary>
    public string GridPaging { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the visible range using <c>{first}</c>, <c>{last}</c> and <c>{count}</c>. Default "{first}–{last} of {count} rows".</summary>
    public string GridPageRange { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the page jump input label. Default "Page".</summary>
    public string GridPageNumber { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the visible page length label. Default "Rows per page".</summary>
    public string GridPageLength { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the first-page action. Default "First page".</summary>
    public string GridFirstPage { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the previous-page action. Default "Previous page".</summary>
    public string GridPreviousPage { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the next-page action. Default "Next page".</summary>
    public string GridNextPage { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the last-page action. Default "Last page".</summary>
    public string GridLastPage { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the action that clears search and every filter. Default "Clear search and filters".</summary>
    public string GridClearQuery { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the search-chip action using <c>{search}</c>. Default "Clear search: {search}".</summary>
    public string GridRemoveSearch { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the grouped-filter chip using <c>{count}</c>. Default "Grouped filters ({count} conditions)".</summary>
    public string GridGroupedFilters { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the grouped-filter removal action. Default "Clear grouped filters".</summary>
    public string GridRemoveGroup { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the predicate removal action using <c>{condition}</c>. Default "Remove condition: {condition}".</summary>
    public string GridRemoveCondition { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the flat-grid control text. Default "Column".</summary>
    public string GridColumn { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the flat-grid control text. Default "Condition".</summary>
    public string GridOperator { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the flat-grid control text. Default "Value (UTC for dates)".</summary>
    public string GridValue { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the flat-grid control text. Default "Raw value type".</summary>
    public string GridValueType { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the flat-grid control text. Default "Text".</summary>
    public string GridText { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the flat-grid control text. Default "Boolean".</summary>
    public string GridBoolean { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the flat-grid control text. Default "Add filter".</summary>
    public string GridAddFilter { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the flat-grid control text. Default "Remove {column} filter".</summary>
    public string GridRemoveFilter { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the flat-grid control text. Default "Apply".</summary>
    public string GridApply { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the flat-grid control text. Default "Clear filters".</summary>
    public string GridClearFilters { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the flat-grid control text. Default "Move {column} earlier".</summary>
    public string GridMoveEarlier { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the flat-grid control text. Default "Move {column} later".</summary>
    public string GridMoveLater { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the flat-grid control text. Default "Saved views".</summary>
    public string GridViews { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the flat-grid control text. Default "View name".</summary>
    public string GridViewName { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the flat-grid control text. Default "Save view".</summary>
    public string GridSaveView { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the flat-grid control text. Default "Remove view".</summary>
    public string GridRemoveView { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the flat-grid control text. Default "Reset view".</summary>
    public string GridResetView { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the flat-grid control text. Default "Choose a saved view".</summary>
    public string GridChooseView { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the flat-grid control text. Default "Enter a valid filter value.".</summary>
    public string GridInvalidFilter { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the flat-grid control text. Default "contains".</summary>
    public string GridContains { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the flat-grid control text. Default "starts with".</summary>
    public string GridStartsWith { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the flat-grid control text. Default "is any of".</summary>
    public string GridIn { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the flat-grid control text. Default "is missing".</summary>
    public string GridIsNull { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the flat-grid control text. Default "is present".</summary>
    public string GridIsNotNull { get => Get(); set => Set(value); }

    /// <summary>
    /// Gets whether a flat-grid label (the calendar's included) is translated. Flat grids always use a grid runtime; a tree view writes only the
    /// labels the tree runtimes read (its toolbar menus' grid labels among them), so its translations never require one.
    /// </summary>
    public bool RequiresDataGridRuntime {
        get {
            foreach (var name in _values.Keys) if (name.StartsWith("Grid", StringComparison.Ordinal) || name.StartsWith("Calendar", StringComparison.Ordinal)) return true;
            return false;
        }
    }

    /// <summary>Gets or sets the accessible name of the column chooser's list. Default "Visible columns".</summary>
    public string VisibleColumns { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the accessible name of the handle that resizes column <c>{column}</c>. Default "Resize {column}".</summary>
    public string ResizeColumn { get => Get(); set => Set(value); }

    /// <summary>Gets or sets what a screen reader hears as a column's width of <c>{width}</c> pixels. Default "{width} pixels".</summary>
    public string ColumnWidth { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the row shown while children load. Default "Loading…".</summary>
    public string Loading { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the row shown when children could not be loaded because of <c>{error}</c>. Default "Could not load: {error} (Enter to retry)".</summary>
    public string LoadError { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the announcement when a view query failed with <c>{error}</c>. Default "Could not update the view: {error}".</summary>
    public string QueryFailed { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the accessible name of the context menu. Default "Actions".</summary>
    public string Actions { get => Get(); set => Set(value); }
    /// <summary>Gets or sets an editor's label, including <c>{column}</c>. Default "Edit {column}".</summary>
    public string EditValue { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the editor's submit button. Default "Save".</summary>
    public string SaveEdit { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the editor's cancel button. Default "Cancel".</summary>
    public string CancelEdit { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the invalid value message, including <c>{column}</c>. Default "Enter a valid {column} value.".</summary>
    public string InvalidEdit { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the announcement while a host hook is pending. Default "Waiting for the host…".</summary>
    public string InteractionPending { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the announcement for a declined proposal. Default "The host declined the operation.".</summary>
    public string InteractionRejected { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the failure announcement, including <c>{error}</c>. Default "Operation failed: {error}".</summary>
    public string InteractionFailed { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the menu command that marks a node for moving. Default "Move this node".</summary>
    public string MarkMove { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the command that proposes moving into a node. Default "Move here".</summary>
    public string MoveHere { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the command that proposes moving before a node. Default "Move before".</summary>
    public string MoveBefore { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the command that proposes moving after a node. Default "Move after".</summary>
    public string MoveAfter { get => Get(); set => Set(value); }
    /// <summary>Gets or sets the command that clears a move intent. Default "Cancel move".</summary>
    public string CancelMove { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the "show more" row, with <c>{loaded}</c> of <c>{total}</c> children loaded. Default "Show more ({loaded} of {total} loaded)".</summary>
    public string ShowMore { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the "show more" row when the number of children is not known. Default "Show more ({loaded} loaded)".</summary>
    public string ShowMoreUnknownTotal { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the announcement after a page of children, <c>{loaded}</c> of <c>{total}</c>. Default "{loaded} of {total} loaded".</summary>
    public string PageLoaded { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the announcement after the last page, <c>{count}</c> children in all. Default "{count} items".</summary>
    public string ItemsLoaded { get => Get(); set => Set(value); }

    /// <summary>Gets or sets how a true value without display text is shown. Default "Yes".</summary>
    public string Yes { get => Get(); set => Set(value); }

    /// <summary>Gets or sets how a false value without display text is shown. Default "No".</summary>
    public string No { get => Get(); set => Set(value); }

    /// <summary>Gets or sets how a date in UTC is shown; it must hold <c>{time}</c>, the date and time. Default "{time} UTC".</summary>
    public string UtcTime { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the tooltip that gives a UTC date in the reader's time zone; it must hold <c>{time}</c>. Default "{time} local time".</summary>
    public string LocalTime { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the notice shown in place of a view that failed with <c>{error}</c>. Default "This view could not be displayed: {error}".</summary>
    public string MountError { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the note under a shortened static outline, <c>{shown}</c> of <c>{total}</c> rows. Default "Showing {shown} of {total} rows.".</summary>
    public string OverflowNote { get => Get(); set => Set(value); }

    /// <summary>Gets or sets what the static outline writes for <c>{total}</c> when children a source would load have no count. Default "unknown".</summary>
    public string UnknownTotal { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the tooltip of the "(+N)" marker in the static outline, <c>{count}</c> rows not shown. Default "{count} rows below are not shown".</summary>
    public string HiddenRows { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the text of the link to the full report under a shortened static outline. Default "Open the full report".</summary>
    public string FullReport { get => Get(); set => Set(value); }

    /// <summary>Copies every label, so one set of translations can serve several views.</summary>
    /// <returns>A new set of labels with the same texts.</returns>
    public CanopyLabels Clone() {
        var copy = new CanopyLabels();
        foreach (var item in _values) {
            copy._values[item.Key] = item.Value;
        }

        return copy;
    }

    private string Get([System.Runtime.CompilerServices.CallerMemberName] string name = "") =>
        _values.TryGetValue(name, out var value) ? value : Defaults[name];

    private void Set(string value, [System.Runtime.CompilerServices.CallerMemberName] string name = "") {
        // Visible text as the browser judges it, where U+FEFF counts as white space too.
        if (value == null || value.Trim().Trim('\uFEFF').Trim().Length == 0) {
            throw new ArgumentException("Label " + name + " needs visible text.", nameof(value));
        }

        if ((name == nameof(UtcTime) || name == nameof(LocalTime)) && value.IndexOf("{time}", StringComparison.Ordinal) < 0) {
            throw new ArgumentException("Label " + name + " must hold {time}, where the date goes.", nameof(value));
        }

        if (value == Defaults[name]) {
            _values.Remove(name);
        } else {
            _values[name] = value;
        }
    }
}
