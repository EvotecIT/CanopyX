using System.Collections.Generic;

namespace CanopyX;

/// <summary>A validated, immutable proposal to change a grid's query, visible columns and optional pivot.</summary>
/// <remarks>Validation grants no data access or write authority. Hosts preview this proposal before a reader applies it.</remarks>
public sealed class CanopyViewIntent {
    private readonly string _json;

    internal CanopyViewIntent(string view, string json, string[]? columns) {
        View = view;
        _json = json;
        Columns = columns == null ? null : System.Array.AsReadOnly(columns);
    }

    /// <summary>The supported view-intent schema version, independent of the data protocol version.</summary>
    public const int Version = 1;

    /// <summary>Gets the target grid identity.</summary>
    public string View { get; }

    /// <summary>Gets the ordered visible column identities, or null to preserve the current columns.</summary>
    public IReadOnlyList<string>? Columns { get; }

    /// <summary>Returns the HTML-safe, versioned JSON snapshot accepted by the validator.</summary>
    /// <remarks>An omitted pivot preserves the current pivot; false clears it; a definition proposes its replacement.</remarks>
    /// <returns>The proposal, without source text, executable code, endpoints or authorization metadata.</returns>
    public string ToJson() => _json;
}
