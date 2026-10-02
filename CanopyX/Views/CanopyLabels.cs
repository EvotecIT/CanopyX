using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

/// <summary>
/// The texts CanopyX writes itself, in the browser and in the static outline: the search box, "show more" and error
/// rows, the column chooser, screen-reader announcements, date suffixes, and the notes of the outline. They are
/// English by default; a host that shows its pages in another language sets them once on
/// <see cref="CanopyView.Labels"/>, and the view document carries them to the browser.
/// </summary>
/// <remarks>
/// <para>
/// A text can hold placeholders in braces, which CanopyX replaces: <c>{count}</c>, <c>{total}</c>, <c>{loaded}</c>,
/// <c>{shown}</c>, <c>{min}</c>, <c>{error}</c>, <c>{column}</c>, <c>{width}</c>, and <c>{time}</c>, as each
/// property says. Numbers are formatted in the page language (in the browser) or in
/// <c>CanopyStaticHtmlOptions.Culture</c> (in the outline). For a language with plural forms, phrase the text so the
/// number stands on its own, for example <c>Wyniki: {count}</c>.
/// </para>
/// <para>
/// Host data is never translated here: node labels, column titles, cells, badges, and the view's accessible name are
/// the host's own text. A browser host can also pass <c>labels</c> to <c>createTreeGrid</c> or
/// <c>CanopyX.configure</c>, which applies on top of the view's.
/// </para>
/// </remarks>
public sealed class CanopyLabels {
    private static readonly Dictionary<string, string> Defaults = new Dictionary<string, string>(StringComparer.Ordinal) {
        [nameof(SearchPlaceholder)] = "Search",
        [nameof(SearchResults)] = "Search results",
        [nameof(SearchResultCount)] = "{count} results",
        [nameof(SearchResultCountOfTotal)] = "{count} of {total} results",
        [nameof(SearchResultCountOfMany)] = "{count} of many results",
        [nameof(SearchNoResults)] = "No results",
        [nameof(SearchTooShort)] = "Type at least {min} characters",
        [nameof(SearchWordTooShort)] = "Type a word of at least {min} characters",
        [nameof(SearchFailed)] = "Search failed: {error}",
        [nameof(Columns)] = "Columns",
        [nameof(VisibleColumns)] = "Visible columns",
        [nameof(ResizeColumn)] = "Resize {column}",
        [nameof(ColumnWidth)] = "{width} pixels",
        [nameof(Loading)] = "Loading…",
        [nameof(LoadError)] = "Could not load: {error} (Enter to retry)",
        [nameof(QueryFailed)] = "Could not update the view: {error}",
        [nameof(ShowMore)] = "Show more ({loaded} of {total} loaded)",
        [nameof(ShowMoreUnknownTotal)] = "Show more ({loaded} loaded)",
        [nameof(PageLoaded)] = "{loaded} of {total} loaded",
        [nameof(ItemsLoaded)] = "{count} items",
        [nameof(Yes)] = "Yes",
        [nameof(No)] = "No",
        [nameof(UtcTime)] = "{time} UTC",
        [nameof(LocalTime)] = "{time} local time",
        [nameof(MountError)] = "This view could not be displayed: {error}",
        [nameof(OverflowNote)] = "Showing {shown} of {total} rows.",
        [nameof(UnknownTotal)] = "unknown",
        [nameof(HiddenRows)] = "{count} rows below are not shown",
        [nameof(FullReport)] = "Open the full report"
    };

    /// <summary>The labels the browser runtime reads from the view document, in document order.</summary>
    private static readonly string[] RuntimeNames = {
        nameof(SearchPlaceholder), nameof(SearchResults), nameof(SearchResultCount), nameof(SearchResultCountOfTotal), nameof(SearchResultCountOfMany),
        nameof(SearchNoResults), nameof(SearchTooShort), nameof(SearchWordTooShort), nameof(SearchFailed), nameof(Columns), nameof(VisibleColumns),
        nameof(ResizeColumn), nameof(ColumnWidth), nameof(Loading), nameof(LoadError), nameof(QueryFailed), nameof(ShowMore), nameof(ShowMoreUnknownTotal),
        nameof(PageLoaded), nameof(ItemsLoaded), nameof(Yes), nameof(No), nameof(UtcTime), nameof(LocalTime), nameof(MountError)
    };

    private readonly Dictionary<string, string> _values = new Dictionary<string, string>(StringComparer.Ordinal);

    /// <summary>Gets or sets the placeholder and accessible name of the search box when the view's search options set none (<see cref="CanopySearchOptions.Placeholder"/>). Default "Search".</summary>
    public string SearchPlaceholder { get => Get(); set => Set(value); }

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

    /// <summary>Whether any label the browser reads differs from English, so the view document carries it.</summary>
    internal bool HasRuntimeLabels {
        get {
            foreach (var name in RuntimeNames) {
                if (_values.ContainsKey(name)) {
                    return true;
                }
            }

            return false;
        }
    }

    /// <summary>Writes the view document's <c>labels</c>: the labels the browser reads that differ from English.</summary>
    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject();
        foreach (var name in RuntimeNames) {
            if (_values.TryGetValue(name, out var value)) {
                writer.Property(char.ToLowerInvariant(name[0]) + name.Substring(1), value);
            }
        }

        writer.EndObject();
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
