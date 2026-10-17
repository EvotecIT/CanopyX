using System;
using CanopyX.Json;

namespace CanopyX;

public sealed partial class CanopyGridPresenter {
    /// <summary>Gets how a structured presenter summarises its value; null lets the value choose (chips for a list, the first value
    /// of an object, a count for a collection, timeline or change list).</summary>
    public CanopyGridStructuredDisplay? Display { get; private set; }

    /// <summary>Gets the count text of a structured presenter, holding <c>{count}</c> (for example "{count} names"); null uses the
    /// translated "{count} items".</summary>
    public string? CountText { get; private set; }

    /// <summary>
    /// Creates a summary of a structured value (<see cref="CanopyCell.Items"/>, <see cref="CanopyCell.Fields"/>,
    /// <see cref="CanopyCell.Records"/>, <see cref="CanopyCell.Events"/> or <see cref="CanopyCell.Changes"/>): a count, chips, or the
    /// first item and "+N". The record panel shows the whole structure. A cell's own text wins when no display is chosen.
    /// </summary>
    /// <param name="display">How to summarise; null lets the value choose.</param>
    /// <param name="limit">How many chips show before "+N", from 1 to 16.</param>
    /// <param name="countText">The count text with <c>{count}</c>, at most 256 characters; null uses the translated default.</param>
    /// <returns>The immutable descriptor.</returns>
    /// <exception cref="ArgumentOutOfRangeException">The display is unknown or the limit is outside 1 to 16.</exception>
    /// <exception cref="ArgumentException">The count text lacks <c>{count}</c> or is longer than 256 characters.</exception>
    public static CanopyGridPresenter Structured(CanopyGridStructuredDisplay? display = null, int limit = 3, string? countText = null) {
        if (display.HasValue && (display < CanopyGridStructuredDisplay.Count || display > CanopyGridStructuredDisplay.First)) throw new ArgumentOutOfRangeException(nameof(display));
        if (limit < 1 || limit > 16) throw new ArgumentOutOfRangeException(nameof(limit));
        if (countText != null && (countText.Length > 256 || countText.IndexOf("{count}", StringComparison.Ordinal) < 0)) throw new ArgumentException("A count text holds {count} and has at most 256 characters.", nameof(countText));
        return new CanopyGridPresenter(CanopyGridPresenterKind.Structured, limit: limit) { Display = display, CountText = countText };
    }

    private void WriteStructuredJson(CanopyJsonWriter writer) {
        if (Kind != CanopyGridPresenterKind.Structured) return;
        if (Display.HasValue) writer.Property("display", Display == CanopyGridStructuredDisplay.Count ? "count" : Display == CanopyGridStructuredDisplay.Chips ? "chips" : "first");
        if (Limit != 3) writer.Property("limit", Limit);
        writer.OptionalProperty("countText", CountText);
    }
}
