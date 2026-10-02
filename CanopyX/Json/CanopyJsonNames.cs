using System;

namespace CanopyX.Json;

/// <summary>
/// Maps CanopyX enums to their <c>canopyx/2</c> wire names. Keep in step with <c>docs/schema/canopyx-2.schema.json</c>.
/// </summary>
internal static class CanopyJsonNames {

    internal static string ColumnKind(CanopyColumnKind kind) => kind switch {
        CanopyColumnKind.Text => "text",
        CanopyColumnKind.Number => "number",
        CanopyColumnKind.DateTime => "datetime",
        _ => throw new ArgumentOutOfRangeException(nameof(kind), kind, "Unknown column kind.")
    };

    /// <summary>The wire name of a time zone; null for UTC, which is what a view without the field means.</summary>
    internal static string? TimeZone(CanopyTimeZone zone) => zone switch {
        CanopyTimeZone.Utc => null,
        CanopyTimeZone.Local => "local",
        _ => throw new ArgumentOutOfRangeException(nameof(zone), zone, "Unknown time zone.")
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
