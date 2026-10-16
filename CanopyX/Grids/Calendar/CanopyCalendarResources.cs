using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

/// <summary>
/// The resources of a <see cref="CanopyCalendar"/>: an ordinary tree view whose nodes are the resources (people, hosts, rooms,
/// grouped as deep as needed), shown as the lanes of the timeline beside the events. An event belongs to the node whose id its
/// <see cref="CanopyCalendar.Resource"/> cell holds.
/// </summary>
/// <remarks>The tree is written as a complete <c>view</c> document: inline roots, or a remote source that loads groups as they open.</remarks>
public sealed class CanopyCalendarResources {
    private CanopyTreeView _view;
    private int? _width;
    private string? _label;

    /// <summary>Creates the resources from a tree view.</summary>
    /// <param name="view">The tree of resources; its node ids are the resource ids.</param>
    /// <exception cref="ArgumentNullException"><paramref name="view"/> is null.</exception>
    public CanopyCalendarResources(CanopyTreeView view) {
        _view = view ?? throw new ArgumentNullException(nameof(view));
    }

    /// <summary>Gets or sets the tree of resources: inline roots or a remote source (not sidecar files).</summary>
    /// <exception cref="ArgumentNullException">The value is null.</exception>
    public CanopyTreeView View {
        get => _view;
        set => _view = value ?? throw new ArgumentNullException(nameof(value));
    }

    /// <summary>Gets or sets the width of the resource column in CSS pixels, 120 to 800; null keeps 280.</summary>
    /// <exception cref="ArgumentOutOfRangeException">The value is outside 120 to 800.</exception>
    public int? Width {
        get => _width;
        set => _width = value < 120 || value > 800 ? throw new ArgumentOutOfRangeException(nameof(value), value, "The resource column is 120 to 800 pixels wide.") : value;
    }

    /// <summary>Gets or sets the heading of the resource column; null uses the translated "Resources".</summary>
    /// <exception cref="ArgumentException">The value is blank or longer than 256 characters.</exception>
    public string? Label {
        get => _label;
        set => _label = CanopyCalendarValues.Label(value, nameof(value));
    }

    /// <summary>Gets the figures resource tree columns show for the visible period, by tree column id.</summary>
    public IDictionary<string, CanopyCalendarAggregate> Aggregates { get; } = new Dictionary<string, CanopyCalendarAggregate>(StringComparer.Ordinal);

    internal void Validate() {
        if (_view.Source.Kind == CanopySourceKind.Sidecar) throw new InvalidOperationException("A calendar's resource tree has inline roots or a remote source.");
        _view.Validate();
        foreach (var aggregate in Aggregates) {
            var declared = false;
            foreach (var column in _view.Columns) if (column != null && column.Id == aggregate.Key) declared = true;
            if (!declared) throw new InvalidOperationException("Resource aggregate '" + aggregate.Key + "' names a column the resource tree does not declare.");
            if (aggregate.Value < CanopyCalendarAggregate.Count || aggregate.Value > CanopyCalendarAggregate.Overlap) throw new ArgumentOutOfRangeException(nameof(Aggregates), aggregate.Value, "Unknown resource aggregate.");
        }
    }

    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject().Name("view");
        _view.WriteJson(writer);
        writer.OptionalProperty("width", _width).OptionalProperty("label", _label);
        if (Aggregates.Count > 0) {
            writer.Name("aggregates").BeginObject();
            foreach (var aggregate in Aggregates) writer.Property(aggregate.Key, CanopyCalendarValues.Name(aggregate.Value));
            writer.EndObject();
        }
        writer.EndObject();
    }
}
