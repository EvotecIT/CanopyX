using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX.Data;

/// <summary>A task's state on a task-list flow as the host sees it (the <c>status</c> hook's answer holds one per step id).</summary>
public sealed class CanopyFlowStepStatus {
    /// <summary>Creates a state.</summary>
    /// <param name="state">The state.</param>
    /// <param name="summary">A line under the task, such as what is set up, or null.</param>
    public CanopyFlowStepStatus(CanopyFlowTaskState state, string? summary = null) {
        State = state;
        Summary = CanopyFlowText.Optional(summary, nameof(summary));
    }

    /// <summary>Gets the state.</summary>
    public CanopyFlowTaskState State { get; }

    /// <summary>Gets the line under the task, or null (at most 400 characters show).</summary>
    public string? Summary { get; }

    /// <summary>Gets why a blocked task cannot start (at most 10 show).</summary>
    public IList<string> Blockers { get; } = new List<string>();

    /// <summary>Adds a blocker.</summary>
    /// <param name="text">Why the task cannot start.</param>
    /// <returns>The state.</returns>
    public CanopyFlowStepStatus Blocker(string text) { Blockers.Add(CanopyFlowText.Require(text, nameof(text))); return this; }

    /// <summary>Writes the states of several steps as the <c>status</c> hook answers them: an object of states by step id.</summary>
    /// <param name="states">The states by step id.</param>
    /// <returns>Compact JSON.</returns>
    public static string ToJson(IEnumerable<KeyValuePair<string, CanopyFlowStepStatus>> states) {
        var writer = new CanopyJsonWriter(256);
        writer.BeginObject();
        foreach (var entry in states ?? new KeyValuePair<string, CanopyFlowStepStatus>[0]) {
            if (entry.Key == null || entry.Value == null) continue;
            var status = entry.Value;
            writer.Name(entry.Key).BeginObject().Property("state", status.State switch {
                CanopyFlowTaskState.Complete => "complete",
                CanopyFlowTaskState.NeedsAction => "needsAction",
                CanopyFlowTaskState.Blocked => "blocked",
                _ => "notStarted"
            }).OptionalProperty("summary", status.Summary);
            CanopyFlowJson.Texts(writer, "blockers", status.Blockers);
            writer.EndObject();
        }

        return writer.EndObject().ToString();
    }
}