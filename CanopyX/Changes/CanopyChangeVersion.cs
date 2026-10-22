using System;

namespace CanopyX;

/// <summary>One side of a change: the size, content hash and time of a file before or after it.</summary>
public sealed class CanopyChangeVersion {
    /// <summary>Gets or sets the size in bytes, from 0 to 2^53 − 1; null when unknown.</summary>
    public long? Size { get; set; }

    /// <summary>Gets or sets the content hash as text (for example lowercase SHA-256 hex), at most 256 characters; the list shows its start and copies it whole.</summary>
    public string? Hash { get; set; }

    /// <summary>Gets or sets the time of this version, such as the last write; null when unknown.</summary>
    public DateTimeOffset? Time { get; set; }
}