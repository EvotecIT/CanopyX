using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Runtime.ExceptionServices;
using System.Text;
using System.Threading;
using CanopyX.Json;

namespace CanopyX.Bundles;

/// <summary>
/// The state of one bundle write, shared by the page writer and the search index writer: where files go, the file
/// budget, and the running totals. Every sidecar file is written through <c>WriteFile</c> or <see cref="WriteFileLater"/>.
/// </summary>
/// <remarks>
/// Creating a file is the slowest step of writing it on Windows, so the packs and top-level pages, which are complete
/// when they are handed over, are written by one background thread in the order they arrive while the writer goes on
/// with the tree. <see cref="Complete"/> waits for them; the manifest is written only after that, so a failed write
/// still leaves no manifest. A platform without threads writes them at once.
/// </remarks>
internal sealed class CanopyBundleContext : IDisposable {
    internal static readonly UTF8Encoding Utf8 = new UTF8Encoding(false);

    /// <summary>Files written at once before the background writer starts, so a small bundle starts no thread.</summary>
    private const int FilesBeforeBackground = 4;

    /// <summary>The folders this write has created, so each is created once and not once per file.</summary>
    private readonly HashSet<string> _directories = new HashSet<string>(StringComparer.Ordinal);

    /// <summary>Guards the running totals, which both threads add to.</summary>
    private readonly object _totals = new object();

    /// <summary>The buffer the files written on the caller's thread are encoded into.</summary>
    private byte[]? _encoded;

    private BlockingCollection<PendingFile>? _pending;
    private Thread? _background;
    /// <summary>The first failure of the background thread, which the caller's thread reports.</summary>
    private volatile ExceptionDispatchInfo? _failure;
    private int _handedOver;
    private bool _completed;
    private bool _noThreads;

    internal CanopyBundleContext(CanopyTreeView view, CanopyBundleOptions options, string dataDirectory, CanopyBundleResult result) {
        View = view;
        Options = options;
        DataDirectory = dataDirectory;
        Result = result;
    }

    internal CanopyTreeView View { get; }

    internal CanopyBundleOptions Options { get; }

    internal string DataDirectory { get; }

    internal CanopyBundleResult Result { get; }

    /// <summary>The writer the bundle writer serializes nodes with, one after another, reusing its buffer.</summary>
    internal CanopyJsonWriter ItemWriter { get; } = new CanopyJsonWriter(1024);

    /// <summary>The writer page envelopes are written with, one after another, reusing its buffer.</summary>
    internal CanopyJsonWriter EnvelopeWriter { get; } = new CanopyJsonWriter(256);

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
    /// <exception cref="IOException">An earlier file of the background thread could not be written.</exception>
    internal long WriteFile(string reference, IEnumerable<string> documentParts) {
        _failure?.Throw();
        return Write(PathOf(reference), WrapperStart(reference), ParsedDocumentParts(reference, documentParts), _encoded ??= NewBuffer());
    }

    /// <summary>
    /// Writes one sidecar script whose parts no longer change, on the background thread once a few files have been
    /// written. Its size is added to the totals when it is written.
    /// </summary>
    /// <exception cref="IOException">An earlier file of the background thread could not be written.</exception>
    internal void WriteFileLater(string reference, IEnumerable<string> documentParts) {
        _failure?.Throw();
        if (_handedOver++ >= FilesBeforeBackground && !_completed && StartBackground()) {
            _pending!.Add(new PendingFile(PathOf(reference), WrapperStart(reference), ParsedDocumentParts(reference, documentParts)));
            return;
        }

        WriteFile(reference, documentParts);
    }

    /// <summary>Waits until the background thread has written every file handed over, and reports its failure.</summary>
    internal void Complete() {
        Stop();
        _failure?.Throw();
    }

    /// <summary>Stops the background thread after the files handed over; a failure was already reported or is not the first.</summary>
    public void Dispose() => Stop();

    private void Stop() {
        if (_completed) {
            return;
        }

        _completed = true;
        if (_background != null) {
            _pending!.CompleteAdding();
            _background.Join();
            _pending.Dispose();
        }
    }

    private bool StartBackground() {
        if (_background != null) {
            return true;
        }

        if (_noThreads) {
            return false;
        }

        var pending = new BlockingCollection<PendingFile>(16);
        var thread = new Thread(WriteInBackground) { IsBackground = true, Name = "CanopyX bundle files" };
        _pending = pending;
        try {
            thread.Start();
        } catch (Exception exception) when (exception is PlatformNotSupportedException || exception is NotSupportedException || exception is OutOfMemoryException) {
            // The platform cannot start a thread; files are written at once.
            _noThreads = true;
            _pending = null;
            pending.Dispose();
            return false;
        }

        _background = thread;
        return true;
    }

    private void WriteInBackground() {
        var buffer = NewBuffer();
        foreach (var file in _pending!.GetConsumingEnumerable()) {
            if (_failure != null) {
                // Files after a failure are not written; the caller reports the first failure.
                continue;
            }

            try {
                Write(file.Path, file.WrapperStart, file.Parts, buffer);
            } catch (Exception exception) {
                _failure = ExceptionDispatchInfo.Capture(exception);
            }
        }
    }

    private static byte[] NewBuffer() => new byte[Utf8.GetMaxByteCount(EncodedChars)];

    private long Write(string path, string wrapperStart, IEnumerable<string> documentParts, byte[] buffer) {
        long length = 0;
        var used = 0;
        using (var stream = new FileStream(path, FileMode.Create, FileAccess.Write, FileShare.None, 1)) {
            Encode(stream, buffer, wrapperStart, ref used, ref length);
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
        if (!_directories.Contains(directory)) {
            Directory.CreateDirectory(directory);
            _directories.Add(directory);
        }

        return path;
    }

    private void Count(long bytes) {
        lock (_totals) {
            Result.FileCount++;
            Result.TotalBytes += bytes;
            Result.LargestFileBytes = Math.Max(Result.LargestFileBytes, bytes);
        }
    }

    /// <summary>The sidecar script: it pushes the view id, the file's own reference, and the document onto the queue.</summary>
    private string Wrap(string reference, string document) => WrapperStart(reference) +
        (IsPack(reference) ? document : "JSON.parse(String.raw`" + document + "`)") + WrapperEnd;

    /// <summary>
    /// Parses data as JSON so dictionary keys retain JSON semantics. Pack envelopes have fixed keys and already
    /// carry their data documents as raw JSON strings; parsing the envelope would also parse every packed page early.
    /// The JSON writer escapes backticks and template substitutions before any part reaches this boundary.
    /// </summary>
    private static IEnumerable<string> ParsedDocumentParts(string reference, IEnumerable<string> parts) {
        var packed = IsPack(reference);
        if (!packed) yield return "JSON.parse(String.raw`";
        foreach (var part in parts) yield return part;
        if (!packed) yield return "`)";
    }

    private static bool IsPack(string reference) => reference.StartsWith("p/", StringComparison.Ordinal) ||
        reference.StartsWith("q/", StringComparison.Ordinal);

    private string WrapperStart(string reference) {
        var header = new CanopyJsonWriter(128);
        header.BeginArray().String(View.Id).String(reference);
        return "(self.CanopyXSidecar = self.CanopyXSidecar || []).push(" + header.ToString() + ",";
    }

    /// <summary>A file handed to the background thread: where it goes, its wrapper, and its document's parts.</summary>
    private sealed class PendingFile {
        internal PendingFile(string path, string wrapperStart, IEnumerable<string> parts) {
            Path = path;
            WrapperStart = wrapperStart;
            Parts = parts;
        }

        internal string Path { get; }

        internal string WrapperStart { get; }

        internal IEnumerable<string> Parts { get; }
    }
}
