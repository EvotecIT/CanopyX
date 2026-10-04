using System;

namespace CanopyX;

internal static class CanopyGridCursors {
    internal static void Validate(string? cursor, string name) {
        if (cursor != null && (cursor.Length == 0 || cursor.Length > 4096))
            throw new ArgumentException("A grid cursor is nonempty opaque text of at most 4,096 UTF-16 code units.", name);
        if (cursor != null) CanopyIdentifiers.Require(cursor, name);
    }
}
