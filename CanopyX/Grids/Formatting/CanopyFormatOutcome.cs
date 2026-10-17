using System.Collections.Generic;

namespace CanopyX;

/// <summary>A row's formatting: the row target and the cell targets by column.</summary>
internal sealed class CanopyFormatOutcome {
    private readonly Dictionary<string, CanopyFormatPaint>? _cells;

    internal CanopyFormatOutcome(CanopyFormatPaint? row, Dictionary<string, CanopyFormatPaint>? cells) {
        Row = row;
        _cells = cells;
        if (cells != null) foreach (var cell in cells.Values) cell.Finish();
    }

    internal CanopyFormatPaint? Row { get; }

    internal CanopyFormatPaint? Cell(string column) => _cells != null && _cells.TryGetValue(column, out var paint) ? paint : null;
}
