using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX.Data;

/// <summary>Shared pieces of the flow's server answers.</summary>
internal static class CanopyFlowJson {
    internal static void Messages(CanopyJsonWriter writer, string name, IEnumerable<KeyValuePair<string, string>> messages) {
        var any = false;
        foreach (var entry in messages) {
            if (entry.Key == null || entry.Value == null) continue;
            if (!any) { writer.Name(name).BeginObject(); any = true; }
            writer.Property(entry.Key, entry.Value);
        }

        if (any) writer.EndObject();
    }

    internal static void Texts(CanopyJsonWriter writer, string name, IEnumerable<string> texts) {
        var list = new List<string>();
        foreach (var text in texts) if (text != null && CanopyFlowValues.HasVisibleText(text)) list.Add(text);
        if (list.Count > 0) writer.StringArray(name, list);
    }

    internal static string Tone(CanopyFlowTone tone) => tone switch {
        CanopyFlowTone.Info => "info",
        CanopyFlowTone.Success => "success",
        CanopyFlowTone.Warning => "warning",
        CanopyFlowTone.Danger => "danger",
        _ => string.Empty
    };
}