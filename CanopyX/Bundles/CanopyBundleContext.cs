using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using CanopyX.Json;

namespace CanopyX.Bundles;

/// <summary>
/// The state of one bundle write, shared by the page writer and the search index writer: where files go, the file
/// budget, and the running totals. Every sidecar file is written through one of the <c>WriteFile</c> overloads.
/// </summary>
internal sealed class CanopyBundleContext {
    internal static readonly UTF8Encoding Utf8 = new UTF8Encoding(false);

    /// <summary>The folders this write has created, so each is created once and not once per file.</summary>
    private readonly HashSet<string> _directories = new HashSet<string>(StringComparer.Ordinal);

    /// <summary>The buffer every file of this write is encoded into.</summary>
    private byte[]? _encoded;

    internal CanopyBundleContext(CanopyView view, CanopyBundleOptions options, string dataDirectory, CanopyBundleResult result) {
        View = view;
        Options = options;
        DataDirectory = dataDirectory;
        Result = result;
    }

    internal CanopyView View { get; }

    internal CanopyBundleOptions Options { get; }

    internal string DataDirectory { get; }

    internal CanopyBundleResult Result { get; }

    /// <summary>The writer the bundle writer serializes nodes with, one after another, reusing its buffer.</summary>
    internal CanopyJsonWriter ItemWriter { get; } = new CanopyJsonWriter(1024);

    /// <summary>The bytes left for a file's items once its wrapper and its document without items are written.</summary>
    /// <param name="reference">A reference at least as long as any the file can get.</param>
    /// <param name="envelope">The document without items, with fields at least as long as any the file can get.</param>
    /// <exception cref="InvalidOperationException">The wrapper and envelope alone exceed the file budget.</exception>
    internal int ItemBudget(string reference, string envelope) {
        var budget = RemainingBytes(reference, envelope);
        if (budget <= 0) {
            throw new InvalidOperationException("Sidecar '" + reference + "' fixed envelope exceeds MaxFileBytes; shorten identifiers or increase the budget.");
        }

        return budget;
    }

    /// <summary>The file budget minus a file's wrapper and envelope; zero or less when those alone do not fit.</summary>
    internal int RemainingBytes(string reference, string envelope) => Options.MaxFileBytes - Utf8.GetByteCount(Wrap(reference, envelope)) - 16;

    /// <summary>Writes one sidecar script and returns its size in bytes.</summary>
    /// <exception cref="InvalidOperationException">The manifest exceeds the file budget.</exception>
    internal int WriteFile(string reference, string document) {
        if (reference == CanopyBundleLayout.Manifest) {
            var size = Utf8.GetByteCount(Wrap(reference, document));
            if (size > Options.MaxFileBytes) {
                throw new InvalidOperationException("Sidecar '" + reference + "' exceeds MaxFileBytes (" + size + " bytes). Increase the budget or reduce the search index.");
            }
        }

        return (int)WriteFile(reference, new[] { document });
    }

    /// <summary>
    /// Writes one sidecar script from the parts of its document, in order, without building the whole file in memory,
    /// and returns its size in bytes. The text is encoded into one buffer the whole write reuses; a part is encoded in
    /// pieces that never split a surrogate pair, and parts are whole JSON values or ASCII, so the bytes are those of
    /// <see cref="Utf8"/> for the whole file.
    /// </summary>
    internal long WriteFile(string reference, IEnumerable<string> documentParts) {
        var buffer = _encoded ??= new byte[Utf8.GetMaxByteCount(EncodedChars)];
        long length = 0;
        var used = 0;
        using (var stream = new FileStream(PathOf(reference), FileMode.Create, FileAccess.Write, FileShare.None, 1)) {
            Encode(stream, buffer, WrapperStart(reference), ref used, ref length);
            foreach (var part in documentParts) {
                Encode(stream, buffer, part, ref used, ref length);
            }

            Encode(stream, buffer, WrapperEnd, ref used, ref length);
            stream.Write(buffer, 0, used);
        }

        Count(length);
        return length;
    }

    private const string WrapperEnd = "]);\n";

    /// <summary>The most characters encoded at once, which keeps the file buffer within 64K.</summary>
    private const int EncodedChars = 21844;

    private static void Encode(Stream stream, byte[] buffer, string text, ref int used, ref long length) {
        for (var start = 0; start < text.Length;) {
            var count = Math.Min(EncodedChars, text.Length - start);
            if (start + count < text.Length && char.IsHighSurrogate(text[start + count - 1])) {
                count--;
            }

            if (used + Utf8.GetMaxByteCount(count) > buffer.Length) {
                stream.Write(buffer, 0, used);
                used = 0;
            }

            var written = Utf8.GetBytes(text, start, count, buffer, used);
            used += written;
            length += written;
            start += count;
        }
    }

    private string PathOf(string reference) {
        var path = Path.Combine(DataDirectory, reference.Replace('/', Path.DirectorySeparatorChar) + ".js");
        var directory = Path.GetDirectoryName(path)!;
        if (_directories.Add(directory)) {
            Directory.CreateDirectory(directory);
        }

        return path;
    }

    private void Count(long bytes) {
        Result.FileCount++;
        Result.TotalBytes += bytes;
        Result.LargestFileBytes = Math.Max(Result.LargestFileBytes, bytes);
    }

    /// <summary>The sidecar script: it pushes the view id, the file's own reference, and the document onto the queue.</summary>
    private string Wrap(string reference, string document) => WrapperStart(reference) + document + WrapperEnd;

    private string WrapperStart(string reference) {
        var header = new CanopyJsonWriter(128);
        header.BeginArray().String(View.Id).String(reference);
        return "(self.CanopyXSidecar = self.CanopyXSidecar || []).push(" + header.ToString() + ",";
    }
}
