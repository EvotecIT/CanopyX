using System;

namespace CanopyX;

/// <summary>Validates identifiers and references that travel through URI encoding.</summary>
internal static class CanopyIdentifiers {
    internal static void Require(string? value, string parameter, bool allowNull = false) {
        if (value == null && allowNull) return;
        if (string.IsNullOrEmpty(value)) throw new ArgumentException("Identifiers and references must be nonempty.", parameter);
        for (var index = 0; index < value!.Length; index++) {
            var ch = value[index];
            if (char.IsHighSurrogate(ch)) {
                if (++index < value.Length && char.IsLowSurrogate(value[index])) continue;
            } else if (!char.IsLowSurrogate(ch)) continue;
            throw new ArgumentException("Identifiers and references must contain well-formed Unicode without unpaired surrogates.", parameter);
        }
    }
}
