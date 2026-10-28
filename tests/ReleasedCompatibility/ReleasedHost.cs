using System;
using System.Runtime.CompilerServices;
using CanopyX.Data;

namespace CanopyX.Released032;

/// <summary>A host compiled against the released 0.3.2 packages, never the current projects.</summary>
public static class ReleasedHost {
    /// <summary>Constructs a request or grouping object through its released binary signature.</summary>
    public static object Construct(string contract) => contract switch {
        "grid-group" => GridGroup(), "request" => Request(), "facet" => Facet(),
        "filter" => Filter(), "summary" => Summary(), _ => throw new ArgumentException(nameof(contract))
    };

    private static CanopyDataSchema Schema() {
        var view = new CanopyDataGridView("compatibility", "Released host") { Source = CanopyGridSource.HostedOffset() };
        view.Columns.Add(new CanopyColumn("name", "Name") { Sortable = true });
        return new CanopyDataSchema(view);
    }

    [MethodImpl(MethodImplOptions.NoInlining)]
    private static object GridGroup() => new CanopyGridGroupLevel("name", true, null);

    [MethodImpl(MethodImplOptions.NoInlining)]
    private static object Request() => new CanopyDataRequest(Schema(), search: "alpha", offset: 2, limit: 7, revision: "r1");

    [MethodImpl(MethodImplOptions.NoInlining)]
    private static object Facet() {
        var schema = Schema();
        return new CanopyFacetRequest(CanopyRequestParser.ParseQuery("{}", schema), schema.GetColumn("name"), "alpha", 3, false);
    }

    [MethodImpl(MethodImplOptions.NoInlining)]
    private static object Filter() => new CanopyFilterCondition(Schema().GetColumn("name"), CanopyGridFilterOperator.Equal, new object[] { "alpha" });

    [MethodImpl(MethodImplOptions.NoInlining)]
    private static object Summary() => new CanopySummaryLevel(Schema().GetColumn("name"), true, null);
}
