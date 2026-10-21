using System;
using CanopyX.Json;

namespace CanopyX;

public sealed partial class CanopyPropagation {
    private static readonly string[] StateNames = { "converged", "propagating", "fault", "unknown" };

    /// <summary>Writes the HTML-safe <c>propagation</c> document (<c>{ "protocol": "canopyx/2", "type": "propagation" }</c>, see docs/changes.md).</summary>
    /// <returns>The document.</returns>
    /// <exception cref="InvalidOperationException">The view is not valid.</exception>
    public string ToJson() {
        Validate();
        var writer = new CanopyJsonWriter(256 + Witnesses.Count * 160);
        writer.BeginObject().Envelope("propagation").Property("id", Id).Property("label", Label).Time("start", Start).Time("asOf", AsOf);
        if (State.HasValue) writer.Property("state", StateNames[(int)State.Value]);
        writer.OptionalProperty("summary", Summary).OptionalProperty("title", Title).OptionalProperty("groupCount", GroupCount);
        writer.Name("witnesses").BeginArray();
        foreach (var witness in Witnesses) {
            writer.BeginObject().Property("id", witness.Id).Property("label", witness.Label).OptionalProperty("secondary", witness.Secondary).Property("state", StateNames[(int)witness.State]);
            writer.Time("firstSeen", witness.FirstSeen).Time("lastSeen", witness.LastSeen).OptionalProperty("note", witness.Note);
            if (witness.Source) writer.Property("source", true);
            writer.OptionalProperty("group", witness.Group).EndObject();
        }

        writer.EndArray();
        CanopyChangeJson.TimeZone(writer, TimeZone);
        if (Labels != null && Labels.HasChangeLabels) { writer.Name("labels"); Labels.WriteChangeJson(writer); }
        return writer.EndObject().ToString();
    }

    /// <summary>Reads a propagation document.</summary>
    /// <param name="json">The document, as <see cref="ToJson"/> writes it.</param>
    /// <returns>The view.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="json"/> is null.</exception>
    /// <exception cref="FormatException">The text is not valid JSON, nests deeper than 64 levels or is longer than 4 MiB.</exception>
    /// <exception cref="InvalidOperationException">The document is not a valid propagation view: another type, an unknown property, or any rule <see cref="Validate"/> checks.</exception>
    public static CanopyPropagation FromJson(string json) {
        const string what = "The propagation document";
        var map = CanopyChangeJson.Envelope(CanopyJsonReader.Parse(json), what, "propagation",
            new[] { "id", "label", "start", "asOf", "state", "summary", "title", "groupCount", "witnesses", "timeZone", "labels" });
        CanopyPropagation view;
        try { view = new CanopyPropagation(CanopyFlowContract.RequiredText(map, "id", what), CanopyFlowContract.RequiredText(map, "label", what)); } catch (ArgumentException error) { throw new InvalidOperationException(error.Message, error); }
        view.Start = CanopyChangeJson.Time(map, "start", what);
        view.AsOf = CanopyChangeJson.Time(map, "asOf", what);
        var state = CanopyFlowContract.Text(map, "state", what);
        if (state != null) view.State = ReadState(state, what);
        view.Summary = CanopyFlowContract.Text(map, "summary", what);
        view.Title = CanopyFlowContract.Text(map, "title", what);
        view.GroupCount = CanopyFlowContract.Text(map, "groupCount", what);
        foreach (var node in CanopyFlowContract.Items(map, "witnesses", what, MaxWitnesses)) {
            var entry = CanopyFlowContract.Object(node, what + " (witness)", "id", "label", "secondary", "state", "firstSeen", "lastSeen", "note", "source", "group");
            CanopyPropagationWitness witness;
            try {
                witness = view.Witness(CanopyFlowContract.RequiredText(entry, "id", what), CanopyFlowContract.RequiredText(entry, "label", what), ReadState(CanopyFlowContract.RequiredText(entry, "state", what), what));
            } catch (ArgumentException error) { throw new InvalidOperationException(error.Message, error); }
            witness.Secondary = CanopyFlowContract.Text(entry, "secondary", what);
            witness.FirstSeen = CanopyChangeJson.Time(entry, "firstSeen", what);
            witness.LastSeen = CanopyChangeJson.Time(entry, "lastSeen", what);
            witness.Note = CanopyFlowContract.Text(entry, "note", what);
            witness.Source = CanopyFlowContract.Boolean(entry, "source", what) ?? false;
            witness.Group = CanopyFlowContract.Text(entry, "group", what);
        }

        view.TimeZone = CanopyChangeJson.ReadTimeZone(map, what);
        if (map.TryGetValue("labels", out var labels)) view.Labels = CanopyLabels.ReadChangeLabels(labels, what);
        view.Validate();
        return view;
    }

    private static CanopyPropagationState ReadState(string state, string what) {
        var index = Array.IndexOf(StateNames, state);
        return index >= 0 ? (CanopyPropagationState)index : throw new InvalidOperationException(what + " has the unknown state '" + state + "'.");
    }
}
