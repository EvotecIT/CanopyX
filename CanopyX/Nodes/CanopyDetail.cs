using System;
using CanopyX.Json;

namespace CanopyX;

/// <summary>
/// Content of a detail row: a row that spans several row slots under its parent and holds a table, a property list,
/// or host markup instead of cells.
/// </summary>
/// <remarks>
/// A node with a detail is a leaf: it cannot have children. Use <see cref="CanopyTableDetail"/>,
/// <see cref="CanopyPropertiesDetail"/>, or <see cref="CanopyHtmlDetail"/>.
/// </remarks>
public abstract class CanopyDetail {
    /// <summary>The largest number of row slots a detail row may span.</summary>
    public const int MaxHeight = 40;

    private int _height;

    private protected CanopyDetail() {
    }

    /// <summary>
    /// Gets or sets how many row slots the detail row spans, from 1 to <see cref="MaxHeight"/>.
    /// Zero (the default) picks a height from the content.
    /// </summary>
    /// <exception cref="ArgumentOutOfRangeException">The value is negative or above <see cref="MaxHeight"/>.</exception>
    public int Height {
        get => _height;
        set {
            if (value < 0 || value > MaxHeight) {
                throw new ArgumentOutOfRangeException(nameof(value), value, "Detail height must be between 0 (automatic) and " + MaxHeight + " row slots.");
            }

            _height = value;
        }
    }

    internal abstract string Type { get; }

    internal abstract int AutomaticHeight { get; }

    internal int ResolvedHeight => _height > 0 ? _height : Math.Max(1, Math.Min(MaxHeight, AutomaticHeight));

    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject().Property("type", Type).Property("height", ResolvedHeight);
        WriteContent(writer);
        writer.EndObject();
    }

    internal abstract void WriteContent(CanopyJsonWriter writer);
}
