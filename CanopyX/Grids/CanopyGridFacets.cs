using System;
using System.Globalization;
using CanopyX.Bundles;

namespace CanopyX;

/// <summary>Canonical typed facet identities and declared capability bindings.</summary>
internal static class CanopyGridFacets {
    internal static CanopyColumn Column(CanopyDataGridView view, string id) {
        if (view.Reporting == null || !view.Reporting.FacetColumns.Contains(id))
            throw new InvalidOperationException("Facets require an opted-in declared column.");
        foreach (var column in view.Columns) if (column.Id == id) return column;
        throw new InvalidOperationException("Facets require a declared column.");
    }
    internal static string Key(object? value) {
        if (value == null) return "null";
        if (value is string text) {
            var units = text.ToCharArray();
            for (var i = 0; i < units.Length; i++) units[i] = CanopySearchFolding.Fold(units[i]);
            return "s:" + new string(units);
        }
        if (value is bool flag) return flag ? "b:true" : "b:false";
        if (value is DateTime date) return "d:" + (date.Ticks / TimeSpan.TicksPerMillisecond).ToString(CultureInfo.InvariantCulture);
        var number = CanopyNumericValues.ToDouble(value);
        return "n:" + (number == 0 ? "0" : number.ToString("R", CultureInfo.InvariantCulture));
    }
}
