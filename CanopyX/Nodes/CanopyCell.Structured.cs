using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using CanopyX.Json;

namespace CanopyX;

public sealed partial class CanopyCell {
    /// <summary>The deepest nesting of structured values: an object in a collection in an object, and so on.</summary>
    public const int MaxStructureDepth = 8;

    private List<CanopyCell>? _items;
    private List<CanopyCellField>? _fields;
    private List<CanopyRecordEvent>? _events;
    private List<CanopyFieldChange>? _changes;

    /// <summary>Gets the items of a list value: text, numbers or dates, each with its own tone, tooltip or link.</summary>
    /// <remarks>
    /// A grid cell shows a list as chips or a count with the structured presenter; the record panel shows every item. Search,
    /// sorting, filters and exports read <see cref="Value"/>: <see cref="List(IEnumerable{CanopyCell}, string)"/> sets it to the items
    /// joined. A cell holds at most one structured value: items, fields, records, events or changes.
    /// </remarks>
    public IList<CanopyCell> Items => _items ??= new List<CanopyCell>();

    /// <summary>Gets the named values of an object value, shown as a nested property list.</summary>
    public IList<CanopyCellField> Fields => _fields ??= new List<CanopyCellField>();

    /// <summary>Gets or sets a collection of records: a nested grid or tree in the record panel.</summary>
    public CanopyRecordList? Records { get; set; }

    /// <summary>Gets the events of a timeline value, in the order given (newest first is usual).</summary>
    public IList<CanopyRecordEvent> Events => _events ??= new List<CanopyRecordEvent>();

    /// <summary>Gets the before and after values of a change list.</summary>
    public IList<CanopyFieldChange> Changes => _changes ??= new List<CanopyFieldChange>();

    /// <summary>Gets or sets a record this value links to: the record panel shows it as a link that opens that record.</summary>
    public CanopyRecordRef? Ref { get; set; }

    /// <summary>Gets whether the cell holds a structured value: items, fields, records, events or changes.</summary>
    public bool IsStructured => _items?.Count > 0 || _fields?.Count > 0 || Records != null || _events?.Count > 0 || _changes?.Count > 0;

    /// <summary>Creates a list value whose raw value is the items' text joined, so search, filters, sorting and exports read it.</summary>
    /// <param name="items">The items.</param>
    /// <param name="separator">The separator of the joined value.</param>
    /// <returns>The cell.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="items"/> is null.</exception>
    public static CanopyCell List(IEnumerable<CanopyCell> items, string separator = ", ") {
        var list = (items ?? throw new ArgumentNullException(nameof(items))).ToList();
        var cell = new CanopyCell(list.Count == 0 ? null : string.Join(separator ?? ", ", list.Select(ItemText)));
        cell._items = list;
        return cell;
    }

    // An item's text in a list's joined value: its display text, else its value (dates as ISO 8601 UTC, numbers round-tripped).
    private static string ItemText(CanopyCell? item) => item?.Text ?? item?.Value switch {
        null => string.Empty, DateTime date => FormatIso(date), double real => real.ToString("R", CultureInfo.InvariantCulture),
        bool flag => flag ? "true" : "false", var value => Convert.ToString(value, CultureInfo.InvariantCulture) ?? string.Empty
    };

    /// <summary>Creates a list value of text items, whose raw value is the items joined with a comma.</summary>
    /// <param name="items">The items.</param>
    /// <returns>The cell.</returns>
    public static CanopyCell List(params string[] items) => List((items ?? throw new ArgumentNullException(nameof(items))).Select(item => new CanopyCell(item)));

    /// <summary>Creates an object value: named values shown as a nested property list.</summary>
    /// <param name="fields">The named values.</param>
    /// <returns>The cell, without a raw value; set <see cref="Text"/> or create the cell with a value to give a grid column one.</returns>
    public static CanopyCell Object(params CanopyCellField[] fields) {
        var cell = new CanopyCell();
        cell._fields = new List<CanopyCellField>(fields ?? throw new ArgumentNullException(nameof(fields)));
        return cell;
    }

    /// <summary>Creates a collection value: a nested grid or tree of records.</summary>
    /// <param name="records">The collection.</param>
    /// <returns>The cell, without a raw value; in a number column give it the record count: <c>new CanopyCell(12) { Records = list }</c>.</returns>
    public static CanopyCell Collection(CanopyRecordList records) => new CanopyCell { Records = records ?? throw new ArgumentNullException(nameof(records)) };

    /// <summary>Creates a timeline value.</summary>
    /// <param name="events">The events, in the order to show them.</param>
    /// <returns>The cell.</returns>
    public static CanopyCell Timeline(IEnumerable<CanopyRecordEvent> events) {
        var cell = new CanopyCell();
        cell._events = new List<CanopyRecordEvent>(events ?? throw new ArgumentNullException(nameof(events)));
        return cell;
    }

    /// <summary>Creates a before/after value: the fields that changed.</summary>
    /// <param name="changes">The changes.</param>
    /// <returns>The cell.</returns>
    public static CanopyCell Diff(IEnumerable<CanopyFieldChange> changes) {
        var cell = new CanopyCell();
        cell._changes = new List<CanopyFieldChange>(changes ?? throw new ArgumentNullException(nameof(changes)));
        return cell;
    }

    /// <summary>Creates a text value that links to a record.</summary>
    /// <param name="text">The text shown.</param>
    /// <param name="id">The linked record's identity.</param>
    /// <param name="view">The id of the grid or tree holding the record; null for the value's own view.</param>
    /// <returns>The cell.</returns>
    public static CanopyCell Link(string text, string id, string? view = null) => new CanopyCell(text) { Ref = new CanopyRecordRef(id, view) };

    /// <summary>Checks the structured value and returns its nesting depth.</summary>
    internal int ValidateStructure(int depth) {
        if (depth > MaxStructureDepth) throw new InvalidOperationException("Structured values nest at most " + MaxStructureDepth + " levels.");
        var kinds = (_items?.Count > 0 ? 1 : 0) + (_fields?.Count > 0 ? 1 : 0) + (Records != null ? 1 : 0) + (_events?.Count > 0 ? 1 : 0) + (_changes?.Count > 0 ? 1 : 0);
        if (kinds > 1) throw new InvalidOperationException("A cell holds one structured value: items, fields, records, events or changes.");
        if (_items?.Count > 4096 || _fields?.Count > 512 || _events?.Count > 10000 || _changes?.Count > 512) throw new InvalidOperationException("A structured value exceeds its item bound (4,096 items, 512 fields or changes, 10,000 events).");
        Ref?.Validate();
        if (_items != null) foreach (var item in _items) {
            if (item == null) throw new InvalidOperationException("A list cannot contain a null item.");
            if (item.IsStructured) throw new InvalidOperationException("List items are values; use fields or records for nested structures.");
            item.ValidateStructure(depth + 1);
        }
        if (_fields != null) foreach (var field in _fields) (field ?? throw new InvalidOperationException("An object cannot contain a null field.")).Value?.ValidateStructure(depth + 1);
        if (_changes != null) foreach (var change in _changes) {
            if (change == null) throw new InvalidOperationException("A change list cannot contain a null change.");
            change.Before?.ValidateStructure(depth + 1); change.After?.ValidateStructure(depth + 1);
        }
        if (_events != null) foreach (var item in _events) {
            if (item == null) throw new InvalidOperationException("A timeline cannot contain a null event.");
            foreach (var change in item.Changes) {
                if (change == null) throw new InvalidOperationException("An event cannot contain a null change.");
                change.Before?.ValidateStructure(depth + 1); change.After?.ValidateStructure(depth + 1);
            }
        }
        Records?.Validate(depth);
        return depth;
    }

    private void WriteStructure(CanopyJsonWriter writer) {
        if (_items?.Count > 0) {
            writer.Name("items").BeginArray();
            foreach (var item in _items) item.WriteJson(writer);
            writer.EndArray();
        } else if (_fields?.Count > 0) {
            writer.Name("fields").BeginArray();
            foreach (var field in _fields) field.WriteJson(writer);
            writer.EndArray();
        } else if (Records != null) {
            writer.Name("records");
            Records.WriteJson(writer);
        } else if (_events?.Count > 0) {
            writer.Name("events").BeginArray();
            foreach (var item in _events) item.WriteJson(writer);
            writer.EndArray();
        } else if (_changes?.Count > 0) {
            writer.Name("changes").BeginArray();
            foreach (var change in _changes) change.WriteJson(writer);
            writer.EndArray();
        }
        if (Ref != null) { writer.Name("ref"); Ref.WriteJson(writer); }
    }
}
