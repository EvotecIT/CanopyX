using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

/// <summary>Task planning on the calendar's resource timeline, with finish-to-start links and baseline comparison.</summary>
/// <remarks>Records supply actual dates through the calendar mappings. Critical-path analysis uses elapsed durations in the
/// loaded dependency network. Moving tasks emits proposals for the host; this view never changes or saves records.</remarks>
public sealed class CanopyPlan {
    /// <summary>Gets the finish-to-start edges, using grid row identities. Dependencies must form an acyclic graph.</summary>
    public IList<CanopyPlanDependency> Dependencies { get; } = new List<CanopyPlanDependency>();

    /// <summary>Gets or sets a date-time column for baseline starts. Set together with <see cref="BaselineEnd"/>.</summary>
    public string? BaselineStart { get; set; }

    /// <summary>Gets or sets a date-time column for baseline ends. Set together with <see cref="BaselineStart"/>.</summary>
    public string? BaselineEnd { get; set; }

    /// <summary>Gets or sets a text column containing booleans that mark milestones. Zero-duration calendar events are also milestones.</summary>
    public string? Milestone { get; set; }

    /// <summary>Gets or sets whether tasks on the elapsed-duration critical path are emphasized. Defaults to true.</summary>
    public bool CriticalPath { get; set; } = true;

    /// <summary>Gets or sets whether pointer and Alt+arrow movement can propose dates and resources to the host. Defaults to false.</summary>
    /// <remarks>Proposals are informational: the host applies its own authorization and persistence workflow.</remarks>
    public bool ProposeMoves { get; set; }

    /// <summary>Gets or sets whether proposals mark other tasks on the same resource as conflicts. Defaults to true.</summary>
    public bool AvoidOverlap { get; set; } = true;

    internal void Validate(CanopyDataGridView view) {
        var calendar = view.Calendar;
        if (calendar == null || calendar.End == null || calendar.Resource == null || calendar.Resources == null)
            throw new InvalidOperationException("A plan needs a calendar with end and resource columns and a resource tree.");
        if (calendar.Views.Count > 0 && !calendar.Views.Contains(CanopyCalendarView.Timeline))
            throw new InvalidOperationException("A plan's calendar must offer the timeline.");
        if (calendar.Recurrence != null || calendar.Sources.Count > 0)
            throw new InvalidOperationException("Plan tasks are ordinary grid records, without recurrence or calendar feeds.");
        if ((BaselineStart == null) != (BaselineEnd == null))
            throw new InvalidOperationException("A plan's baseline start and end columns are set together.");
        RequireColumn(view, BaselineStart, CanopyColumnKind.DateTime);
        RequireColumn(view, BaselineEnd, CanopyColumnKind.DateTime);
        RequireColumn(view, Milestone, CanopyColumnKind.Text);
        if (Dependencies.Count > 100000) throw new InvalidOperationException("A plan has at most 100,000 dependency edges.");
        var rows = new HashSet<string>(StringComparer.Ordinal);
        foreach (var row in view.Rows) rows.Add(row.Id);
        var next = new Dictionary<string, HashSet<string>>(StringComparer.Ordinal);
        var degree = new Dictionary<string, int>(StringComparer.Ordinal);
        foreach (var edge in Dependencies) {
            if (edge == null) throw new InvalidOperationException("A plan cannot have a null dependency.");
            if (edge.Lag < TimeSpan.Zero) throw new InvalidOperationException("A plan dependency has a nonnegative lag.");
            if (view.Source.Kind == CanopyGridSourceKind.Inline && (!rows.Contains(edge.Predecessor) || !rows.Contains(edge.Successor)))
                throw new InvalidOperationException("A plan dependency must name existing task rows.");
            if (!next.TryGetValue(edge.Predecessor, out var targets)) next.Add(edge.Predecessor, targets = new HashSet<string>(StringComparer.Ordinal));
            if (!targets.Add(edge.Successor)) throw new InvalidOperationException("A plan cannot repeat a dependency edge.");
            if (!degree.ContainsKey(edge.Predecessor)) degree.Add(edge.Predecessor, 0);
            degree.TryGetValue(edge.Successor, out var count);
            degree[edge.Successor] = count + 1;
        }
        var queue = new Queue<string>();
        foreach (var entry in degree) if (entry.Value == 0) queue.Enqueue(entry.Key);
        var visited = 0;
        while (queue.Count > 0) {
            var id = queue.Dequeue(); visited++;
            if (!next.TryGetValue(id, out var targets)) continue;
            foreach (var target in targets) if (--degree[target] == 0) queue.Enqueue(target);
        }
        if (visited != degree.Count) throw new InvalidOperationException("Plan dependencies cannot contain a cycle.");
    }

    private static void RequireColumn(CanopyDataGridView view, string? id, CanopyColumnKind kind) {
        if (id == null) return;
        foreach (var column in view.Columns) if (column.Id == id) {
            if (column.Kind != kind) throw new InvalidOperationException("Plan column '" + id + "' has the wrong kind.");
            return;
        }
        throw new InvalidOperationException("Unknown plan column: " + id);
    }

    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject().OptionalProperty("baselineStart", BaselineStart).OptionalProperty("baselineEnd", BaselineEnd).OptionalProperty("milestone", Milestone);
        if (!CriticalPath) writer.Property("criticalPath", false);
        if (ProposeMoves) writer.Property("proposeMoves", true);
        if (!AvoidOverlap) writer.Property("avoidOverlap", false);
        if (Dependencies.Count > 0) {
            writer.Name("dependencies").BeginArray();
            foreach (var edge in Dependencies) edge.WriteJson(writer);
            writer.EndArray();
        }
        writer.EndObject();
    }
}
