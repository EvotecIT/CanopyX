using System;
using System.Collections.Generic;

namespace CanopyX;

/// <summary>The loaded task network for a script-free fallback. Uses the same elapsed-duration critical-path rule as the browser.</summary>
internal sealed class CanopyPlanAnalysis {
    internal sealed class Task {
        internal CanopyGridRow Row = null!;
        internal DateTimeOffset Start, End;
        internal bool Milestone, Critical;
        internal double Early, Late;
        internal int Degree;
        internal readonly List<Edge> Before = new List<Edge>();
        internal readonly List<Edge> After = new List<Edge>();
        internal double Duration => (End - Start).TotalMilliseconds;
    }

    internal sealed class Edge {
        internal Task From = null!, To = null!;
        internal double Lag;
        internal bool Conflict => (To.Start - From.End).TotalMilliseconds < Lag;
    }

    internal readonly Dictionary<string, Task> Tasks = new Dictionary<string, Task>(StringComparer.Ordinal);
    internal bool Complete;

    internal static CanopyPlanAnalysis Build(CanopyDataGridView view, IEnumerable<CanopyGridRow> rows, bool complete) {
        var result = new CanopyPlanAnalysis { Complete = complete };
        var plan = view.Plan!;
        foreach (var row in rows) {
            if (string.Equals(Value(row, view.Calendar!.Display) as string, "background", StringComparison.OrdinalIgnoreCase)) continue;
            var start = Instant(row, view.Calendar!.Start);
            if (!start.HasValue) { result.Complete = false; continue; }
            var end = Instant(row, view.Calendar.End) ?? start.Value;
            var allDay = Value(row, view.Calendar.AllDay) is true || string.Equals(Value(row, view.Calendar.AllDay) as string, "true", StringComparison.Ordinal);
            if (allDay) {
                start = new DateTimeOffset(start.Value.UtcDateTime.Date, TimeSpan.Zero);
                var endDate = end.UtcDateTime;
                end = new DateTimeOffset(endDate.Date, TimeSpan.Zero);
                // Midnight is exclusive; an end during a day includes that whole day, as in the calendar.
                if (endDate.TimeOfDay != TimeSpan.Zero) end = end.AddDays(1);
                if (end <= start.Value) end = start.Value.AddDays(1);
            }
            var milestone = end <= start.Value || Value(row, plan.Milestone) is true || string.Equals(Value(row, plan.Milestone) as string, "true", StringComparison.Ordinal);
            result.Tasks[row.Id] = new Task { Row = row, Start = start.Value, End = milestone ? start.Value : end, Milestone = milestone };
        }
        foreach (var edge in plan.Dependencies) {
            if (!result.Tasks.TryGetValue(edge.Predecessor, out var from) || !result.Tasks.TryGetValue(edge.Successor, out var to)) { result.Complete = false; continue; }
            var item = new Edge { From = from, To = to, Lag = edge.Lag.TotalMilliseconds };
            from.After.Add(item); to.Before.Add(item); to.Degree++;
        }
        var queue = new List<Task>();
        foreach (var task in result.Tasks.Values) if (task.Degree == 0) queue.Add(task);
        var finish = 0d;
        for (var i = 0; i < queue.Count; i++) {
            var task = queue[i]; finish = Math.Max(finish, task.Early + task.Duration);
            foreach (var edge in task.After) {
                edge.To.Early = Math.Max(edge.To.Early, task.Early + task.Duration + edge.Lag);
                if (--edge.To.Degree == 0) queue.Add(edge.To);
            }
        }
        if (queue.Count != result.Tasks.Count) result.Complete = false;
        if (result.Complete) for (var i = queue.Count - 1; i >= 0; i--) {
            var task = queue[i]; task.Late = finish - task.Duration;
            if (task.After.Count > 0) {
                task.Late = double.PositiveInfinity;
                foreach (var edge in task.After) task.Late = Math.Min(task.Late, edge.To.Late - edge.Lag - task.Duration);
            }
            task.Critical = Math.Abs(task.Late - task.Early) < 1;
        }
        return result;
    }

    internal static object? Value(CanopyGridRow row, string? column) => column != null && row.Cells.TryGetValue(column, out var cell) ? cell?.Value : null;

    internal static DateTimeOffset? Instant(CanopyGridRow row, string? column) =>
        Value(row, column) is DateTime date ? new DateTimeOffset(date) : (DateTimeOffset?)null;
}
