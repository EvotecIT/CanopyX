using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

public sealed partial class CanopyChangeList {
    private static readonly string[] KindNames = { "added", "removed", "modified", "renamed" };
    private static readonly string[] IconNames = { "none", "copy", "diff", "check", "open", "download", "compare", "flag" };
    private static readonly string[] RevealNames = { "none", "details", "diff" };

    /// <summary>Writes the HTML-safe <c>changes</c> document (<c>{ "protocol": "canopyx/2", "type": "changes" }</c>, see docs/changes.md).</summary>
    /// <returns>The document.</returns>
    /// <exception cref="InvalidOperationException">The list is not valid.</exception>
    public string ToJson() {
        Validate();
        var writer = new CanopyJsonWriter(512 + Items.Count * 256);
        writer.BeginObject().Envelope("changes").Property("id", Id).Property("label", Label);
        WriteActions(writer, "actions", Actions);
        WriteActions(writer, "toolbar", Toolbar);
        WriteValues(writer, Values);
        if ((Exports & CanopyChangeExports.Csv) != 0 || (Exports & CanopyChangeExports.Json) != 0) {
            writer.Name("exports").BeginArray();
            if ((Exports & CanopyChangeExports.Csv) != 0) writer.String("csv");
            if ((Exports & CanopyChangeExports.Json) != 0) writer.String("json");
            writer.EndArray();
        }

        writer.Name("items").BeginArray();
        foreach (var item in Items) WriteItem(writer, item);
        writer.EndArray();
        if (!GroupByFolder) writer.Property("groupByFolder", false);
        if (FlaggedOnly) writer.Property("flaggedOnly", true);
        if (ExpandFlagged) writer.Property("expandFlagged", true);
        if (HashLength != 8) writer.Property("hashLength", HashLength);
        if (PageSize != 200) writer.Property("pageSize", PageSize);
        CanopyChangeJson.TimeZone(writer, TimeZone);
        if (Labels != null && Labels.HasChangeLabels) { writer.Name("labels"); Labels.WriteChangeJson(writer); }
        return writer.EndObject().ToString();
    }

    private static void WriteItem(CanopyJsonWriter writer, CanopyChangeItem item) {
        writer.BeginObject().Property("id", item.Id).Property("kind", KindNames[(int)item.Kind]).Property("path", item.Path).OptionalProperty("previousPath", item.PreviousPath);
        writer.OptionalProperty("kindLabel", item.KindLabel).OptionalProperty("secondary", item.Secondary);
        WriteVersion(writer, "before", item.Before);
        WriteVersion(writer, "after", item.After);
        if (item.Facts.Count > 0) {
            writer.Name("facts").BeginArray();
            foreach (var fact in item.Facts) writer.BeginObject().Property("label", fact.Label).OptionalProperty("before", fact.Before).OptionalProperty("after", fact.After).OptionalProperty("tone", fact.Tone.Name).OptionalProperty("note", fact.Note).EndObject();
            writer.EndArray();
        }

        if (item.Flags.Count > 0) {
            writer.Name("flags").BeginArray();
            foreach (var flag in item.Flags) writer.BeginObject().Property("id", flag.Id).Property("label", flag.Label).Property("reason", flag.Reason).OptionalProperty("tone", flag.Tone.Name).EndObject();
            writer.EndArray();
        }

        if (item.Diff != null) { writer.Name("diff").BeginObject(); item.Diff.WriteBody(writer); writer.EndObject(); }
        if (item.Actions.Count > 0) writer.StringArray("actions", item.Actions);
        WriteValues(writer, item.Values);
        writer.EndObject();
    }

    private static void WriteActions(CanopyJsonWriter writer, string name, IList<CanopyChangeAction> actions) {
        if (actions.Count == 0) return;
        writer.Name(name).BeginArray();
        foreach (var action in actions) {
            writer.BeginObject().Property("id", action.Id).Property("label", action.Label);
            if (action.Icon != CanopyChangeActionIcon.None) writer.Property("icon", IconNames[(int)action.Icon]);
            writer.OptionalProperty("copy", action.Copy).OptionalProperty("link", action.Link);
            if (action.Reveal != CanopyChangeReveal.None) writer.Property("reveal", RevealNames[(int)action.Reveal]);
            if (action.Reason) writer.Property("reason", true);
            writer.EndObject();
        }

        writer.EndArray();
    }

    private static void WriteValues(CanopyJsonWriter writer, IDictionary<string, string> values) {
        if (values.Count == 0) return;
        var keys = new List<string>(values.Keys);
        keys.Sort(StringComparer.Ordinal);
        writer.Name("values").BeginObject();
        foreach (var key in keys) writer.Property(key, values[key]);
        writer.EndObject();
    }

    private static void WriteVersion(CanopyJsonWriter writer, string name, CanopyChangeVersion? version) {
        if (version == null) return;
        writer.Name(name).BeginObject();
        if (version.Size.HasValue) writer.Property("size", version.Size.Value);
        writer.OptionalProperty("hash", version.Hash).Time("time", version.Time).EndObject();
    }

    /// <summary>Reads a change list document.</summary>
    /// <param name="json">The document, as <see cref="ToJson"/> writes it.</param>
    /// <returns>The list.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="json"/> is null.</exception>
    /// <exception cref="FormatException">The text is not valid JSON, nests deeper than 64 levels or is longer than 4 MiB.</exception>
    /// <exception cref="InvalidOperationException">The document is not a valid change list: another type, an unknown property, or any rule <see cref="Validate"/> checks.</exception>
    public static CanopyChangeList FromJson(string json) {
        const string what = "The change list document";
        var map = CanopyChangeJson.Envelope(CanopyJsonReader.Parse(json), what, "changes",
            new[] { "id", "label", "actions", "toolbar", "values", "exports", "items", "groupByFolder", "flaggedOnly", "expandFlagged", "hashLength", "pageSize", "timeZone", "labels" });
        CanopyChangeList list;
        try { list = new CanopyChangeList(CanopyFlowContract.RequiredText(map, "id", what), CanopyFlowContract.RequiredText(map, "label", what)); } catch (ArgumentException error) { throw new InvalidOperationException(error.Message, error); }
        try {
            foreach (var node in CanopyFlowContract.Items(map, "actions", what, 8)) list.Actions.Add(ReadAction(node, what));
            foreach (var node in CanopyFlowContract.Items(map, "toolbar", what, 8)) list.Toolbar.Add(ReadAction(node, what));
            ReadValues(map, list.Values, what);
            foreach (var node in CanopyFlowContract.Items(map, "exports", what, 2)) {
                var export = node as string == "csv" ? CanopyChangeExports.Csv : node as string == "json" ? CanopyChangeExports.Json : throw new InvalidOperationException(what + " exports csv or json.");
                if ((list.Exports & export) != 0) throw new InvalidOperationException(what + " lists an export twice.");
                list.Exports |= export;
            }

            foreach (var node in CanopyFlowContract.Items(map, "items", what, MaxItems)) list.Items.Add(ReadItem(node, what));
        } catch (ArgumentException error) {
            throw new InvalidOperationException(error.Message, error);
        }

        list.GroupByFolder = CanopyFlowContract.Boolean(map, "groupByFolder", what) ?? true;
        list.FlaggedOnly = CanopyFlowContract.Boolean(map, "flaggedOnly", what) ?? false;
        list.ExpandFlagged = CanopyFlowContract.Boolean(map, "expandFlagged", what) ?? false;
        list.HashLength = CanopyFlowContract.Integer(map, "hashLength", what) ?? 8;
        list.PageSize = CanopyFlowContract.Integer(map, "pageSize", what) ?? 200;
        list.TimeZone = CanopyChangeJson.ReadTimeZone(map, what);
        if (map.TryGetValue("labels", out var labels)) list.Labels = CanopyLabels.ReadChangeLabels(labels, what);
        list.Validate();
        return list;
    }

    private static CanopyChangeItem ReadItem(object? node, string what) {
        var entry = CanopyFlowContract.Object(node, what + " (item)", "id", "kind", "path", "previousPath", "kindLabel", "secondary", "before", "after", "facts", "flags", "diff", "actions", "values");
        var item = new CanopyChangeItem(CanopyFlowContract.RequiredText(entry, "id", what), (CanopyChangeKind)Pick(KindNames, CanopyFlowContract.RequiredText(entry, "kind", what), what, "kind"),
            CanopyFlowContract.RequiredText(entry, "path", what)) {
            PreviousPath = CanopyFlowContract.Text(entry, "previousPath", what),
            KindLabel = CanopyFlowContract.Text(entry, "kindLabel", what),
            Secondary = CanopyFlowContract.Text(entry, "secondary", what),
            Before = ReadVersion(entry, "before", what),
            After = ReadVersion(entry, "after", what)
        };
        foreach (var fact in CanopyFlowContract.Items(entry, "facts", what, 32)) {
            var map = CanopyFlowContract.Object(fact, what + " (fact)", "label", "before", "after", "tone", "note");
            item.Facts.Add(new CanopyChangeFact(CanopyFlowContract.RequiredText(map, "label", what)) {
                Before = CanopyFlowContract.Text(map, "before", what), After = CanopyFlowContract.Text(map, "after", what), Tone = CanopyChangeJson.Tone(map, what),
                Note = CanopyFlowContract.Text(map, "note", what)
            });
        }

        foreach (var flag in CanopyFlowContract.Items(entry, "flags", what, 16)) {
            var map = CanopyFlowContract.Object(flag, what + " (flag)", "id", "label", "reason", "tone");
            item.Flags.Add(new CanopyChangeFlag(CanopyFlowContract.RequiredText(map, "id", what), CanopyFlowContract.RequiredText(map, "label", what),
                CanopyFlowContract.RequiredText(map, "reason", what), CanopyChangeJson.Tone(map, what)));
        }

        if (entry.TryGetValue("diff", out var diff)) item.Diff = CanopyTextDiff.ReadBody(CanopyFlowContract.Object(diff, what + " (diff)", CanopyTextDiff.BodyNames), what);
        foreach (var action in CanopyFlowContract.Items(entry, "actions", what, 8)) item.Actions.Add(action as string ?? throw new InvalidOperationException(what + " lists an action that is not text."));
        ReadValues(entry, item.Values, what);
        return item;
    }

    private static CanopyChangeAction ReadAction(object? node, string what) {
        var entry = CanopyFlowContract.Object(node, what + " (action)", "id", "label", "icon", "copy", "link", "reveal", "reason");
        var action = new CanopyChangeAction(CanopyFlowContract.RequiredText(entry, "id", what), CanopyFlowContract.RequiredText(entry, "label", what)) {
            Copy = CanopyFlowContract.Text(entry, "copy", what), Link = CanopyFlowContract.Text(entry, "link", what), Reason = CanopyFlowContract.Boolean(entry, "reason", what) ?? false
        };
        var icon = CanopyFlowContract.Text(entry, "icon", what);
        if (icon != null) action.Icon = (CanopyChangeActionIcon)Pick(IconNames, icon, what, "icon");
        var reveal = CanopyFlowContract.Text(entry, "reveal", what);
        if (reveal != null) action.Reveal = (CanopyChangeReveal)Pick(RevealNames, reveal, what, "reveal");
        return action;
    }

    private static void ReadValues(Dictionary<string, object?> entry, IDictionary<string, string> target, string what) {
        if (!entry.TryGetValue("values", out var values)) return;
        if (!(values is Dictionary<string, object?> valueMap)) throw new InvalidOperationException(what + " needs an object in 'values'.");
        foreach (var value in valueMap) target[value.Key] = value.Value as string ?? throw new InvalidOperationException(what + " needs text for the value '" + value.Key + "'.");
    }

    private static CanopyChangeVersion? ReadVersion(Dictionary<string, object?> entry, string name, string what) {
        if (!entry.TryGetValue(name, out var node)) return null;
        var map = CanopyFlowContract.Object(node, what + " (" + name + ")", "size", "hash", "time");
        long? size = null;
        if (map.TryGetValue("size", out var raw)) size = raw is long whole ? whole : throw new InvalidOperationException(what + " needs a whole number of bytes in 'size'.");
        return new CanopyChangeVersion { Size = size, Hash = CanopyFlowContract.Text(map, "hash", what), Time = CanopyChangeJson.Time(map, "time", what) };
    }

    private static int Pick(string[] names, string value, string what, string property) {
        var index = Array.IndexOf(names, value);
        return index >= 0 ? index : throw new InvalidOperationException(what + " has an unknown value in '" + property + "'.");
    }
}
