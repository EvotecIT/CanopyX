using System;
using System.Collections.Generic;
using System.Text;
using CanopyX.Json;

namespace CanopyX;

public sealed partial class CanopyTextDiff {
    /// <summary>
    /// Writes the HTML-safe <c>diff</c> document (<c>{ "protocol": "canopyx/2", "type": "diff" }</c>, see docs/changes.md). Each hunk
    /// carries its start on both sides and its lines as strings that begin with <c>" "</c>, <c>"-"</c> or <c>"+"</c>, as a unified diff writes them.
    /// </summary>
    /// <returns>The document.</returns>
    /// <exception cref="InvalidOperationException">The diff is not valid.</exception>
    public string ToJson() {
        Validate();
        var size = 256 + (BeforeText?.Length ?? 0) + (AfterText?.Length ?? 0) + (UnifiedDiff?.Length ?? 0);
        foreach (var hunk in Hunks) foreach (var line in hunk.Lines) size += line.Text.Length + 4;
        var writer = new CanopyJsonWriter(size);
        writer.BeginObject().Envelope("diff");
        WriteBody(writer);
        return writer.EndObject().ToString();
    }

    /// <summary>Writes the document's properties after its envelope; a change list writes an item's diff the same way.</summary>
    internal void WriteBody(CanopyJsonWriter writer) {
        writer.Property("id", Id).Property("label", Label).OptionalProperty("path", Path).OptionalProperty("previousPath", PreviousPath);
        if (Content != CanopyDiffContent.Text) writer.Property("content", Content == CanopyDiffContent.Binary ? "binary" : Content == CanopyDiffContent.Unavailable ? "unavailable" : "identical");
        writer.OptionalProperty("message", Message).OptionalProperty("beforeTitle", BeforeTitle).OptionalProperty("afterTitle", AfterTitle);
        writer.OptionalProperty("before", BeforeText).OptionalProperty("after", AfterText);
        if (Hunks.Count > 0) {
            writer.Name("hunks").BeginArray();
            var text = new StringBuilder();
            foreach (var hunk in Hunks) {
                writer.BeginObject().Property("before", hunk.BeforeStart).Property("after", hunk.AfterStart).Name("lines").BeginArray();
                foreach (var line in hunk.Lines) {
                    text.Clear().Append(line.Kind == CanopyDiffLineKind.Added ? '+' : line.Kind == CanopyDiffLineKind.Removed ? '-' : ' ').Append(line.Text);
                    writer.String(text.ToString());
                }

                writer.EndArray().EndObject();
            }

            writer.EndArray();
        }

        if (Context != 3) writer.Property("context", Context);
        if (Layout != CanopyDiffLayout.Auto) writer.Property("layout", Layout == CanopyDiffLayout.Inline ? "inline" : "split");
        if (Notes.Count > 0) {
            writer.Name("notes").BeginArray();
            foreach (var note in Notes) writer.BeginObject().Property("text", note.Text).OptionalProperty("tone", note.Tone.Name).EndObject();
            writer.EndArray();
        }

        if (Truncated) writer.Property("truncated", true);
        writer.OptionalProperty("unified", UnifiedDiff);
        if (Labels != null && Labels.HasChangeLabels) { writer.Name("labels"); Labels.WriteChangeJson(writer); }
    }

    /// <summary>Reads a diff document.</summary>
    /// <param name="json">The document, as <see cref="ToJson"/> writes it.</param>
    /// <returns>The diff, its lines numbered from their hunks.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="json"/> is null.</exception>
    /// <exception cref="FormatException">The text is not valid JSON, nests deeper than 64 levels or is longer than 4 MiB.</exception>
    /// <exception cref="InvalidOperationException">The document is not a valid diff: another type, an unknown property, or any rule <see cref="Validate"/> checks.</exception>
    public static CanopyTextDiff FromJson(string json) {
        const string what = "The diff document";
        var map = CanopyChangeJson.Envelope(CanopyJsonReader.Parse(json), what, "diff", BodyNames);
        var diff = ReadBody(map, what);
        diff.Validate();
        return diff;
    }

    /// <summary>The properties of a diff besides its envelope.</summary>
    internal static readonly string[] BodyNames = { "id", "label", "path", "previousPath", "content", "message", "beforeTitle", "afterTitle", "before", "after", "hunks", "context", "layout",
        "notes", "truncated", "unified", "labels" };

    /// <summary>Reads a diff's properties; the caller checks the envelope and validates.</summary>
    internal static CanopyTextDiff ReadBody(Dictionary<string, object?> map, string what) {
        CanopyTextDiff diff;
        try { diff = new CanopyTextDiff(CanopyFlowContract.RequiredText(map, "id", what), CanopyFlowContract.RequiredText(map, "label", what)); } catch (ArgumentException error) { throw new InvalidOperationException(error.Message, error); }
        diff.Path = CanopyFlowContract.Text(map, "path", what);
        diff.PreviousPath = CanopyFlowContract.Text(map, "previousPath", what);
        var content = CanopyFlowContract.Text(map, "content", what);
        if (content != null) diff.Content = CanopyFlowContract.Choose(content, what, "content", ("binary", CanopyDiffContent.Binary), ("unavailable", CanopyDiffContent.Unavailable), ("identical", CanopyDiffContent.Identical));
        diff.Message = CanopyFlowContract.Text(map, "message", what);
        diff.BeforeTitle = CanopyFlowContract.Text(map, "beforeTitle", what);
        diff.AfterTitle = CanopyFlowContract.Text(map, "afterTitle", what);
        diff.BeforeText = CanopyFlowContract.Text(map, "before", what);
        diff.AfterText = CanopyFlowContract.Text(map, "after", what);
        foreach (var node in CanopyFlowContract.Items(map, "hunks", what, MaxLines)) {
            var entry = CanopyFlowContract.Object(node, what + " (hunk)", "before", "after", "lines");
            var hunk = new CanopyDiffHunk(CanopyFlowContract.Integer(entry, "before", what) ?? throw new InvalidOperationException(what + " needs 'before' in each hunk."),
                CanopyFlowContract.Integer(entry, "after", what) ?? throw new InvalidOperationException(what + " needs 'after' in each hunk."));
            foreach (var line in CanopyFlowContract.Items(entry, "lines", what, MaxLines)) {
                if (!(line is string text) || text.Length == 0 || text[0] != ' ' && text[0] != '-' && text[0] != '+') throw new InvalidOperationException(what + " has a line that does not start with \" \", \"-\" or \"+\".");
                hunk.Lines.Add(new CanopyDiffLine(text[0] == '+' ? CanopyDiffLineKind.Added : text[0] == '-' ? CanopyDiffLineKind.Removed : CanopyDiffLineKind.Context, text.Substring(1)));
            }

            diff.Hunks.Add(hunk);
        }

        diff.Context = CanopyFlowContract.Integer(map, "context", what) ?? 3;
        var layout = CanopyFlowContract.Text(map, "layout", what);
        if (layout != null) diff.Layout = CanopyFlowContract.Choose(layout, what, "layout", ("inline", CanopyDiffLayout.Inline), ("split", CanopyDiffLayout.Split));
        foreach (var node in CanopyFlowContract.Items(map, "notes", what, 16)) {
            var note = CanopyFlowContract.Object(node, what + " (note)", "text", "tone");
            diff.Notes.Add(new CanopyChangeNote(CanopyFlowContract.RequiredText(note, "text", what), CanopyChangeJson.Tone(note, what)));
        }

        diff.Truncated = CanopyFlowContract.Boolean(map, "truncated", what) ?? false;
        diff.UnifiedDiff = CanopyFlowContract.Text(map, "unified", what);
        if (map.TryGetValue("labels", out var labels)) diff.Labels = CanopyLabels.ReadChangeLabels(labels, what);
        diff.Number();
        return diff;
    }
}
