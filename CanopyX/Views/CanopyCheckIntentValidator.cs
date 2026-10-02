using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

internal static class CanopyCheckIntentValidator {
    internal static void Validate(CanopyView view) {
        CanopyJsonNames.Checkboxes(view.Checkboxes);
        if (view.Checkboxes == CanopyCheckboxMode.None && view.CheckIntents.Count > 0)
            throw new InvalidOperationException("Checking intents require an enabled checkbox mode.");
        var paths = new HashSet<string>(StringComparer.Ordinal);
        foreach (var intent in view.CheckIntents) {
            if (intent == null) throw new InvalidOperationException("A checking intent cannot be null.");
            // Length prefixes keep paths unambiguous even when an id contains separators.
            var key = new System.Text.StringBuilder();
            foreach (var id in intent.Path) key.Append(id.Length).Append(':').Append(id);
            if (!paths.Add(key.ToString())) throw new InvalidOperationException("A checking path cannot have more than one intent.");
        }
    }
}
