using System;
using CanopyX.Json;

namespace CanopyX;

/// <summary>
/// Content of a detail row: a row under its parent that holds a table, a property list, or host markup instead of
/// cells. It is as tall as its content unless <see cref="Height"/> gives it a fixed number of row slots.
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
    /// Gets or sets how many row slots the detail row spans, from 1 to <see cref="MaxHeight"/>; content that needs
    /// more scrolls inside the row. Zero (the default) makes the row as tall as its content: the browser runtime
    /// measures it when it is shown, so the host does not have to guess a height from text lengths.
    /// </summary>
    /// <exception cref="ArgumentOutOfRangeException">The value is negative or above <see cref="MaxHeight"/>.</exception>
    public int Height {
        get => _height;
        set {
            if (value != 0 && (this is CanopyGridRowsDetail || this is CanopyTreeDetail))
                throw new ArgumentOutOfRangeException(nameof(value), value, "Nested grid and tree details use automatic content height.");
            if (value < 0 || value > MaxHeight) {
                throw new ArgumentOutOfRangeException(nameof(value), value, "Detail height must be between 0 (automatic) and " + MaxHeight + " row slots.");
            }

            _height = value;
        }
    }

    internal abstract string Type { get; }

    /// <summary>Checks detail values at the enclosing row's cell depth before a value writer can restart validation.</summary>
    internal void ValidateStructure(int depth) {
        if (depth > CanopyCell.MaxStructureDepth) throw new InvalidOperationException("Structured values nest at most " + CanopyCell.MaxStructureDepth + " levels.");
        switch (this) {
            case CanopyPropertiesDetail properties:
                foreach (var item in properties.Items) {
                    if (item == null) throw new InvalidOperationException("A properties detail cannot contain a null item.");
                    item.Value.ValidateShape(depth);
                }
                break;
            case CanopyTableDetail table:
                foreach (var row in table.Rows) {
                    if (row == null) throw new InvalidOperationException("A table detail cannot contain a null row.");
                    foreach (var cell in row) cell?.ValidateShape(depth);
                }
                break;
            case CanopyGridRowsDetail grid:
                CanopyGridRows.Validate(grid.Rows, structureDepth: depth + 1);
                break;
            case CanopyTreeDetail tree:
                CanopyTreeValidator.Validate(tree.Roots, "A nested detail tree", structureDepth: depth + 1);
                break;
        }
    }

    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject().Property("type", Type);
        if (_height > 0) {
            writer.Property("height", _height);
        }

        WriteContent(writer);
        writer.EndObject();
    }

    internal abstract void WriteContent(CanopyJsonWriter writer);
}
