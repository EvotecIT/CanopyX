namespace CanopyX.Data;

/// <summary>How the queryable provider translates the protocol's case-insensitive text matching.</summary>
public enum CanopyTextComparison {
    /// <summary><see cref="Canonical"/> for in-memory queries (LINQ to objects), <see cref="Lowercase"/> for every other LINQ provider.</summary>
    Auto = 0,
    /// <summary>Compares the lowercased column (<c>ToLower()</c>, or <c>ToLowerInvariant()</c> in memory) with the invariantly lowercased operand. Translates to SQL <c>LOWER</c>; how far
    /// case folding reaches beyond ASCII depends on the database (SQLite folds ASCII only). Prevents plain index use.</summary>
    Lowercase,
    /// <summary>Compares the column as stored and leaves case to the database collation. Use with a case-insensitive
    /// collation (the SQL Server default, for example) to keep index seeks.</summary>
    Collation,
    /// <summary>Uses the protocol's exact folding (<see cref="CanopyTextFolding"/>) and ordinal text order. In-memory only:
    /// a database LINQ provider cannot translate it.</summary>
    Canonical
}
