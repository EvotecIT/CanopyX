using CanopyX.Html;
using CanopyX.Rendering;

namespace CanopyX.Examples;

/// <summary>A standalone host fixture demonstrating sequential navigation without a total count.</summary>
internal static class CursorGridExample {
    internal static void Write(string output) {
        var view = new CanopyDataGridView("cursor-grid", "Sequential records") {
            Source = CanopyGridSource.HostedCursor(), PageLength = 25, PageSize = 100,
            Search = false, Selection = CanopySelectionMode.Multiple
        };
        view.Columns.Add(new CanopyColumn("position", "Record number") { Kind = CanopyColumnKind.Number, Sizing = CanopyColumnSizing.Preferred(280), Sortable = true });
        var snapshot = new CanopyGridCursorPage(view.Id, "fixture-1", 0);
        for (var i = 0; i < 5; i++) {
            var row = new CanopyGridRow("record-" + i); row.Cells["position"] = i + 1; snapshot.Rows.Add(row);
        }
        File.WriteAllText(Path.Combine(output, "cursor-grid-static.html"), "<!doctype html><html lang=\"en\"><meta charset=\"utf-8\"><title>Cursor snapshot</title><body>" +
            CanopyStaticHtml.RenderGrid(view, snapshot) + "</body></html>");
        foreach (var theme in new[] { CanopyTheme.Light, CanopyTheme.Dark }) {
            var html = view.ToHtmlPage(new CanopyHtmlOptions { Title = "CanopyX cursor navigation", Theme = theme });
            File.WriteAllText(Path.Combine(output, theme == CanopyTheme.Light ? "cursor-grid.html" : "cursor-grid-dark.html"),
                html.Replace("</head>", Source + "</head>"));
        }
    }

    // This fixture has one numeric field. Production hosts execute the same query in their canonical data owner.
    private const string Source = """
<script>
CanopyX.configure('cursor-grid', { source: { navigation: 'cursor', query(query, {signal}) {
  signal.throwIfAborted();
  if (query.revision && query.revision !== 'fixture-1') throw new Error('The requested fixture revision is unavailable.');
  const matches = (value, filter) => {
    const operand = filter.values[0];
    switch (filter.operator) {
      case 'eq': return value === operand; case 'ne': return value !== operand;
      case 'gt': return value > operand; case 'ge': return value >= operand;
      case 'lt': return value < operand; case 'le': return value <= operand;
      case 'in': return filter.values.includes(value); case 'isNull': return false; case 'isNotNull': return true;
      default: throw new Error('This numeric fixture received an unsupported condition.');
    }
  };
  const group = (value, expression) => {
    const conditions = [...expression.filters.map(filter => matches(value, filter)), ...expression.groups.map(child => group(value, child))];
    return expression.operator === 'and' ? conditions.every(Boolean) : conditions.some(Boolean);
  };
  let values = Array.from({length:137}, (_, index) => index + 1).filter(value =>
    query.filters.every(filter => matches(value, filter)) && (!query.filterGroup || group(value, query.filterGroup)));
  if (query.search) throw new Error('Search is disabled for this navigation fixture.');
  if (query.sort[0]?.direction === 'desc') values.reverse();
  const shape = JSON.stringify([query.filters,query.filterGroup,query.sort,query.limit]);
  const token = offset => JSON.stringify({offset,shape,revision:'fixture-1'});
  const position = query.cursor ? JSON.parse(query.cursor) : {offset:0};
  if (query.cursor && (position.shape !== shape || position.revision !== query.revision)) throw new Error('Invalid fixture cursor.');
  const offset = position.offset, items = values.slice(offset,offset+query.limit).map(value => ({id:'record-'+value,cells:{position:value}}));
  const page = {protocol:'canopyx/2',type:'gridCursorPage',view:'cursor-grid',revision:'fixture-1',offset,total:null,matched:null,items};
  if (offset+items.length < values.length) page.nextCursor = token(offset+items.length);
  if (offset) page.previousCursor = token(Math.max(0,offset-query.limit));
  return page;
}}});
</script>
""";
}
