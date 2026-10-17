using System;

namespace CanopyX.Data;

/// <summary>Captures the authoring metadata consumed by remote request and response validation.</summary>
internal static class CanopyDataSnapshot {
    internal static CanopyColumn Column(CanopyColumn source) => new CanopyColumn(source.Id, source.Title) {
        Kind = source.Kind, Sortable = source.Sortable, Ordering = source.Ordering, Hidden = source.Hidden,
        Filterable = source.Filterable, Exportable = source.Exportable,
        Editable = source.Editable, Editor = Editor(source.Editor), Validation = Validation(source.Validation),
        Sizing = source.Sizing, Wrap = source.Wrap, Presenter = source.Presenter, Aggregatable = source.Aggregatable,
        Section = source.Section, ShowInDrawer = source.ShowInDrawer, Renderer = source.Renderer,
        ResponsivePriority = source.ResponsivePriority, AlwaysVisible = source.AlwaysVisible, Pinned = source.Pinned,
        RowHeader = source.RowHeader, Tooltip = source.Tooltip
    };

    internal static CanopyCellValidation? Validation(CanopyCellValidation? source) => source == null ? null : new CanopyCellValidation {
        Required = source.Required, Minimum = source.Minimum, Maximum = source.Maximum, Earliest = source.Earliest,
        Latest = source.Latest, MinLength = source.MinLength, MaxLength = source.MaxLength, Pattern = source.Pattern, Message = source.Message
    };

    internal static CanopyCellEditor? Editor(CanopyCellEditor? source) {
        if (source == null) return null;
        var copy = source.Kind switch {
            CanopyCellEditorKind.Text => CanopyCellEditor.Text(),
            CanopyCellEditorKind.Number => CanopyCellEditor.Number(),
            CanopyCellEditorKind.Date => CanopyCellEditor.Date(),
            CanopyCellEditorKind.DateTime => CanopyCellEditor.DateTime(),
            CanopyCellEditorKind.Time => CanopyCellEditor.Time(),
            CanopyCellEditorKind.Select => CanopyCellEditor.Select(Array.Empty<CanopyEditorOption>()),
            CanopyCellEditorKind.Toggle => CanopyCellEditor.Toggle(),
            CanopyCellEditorKind.Lookup => CanopyCellEditor.Lookup(),
            CanopyCellEditorKind.Custom => CanopyCellEditor.Custom(source.Name!),
            _ => throw new ArgumentOutOfRangeException(nameof(source))
        };
        copy.Minimum = source.Minimum; copy.Maximum = source.Maximum; copy.Step = source.Step;
        copy.Placeholder = source.Placeholder; copy.LookupColumn = source.LookupColumn;
        copy.LookupLimit = source.LookupLimit; copy.LookupMinLength = source.LookupMinLength;
        foreach (var option in source.Options) copy.Options.Add(option); // Options are immutable scalar descriptors.
        return copy;
    }

    internal static CanopyDataGridView View(CanopyDataGridView source) {
        var copy = new CanopyDataGridView(source.Id, source.Label) {
            Source = source.Source, PageSize = source.PageSize, Presentation = source.Presentation,
            Selection = source.Selection, StateKey = source.StateKey, Record = Record(source.Record),
            Reporting = Reporting(source.Reporting)
        };
        foreach (var column in source.Columns) copy.Columns.Add(Column(column));
        foreach (var id in source.SearchColumns) copy.SearchColumns.Add(id);
        return copy;
    }

    private static CanopyGridReporting? Reporting(CanopyGridReporting? source) {
        if (source == null) return null;
        var copy = new CanopyGridReporting { Grouping = source.Grouping, Groupable = source.Groupable };
        foreach (var level in source.GroupBy) copy.GroupBy.Add(level);
        foreach (var aggregate in source.Aggregates) copy.Aggregates.Add(aggregate);
        foreach (var id in source.FacetColumns) copy.FacetColumns.Add(id);
        if (source.Detail is CanopyGridDetail detail) {
            copy.Detail = new CanopyGridDetail { Template = detail.Template, Renderer = detail.Renderer,
                Label = detail.Label, Print = detail.Print, View = detail.View == null ? null : View(detail.View) };
            if (detail.TreeView is CanopyTreeView tree) {
                var nested = copy.Detail.TreeView = new CanopyTreeView(tree.Id, tree.Label) { Record = Record(tree.Record) };
                foreach (var column in tree.Columns) nested.Columns.Add(Column(column));
                foreach (var icon in tree.Icons) nested.Icons.Add(icon.Key, icon.Value);
            }
        }
        return copy;
    }

    private static CanopyRecordPanel? Record(CanopyRecordPanel? source) {
        if (source == null) return null;
        var copy = new CanopyRecordPanel { Source = source.Source };
        foreach (var field in source.Fields) copy.Fields.Add(Column(field));
        return copy;
    }
}
