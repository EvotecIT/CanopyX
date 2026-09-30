using System;
using System.IO;
using System.Text;
using CanopyX.Json;

namespace CanopyX.Bundles;

/// <summary>
/// The state of one bundle write, shared by the page writer and the search index writer: where files go, the file
/// budget, and the running totals. Every sidecar file is written through <see cref="WriteFile"/>.
/// </summary>
internal sealed class CanopyBundleContext {
    internal static readonly UTF8Encoding Utf8 = new UTF8Encoding(false);

    internal CanopyBundleContext(CanopyView view, CanopyBundleOptions options, string dataDirectory, CanopyBundleLayout layout, CanopyBundleResult result) {
        View = view;
        Options = options;
        DataDirectory = dataDirectory;
        Layout = layout;
        Result = result;
    }

    internal CanopyView View { get; }

    internal CanopyBundleOptions Options { get; }

    internal string DataDirectory { get; }

    internal CanopyBundleLayout Layout { get; }

    internal CanopyBundleResult Result { get; }

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
        var bytes = Utf8.GetBytes(Wrap(reference, document));
        if (reference == CanopyBundleLayout.Manifest && bytes.Length > Options.MaxFileBytes) {
            throw new InvalidOperationException("Sidecar '" + reference + "' exceeds MaxFileBytes (" + bytes.Length + " bytes). Increase the budget or reduce the search index.");
        }

        var path = Path.Combine(DataDirectory, reference.Replace('/', Path.DirectorySeparatorChar) + ".js");
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        File.WriteAllBytes(path, bytes);
        Result.FileCount++;
        Result.TotalBytes += bytes.Length;
        Result.LargestFileBytes = Math.Max(Result.LargestFileBytes, bytes.Length);
        return bytes.Length;
    }

    /// <summary>The sidecar script: it pushes the view id, the file's own reference, and the document onto the queue.</summary>
    private string Wrap(string reference, string document) {
        var header = new CanopyJsonWriter(128);
        header.BeginArray().String(View.Id).String(reference).Raw(document).EndArray();
        return "(self.CanopyXSidecar = self.CanopyXSidecar || []).push(" + header.ToString() + ");\n";
    }
}
