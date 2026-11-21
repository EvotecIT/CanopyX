using System;

namespace CanopyX;

/// <summary>
/// How a <see cref="Tone"/> travels in the <c>canopyx/2</c> protocol: <see cref="Tone.None"/> is absent, and a host tone is a
/// lowercase letter followed by lowercase letters, digits and hyphens, at most 32 characters, not ending in <c>-bg</c> (the
/// theme's name for a tone's badge background). The shared <see cref="Tone"/> accepts a wider set of names, so a view checks
/// its tones when it is written.
/// </summary>
internal static class ToneNames {
    internal const int MaxLength = 32;

    /// <summary>The tone's wire name, or null for <see cref="Tone.None"/>.</summary>
    /// <exception cref="InvalidOperationException">The tone's name is not one the protocol carries.</exception>
    internal static string? WireName(this Tone tone) {
        if (tone == Tone.None) return null;
        var name = tone.Name;
        if (!IsValid(name)) throw new InvalidOperationException("Tone '" + name + "' is not a CanopyX tone name: a lowercase letter followed by lowercase letters, digits and hyphens, at most " + MaxLength + " characters, not ending in -bg.");
        return name;
    }

    /// <summary>The tone a document names, refused when the protocol cannot carry the name, so a document that reads also writes.</summary>
    /// <exception cref="InvalidOperationException">The name is not a CanopyX tone name.</exception>
    internal static Tone FromWire(string name) {
        Tone tone;
        try { tone = Tone.Named(name); } catch (ArgumentException error) { throw new InvalidOperationException("Tone '" + name + "' is not a CanopyX tone name.", error); }
        tone.WireName();
        return tone;
    }

    /// <summary>Whether a tone carries a name, as opposed to <see cref="Tone.None"/>.</summary>
    internal static bool IsSet(this Tone tone) => tone != Tone.None;

    /// <summary>Whether CanopyX ships colours for the tone.</summary>
    internal static bool IsBuiltIn(this Tone tone) => tone != Tone.None && !tone.IsNamed;

    private static bool IsValid(string name) {
        if (name.Length == 0 || name.Length > MaxLength || name[0] < 'a' || name[0] > 'z' || name.EndsWith("-bg", StringComparison.Ordinal)) return false;
        foreach (var ch in name) {
            if (!(ch >= 'a' && ch <= 'z' || ch >= '0' && ch <= '9' || ch == '-')) return false;
        }
        return true;
    }
}
