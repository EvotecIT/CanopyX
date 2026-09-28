using System;

namespace CanopyX.Json;

/// <summary>
/// Maps CanopyX enums to their <c>canopyx/1</c> wire names. Keep in step with <c>docs/schema/canopyx-1.schema.json</c>.
/// </summary>
internal static class CanopyJsonNames {
    internal static string? Tone(CanopyTone tone) => tone switch {
        CanopyTone.None => null,
        CanopyTone.Neutral => "neutral",
        CanopyTone.Info => "info",
        CanopyTone.Success => "success",
        CanopyTone.Warning => "warning",
        CanopyTone.Danger => "danger",
        CanopyTone.Muted => "muted",
        _ => throw new ArgumentOutOfRangeException(nameof(tone), tone, "Unknown tone.")
    };

    internal static string ColumnKind(CanopyColumnKind kind) => kind switch {
        CanopyColumnKind.Text => "text",
        CanopyColumnKind.Number => "number",
        CanopyColumnKind.DateTime => "datetime",
        _ => throw new ArgumentOutOfRangeException(nameof(kind), kind, "Unknown column kind.")
    };

    internal static string Selection(CanopySelectionMode mode) => mode switch {
        CanopySelectionMode.Single => "single",
        CanopySelectionMode.Multiple => "multiple",
        _ => throw new ArgumentOutOfRangeException(nameof(mode), mode, "Unknown selection mode.")
    };

    internal static string SourceKind(CanopySourceKind kind) => kind switch {
        CanopySourceKind.Inline => "inline",
        CanopySourceKind.Sidecar => "sidecar",
        CanopySourceKind.Remote => "remote",
        _ => throw new ArgumentOutOfRangeException(nameof(kind), kind, "Unknown source kind.")
    };
}
