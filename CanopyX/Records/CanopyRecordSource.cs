using System;
using CanopyX.Json;

namespace CanopyX;

/// <summary>Where a record's details load from when its drawer opens, so large views need not embed every detail of every row.</summary>
/// <remarks>
/// <list type="bullet">
/// <item><see cref="Inline"/>: rows carry their record fields (<see cref="CanopyGridRow.Fields"/>); nothing loads.</item>
/// <item><see cref="Host"/>: the browser host's <c>loadRecord(request, { signal })</c> option, or a hosted grid source's
/// <c>record(request, { signal })</c>, answers each <c>gridRecordQuery</c> with a <see cref="CanopyGridRecord"/>.</item>
/// <item><see cref="Sidecar"/>: record packs written by <see cref="CanopyRecordSidecar"/> beside the page, loadable from <c>file://</c>.</item>
/// </list>
/// A browser host's <c>loadRecord</c> option is used whatever the declared source.
/// </remarks>
public sealed class CanopyRecordSource {
    private CanopyRecordSource(CanopyRecordSourceKind kind, string? baseUrl, int shards) {
        Kind = kind;
        Base = baseUrl;
        Shards = shards;
    }

    /// <summary>Gets where the details come from.</summary>
    public CanopyRecordSourceKind Kind { get; }

    /// <summary>Gets the folder of a sidecar's record packs, relative to the page (for example <c>records/</c>), or null.</summary>
    public string? Base { get; }

    /// <summary>Gets the number of record packs a sidecar spreads its records over; zero for other sources.</summary>
    public int Shards { get; }

    /// <summary>Rows carry their own record fields.</summary>
    /// <returns>The source.</returns>
    public static CanopyRecordSource Inline() => new CanopyRecordSource(CanopyRecordSourceKind.Inline, null, 0);

    /// <summary>The browser host loads each record (the <c>loadRecord</c> option, or a hosted grid source's <c>record</c> hook).</summary>
    /// <returns>The source.</returns>
    public static CanopyRecordSource Host() => new CanopyRecordSource(CanopyRecordSourceKind.Host, null, 0);

    /// <summary>Record packs beside the page: <c>&lt;base&gt;r&lt;n&gt;.js</c>, one per shard, each a script that registers its records.</summary>
    /// <param name="baseUrl">The unescaped local folder of the packs relative to the page, ending with <c>/</c>, for example
    /// <c>records/</c>. Spaces inside the path and Unicode are supported; an initial ASCII space, URL delimiters,
    /// percent escapes and control characters are not.</param>
    /// <param name="shards">The number of packs, 1 to 65,536. About 200 records per pack keeps each pack small.</param>
    /// <returns>The source.</returns>
    /// <exception cref="ArgumentException">The folder is empty, absolute (a leading <c>/</c> or a scheme), holds a backslash,
    /// dot segment, query/fragment delimiter, percent sign or control character, starts with an ASCII space,
    /// or does not end with <c>/</c>.</exception>
    /// <exception cref="ArgumentOutOfRangeException">The shard count is outside 1 to 65,536.</exception>
    public static CanopyRecordSource Sidecar(string baseUrl, int shards) {
        if (string.IsNullOrEmpty(baseUrl) || !baseUrl.EndsWith("/", StringComparison.Ordinal) || baseUrl.StartsWith("/", StringComparison.Ordinal) || baseUrl[0] == ' ' || baseUrl.Length > 1024 ||
            baseUrl.IndexOf(':') >= 0 || baseUrl.IndexOf('\\') >= 0 || baseUrl.IndexOfAny(new[] { '?', '#', '%' }) >= 0 || baseUrl.IndexOf("//", StringComparison.Ordinal) >= 0 ||
            Array.Exists(baseUrl.ToCharArray(), char.IsControl) || Array.Exists(baseUrl.Split('/'), part => part == "." || part == ".."))
            throw new ArgumentException("A sidecar folder is an unescaped relative local path ending with '/', without a leading '/' or ASCII space, backslashes, dot segments, URL delimiters, percent signs or control characters.", nameof(baseUrl));
        if (shards < 1 || shards > 65536) throw new ArgumentOutOfRangeException(nameof(shards), shards, "A sidecar has 1 to 65,536 record packs.");
        return new CanopyRecordSource(CanopyRecordSourceKind.Sidecar, baseUrl, shards);
    }

    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject().Property("kind", Kind == CanopyRecordSourceKind.Sidecar ? "sidecar" : Kind == CanopyRecordSourceKind.Host ? "host" : "inline");
        if (Kind == CanopyRecordSourceKind.Sidecar) writer.Property("base", Base).Property("shards", Shards);
        writer.EndObject();
    }
}
