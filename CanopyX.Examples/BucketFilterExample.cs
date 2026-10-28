using CanopyX.Html;

namespace CanopyX.Examples;

internal static class BucketFilterExample {
    internal static void Write(string output) {
        foreach (var shape in new[] { "flat", "nested", "tuple" }) {
            var view = new CanopyDataGridView("bucket-filter", "Bucket-filtered records") { Query = new CanopyGridQuery("bucket-filter") };
            view.Columns.Add(new CanopyColumn("amount", "Amount") { Kind = CanopyColumnKind.Number, Sortable = true });
            var filter = new CanopyGridFilter("amount", CanopyGridFilterOperator.Equal, new CanopyCell(0d)) { Bucket = CanopyBucket.FixedWidth(10) };
            if (shape == "flat") view.Query.Filters.Add(filter);
            else if (shape == "nested") {
                view.Query.FilterGroup = new CanopyGridFilterGroup(CanopyGridFilterJunction.All);
                view.Query.FilterGroup.Groups.Add(new CanopyGridFilterGroup(CanopyGridFilterJunction.Any, filter));
            } else view.Query.TupleFilters.Add(new CanopyGridTupleFilter(new[] { new CanopyGridTupleColumn("amount", filter.Bucket) }, new[] { new CanopyCell?[] { new CanopyCell(0d) } }));
            for (var index = 0; index < 4; index++) {
                var row = new CanopyGridRow(index + 1); row.Cells["amount"] = index * 5; view.Rows.Add(row);
            }
            File.WriteAllText(Path.Combine(output, "analysis-bucket-filter-" + shape + ".html"), view.ToHtmlPage(new CanopyHtmlOptions { Title = view.Label }));
        }
    }
}
