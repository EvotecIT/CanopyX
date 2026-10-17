using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;

namespace CanopyX.Data;

/// <summary>A writer's answer for one row of a commit: saved (with optional canonical cells), error or conflict.</summary>
/// <remarks>
/// Messages are shown to the reader as they are: write them for people, and never put exception text, SQL or other
/// server internals in them.
/// </remarks>
public sealed class CanopyCommitRowResult {
    private CanopyCommitRowResult(string id, CanopyCommitStatus status, IDictionary<string, CanopyCell>? cells, string? error, IDictionary<string, string>? errors) {
        Id = id ?? throw new ArgumentNullException(nameof(id));
        Status = status;
        Cells = new ReadOnlyDictionary<string, CanopyCell>(cells == null ? new Dictionary<string, CanopyCell>(StringComparer.Ordinal) : new Dictionary<string, CanopyCell>(cells, StringComparer.Ordinal));
        Error = error;
        Errors = new ReadOnlyDictionary<string, string>(errors == null ? new Dictionary<string, string>(StringComparer.Ordinal) : new Dictionary<string, string>(errors, StringComparer.Ordinal));
    }

    /// <summary>A saved row.</summary>
    /// <param name="id">The row identity.</param>
    /// <param name="cells">Canonical cells by column identity that replace the shown ones (the stored values as the grid
    /// would read them), or null.</param>
    /// <returns>The result.</returns>
    public static CanopyCommitRowResult Saved(string id, IDictionary<string, CanopyCell>? cells = null) => new CanopyCommitRowResult(id, CanopyCommitStatus.Saved, cells, null, null);

    /// <summary>A row that was not saved because of its values or the store.</summary>
    /// <param name="id">The row identity.</param>
    /// <param name="error">A message for the row, or null.</param>
    /// <param name="errors">Messages by column identity, or null.</param>
    /// <returns>The result.</returns>
    public static CanopyCommitRowResult Failed(string id, string? error, IDictionary<string, string>? errors = null) => new CanopyCommitRowResult(id, CanopyCommitStatus.Error, null, error, errors);

    /// <summary>A row that was not saved because the stored record changed since the reader loaded it.</summary>
    /// <param name="id">The row identity.</param>
    /// <param name="error">A message for the row, or null for the grid's own conflict message.</param>
    /// <returns>The result.</returns>
    public static CanopyCommitRowResult Conflict(string id, string? error = null) => new CanopyCommitRowResult(id, CanopyCommitStatus.Conflict, null, error, null);

    /// <summary>Gets the row identity.</summary>
    public string Id { get; }

    /// <summary>Gets the outcome.</summary>
    public CanopyCommitStatus Status { get; }

    /// <summary>Gets the canonical cells of a saved row by column identity; empty for other rows.</summary>
    public IReadOnlyDictionary<string, CanopyCell> Cells { get; }

    /// <summary>Gets the row message, or null.</summary>
    public string? Error { get; }

    /// <summary>Gets messages by column identity; empty when none.</summary>
    public IReadOnlyDictionary<string, string> Errors { get; }
}
