using System;
using System.Collections.Generic;
using System.Linq.Expressions;

namespace CanopyX.Data;

/// <summary>What a child-row mapping reads and builds: the child key, the order keys, the projected values and the cell they make.</summary>
internal sealed class ChildSpec<TChild> {
    internal ChildSpec(LambdaExpression key, IReadOnlyList<(LambdaExpression Expression, bool Descending)> orders, IReadOnlyList<LambdaExpression> values,
        bool collection, int size, Func<IReadOnlyList<object?[]>, int?, int, CanopyCell> build) {
        Key = key; Orders = orders; Values = values; Collection = collection; Size = size; Build = build;
    }

    /// <summary>The child key: unique among the record's child rows, the row identity of a collection and the final order key.</summary>
    internal LambdaExpression Key { get; }

    /// <summary>The order keys before the child key.</summary>
    internal IReadOnlyList<(LambdaExpression Expression, bool Descending)> Orders { get; }

    /// <summary>The values each child row projects, after its key.</summary>
    internal IReadOnlyList<LambdaExpression> Values { get; }

    /// <summary>Whether the rows are a paged collection with a total (otherwise a timeline or change list).</summary>
    internal bool Collection { get; }

    /// <summary>A collection's page size, or a timeline's or change list's item limit.</summary>
    internal int Size { get; }

    /// <summary>Builds the cell from the projected rows (key first, then <see cref="Values"/>), a collection's total and the
    /// rows Load more asks for (the page size within the endpoint's limit).</summary>
    internal Func<IReadOnlyList<object?[]>, int?, int, CanopyCell> Build { get; }

    /// <summary>Clips plain text with an ellipsis without splitting a surrogate pair; blank required text becomes an em dash.</summary>
    internal static string Text(object? value, int maximum, bool required) {
        var text = value as string;
        if (string.IsNullOrWhiteSpace(text)) return required ? "—" : string.Empty;
        return RecordText.Clip(text, maximum)!;
    }
}
