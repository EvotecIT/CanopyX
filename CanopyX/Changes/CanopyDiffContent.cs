namespace CanopyX;

/// <summary>What a diff can show of a file's content.</summary>
public enum CanopyDiffContent {
    /// <summary>Text: the lines that changed, from hunks or from both texts.</summary>
    Text = 0,

    /// <summary>A binary file: no lines to compare; the host shows sizes, hashes and signers instead.</summary>
    Binary,

    /// <summary>The content is not available, for example withheld, too large or unreadable; the message says why.</summary>
    Unavailable,

    /// <summary>The text is the same on both sides; only metadata or line endings changed.</summary>
    Identical
}