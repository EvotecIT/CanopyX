using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;
using CanopyX.Json;

namespace CanopyX;

/// <summary>
/// Marks search and filter matches inside a view's cells: quick-search hits, column-filter hits (flat grids) and search
/// hits in tree nodes, as accessible <c>&lt;mark&gt;</c> elements styled through theme tokens. The view shows a live match
/// count and Previous and Next buttons in its search box, and a Highlight matches switch in its more menu; the reader's
/// choice is part of the state saved views keep.
/// </summary>
/// <remarks>
/// <para>
/// Matching follows the view's search: case is folded the way search folds it, and a flat grid's search mode decides
/// whether the search text is one phrase or several words. <see cref="MatchCase"/> and <see cref="IgnoreAccents"/> narrow
/// or widen what is marked without changing which rows match. Only text is marked: links, pills, chips and host controls
/// keep their markup. Only the rows a view paints are marked, so large results stay fast.
/// </para>
/// <para>Set it on <see cref="CanopyDataGridView.SearchHighlight"/> or <see cref="CanopyTreeView.SearchHighlight"/>.</para>
/// </remarks>
public sealed class CanopySearchHighlight {
    private static readonly Regex ToneName = new Regex("^[a-z][a-z0-9-]{0,31}$", RegexOptions.CultureInvariant);
    private int _minLength = 1;

    /// <summary>Gets or sets whether matches are marked when the view opens. The reader can switch it. Defaults to true.</summary>
    public bool Enabled { get; set; } = true;

    /// <summary>Gets or sets whether quick-search text is marked. Defaults to true.</summary>
    public bool Search { get; set; } = true;

    /// <summary>Gets or sets whether a flat grid marks the values its column filters match, styled apart from search hits. Defaults to true.</summary>
    public bool Filters { get; set; } = true;

    /// <summary>Gets or sets whether marking compares case exactly. Defaults to false, the search's own case folding.</summary>
    public bool MatchCase { get; set; }

    /// <summary>Gets or sets whether a letter with accents matches its base letter when marking, for example <c>é</c> for <c>e</c>. Defaults to false.</summary>
    public bool IgnoreAccents { get; set; }

    /// <summary>Gets or sets the shortest term, in characters, that is marked, from 1 to 32. Defaults to 1.</summary>
    /// <exception cref="ArgumentOutOfRangeException">The value is below 1 or above 32.</exception>
    public int MinLength {
        get => _minLength;
        set {
            if (value < 1 || value > 32) throw new ArgumentOutOfRangeException(nameof(value), value, "The minimum length must be between 1 and 32.");
            _minLength = value;
        }
    }

    /// <summary>
    /// Gets the tone (<c>info</c>, <c>success</c>, <c>warning</c>, <c>danger</c> or a host tone) that marks the filter hits of a
    /// column, keyed by column id. Columns without one use the filter-hit token.
    /// </summary>
    public IDictionary<string, string> FilterTones { get; } = new Dictionary<string, string>(StringComparer.Ordinal);

    internal void Validate(IEnumerable<CanopyColumn> columns) {
        var ids = new HashSet<string>(StringComparer.Ordinal);
        foreach (var column in columns) if (column != null) ids.Add(column.Id);
        foreach (var tone in FilterTones) {
            if (!ids.Contains(tone.Key) || tone.Value == null || !ToneName.IsMatch(tone.Value) || tone.Value.EndsWith("-bg", StringComparison.Ordinal))
                throw new InvalidOperationException("Search highlight filter tones need a declared column and a tone name.");
        }
    }

    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject();
        if (!Enabled) writer.Property("enabled", false);
        if (!Search) writer.Property("search", false);
        if (!Filters) writer.Property("filters", false);
        if (MatchCase) writer.Property("matchCase", true);
        if (IgnoreAccents) writer.Property("ignoreAccents", true);
        if (MinLength != 1) writer.Property("minLength", MinLength);
        if (FilterTones.Count > 0) {
            writer.Name("filterTones").BeginObject();
            foreach (var tone in FilterTones) writer.Property(tone.Key, tone.Value);
            writer.EndObject();
        }
        writer.EndObject();
    }
}
