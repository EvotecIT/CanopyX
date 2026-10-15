using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Text;
using CanopyX.Bundles;
using CanopyX.Json;

namespace CanopyX;

/// <summary>
/// The rows of an inline grid as compact row data: each row an array of its cells in column order instead of an object with
/// repeated keys, split into chunks the browser decodes one at a time. It is the <c>rowData</c> of a <c>canopyx/2</c> grid
/// document (see "Row data" in docs/data-protocol.md), which takes the place of the document's <c>rows</c>.
/// </summary>
/// <remarks>
/// <para>
/// The rows are taken when the instance is created and written in ordinal order of their identities, which is the order the
/// grid shows when no sort applies, so the browser shows the first rows as soon as their chunk is decoded. The grid always
/// orders rows by its sort keys and then by identity, so the order of rows in the data never changes what it shows.
/// </para>
/// <para>
/// A host writes the grid document with <see cref="ToJson"/> and each chunk with <see cref="GetChunk"/>: into
/// <c>application/x-canopyx-rows</c> scripts inside the grid's host element (CanopyX.Html does this for
/// <c>CanopyHtmlOptions.RowData</c>), or into sidecar files with <see cref="WriteFiles"/> for a bundle.
/// </para>
/// </remarks>
public sealed class CanopyGridRowData {
    private readonly CanopyGridRow[] _rows;
    private readonly int _chunkSize;

    /// <summary>Takes the rows of an inline grid.</summary>
    /// <param name="view">The grid. Its source must be inline.</param>
    /// <param name="options">Chunk size and compression; defaults to chunks of 5,000 uncompressed rows.</param>
    /// <exception cref="ArgumentNullException"><paramref name="view"/> is null.</exception>
    /// <exception cref="InvalidOperationException">The grid has a host source, or its definition is invalid.</exception>
    public CanopyGridRowData(CanopyDataGridView view, CanopyRowDataOptions? options = null) {
        View = view ?? throw new ArgumentNullException(nameof(view));
        if (view.Source.Kind != CanopyGridSourceKind.Inline) throw new InvalidOperationException("Row data holds the rows of an inline grid.");
        view.Validate();
        var settings = options ?? new CanopyRowDataOptions();
        _chunkSize = settings.ChunkSize;
        Compression = settings.Compression;
        _rows = view.Rows.ToArray();
        Array.Sort(_rows, (left, right) => string.CompareOrdinal(left.Id, right.Id));
        Columns = view.Columns.Select(column => column.Id).ToList().AsReadOnly();
    }

    /// <summary>Gets the grid whose rows these are.</summary>
    public CanopyDataGridView View { get; }

    /// <summary>Gets the column ids in the order of each compact row's cells: every declared column, in declaration order.</summary>
    public IReadOnlyList<string> Columns { get; }

    /// <summary>Gets the number of rows.</summary>
    public int RowCount => _rows.Length;

    /// <summary>Gets the number of chunks.</summary>
    public int ChunkCount => (_rows.Length + _chunkSize - 1) / _chunkSize;

    /// <summary>Gets how each chunk is stored.</summary>
    public CanopyRowCompression Compression { get; }

    /// <summary>
    /// Gets the folder <see cref="WriteFiles"/> writes the chunk files into, relative to the page, with forward slashes and a
    /// trailing slash: <c>data/</c> and a portable folder named after the view id, as the tree bundle writer names it.
    /// </summary>
    public string DataFolder => BundlePaths.DataPath(View.Id, null);

    /// <summary>Writes one chunk: its JSON array of compact rows, or, compressed, the base64 text of that JSON gzip-compressed.</summary>
    /// <param name="index">The chunk, from 0.</param>
    /// <returns>Text that can sit inside an HTML script element or a JavaScript template literal unchanged.</returns>
    /// <exception cref="ArgumentOutOfRangeException"><paramref name="index"/> is not a chunk.</exception>
    public string GetChunk(int index) {
        if (index < 0 || index >= ChunkCount) throw new ArgumentOutOfRangeException(nameof(index), index, "No such row data chunk.");
        var writer = new CanopyJsonWriter(_chunkSize * 128);
        writer.BeginArray();
        for (var i = index * _chunkSize; i < Math.Min(_rows.Length, (index + 1) * _chunkSize); i++) _rows[i].WriteCompactJson(writer, Columns);
        var json = writer.EndArray().ToString();
        if (Compression == CanopyRowCompression.None) return json;
        using var output = new MemoryStream();
        using (var gzip = new GZipStream(output, CompressionLevel.Optimal, true)) {
            var bytes = Encoding.UTF8.GetBytes(json);
            gzip.Write(bytes, 0, bytes.Length);
        }

        return Convert.ToBase64String(output.GetBuffer(), 0, (int)output.Length);
    }

    /// <summary>Writes the grid document with this row data in place of its rows.</summary>
    /// <param name="sidecarBase">The folder, relative to the page, of the chunk files <see cref="WriteFiles"/> wrote; null when the
    /// chunks are scripts inside the grid's host element.</param>
    /// <returns>The HTML-safe <c>grid</c> document.</returns>
    /// <exception cref="InvalidOperationException">The definition is invalid, or its columns changed after the row data was taken.</exception>
    public string ToJson(string? sidecarBase = null) {
        // The chunks name cells by the columns taken at creation; the document must declare the same columns.
        if (!View.Columns.Select(column => column?.Id).SequenceEqual(Columns)) throw new InvalidOperationException("The grid's columns changed after its row data was taken.");
        return View.WriteJson(this, sidecarBase);
    }

    /// <summary>
    /// Writes every chunk as a sidecar script (<c>rows/&lt;n&gt;.js</c>) into the grid's data folder under
    /// <paramref name="directory"/>: <c>data/&lt;view id folder&gt;/</c>, named as the tree bundle writer names it. The page
    /// loads the files on demand, also from <c>file://</c>; pass <see cref="CanopyGridBundleResult.Base"/> to <see cref="ToJson"/>.
    /// </summary>
    /// <param name="directory">The bundle folder that holds the page.</param>
    /// <returns>The folder and sizes of the files written.</returns>
    /// <exception cref="ArgumentException"><paramref name="directory"/> is null or empty.</exception>
    public CanopyGridBundleResult WriteFiles(string directory) {
        if (string.IsNullOrEmpty(directory)) throw new ArgumentException("Directory is required.", nameof(directory));
        var dataBase = DataFolder;
        var folder = Path.Combine(Path.GetFullPath(directory), dataBase.TrimEnd('/').Replace('/', Path.DirectorySeparatorChar), "rows");
        Directory.CreateDirectory(folder);
        var result = new CanopyGridBundleResult(dataBase, Path.GetDirectoryName(folder)!) { RowCount = RowCount };
        var id = new CanopyJsonWriter(View.Id.Length + 8).String(View.Id).ToString();
        var encoding = new UTF8Encoding(false);
        for (var index = 0; index < ChunkCount; index++) {
            var path = Path.Combine(folder, index.ToString(System.Globalization.CultureInfo.InvariantCulture) + ".js");
            var text = "(self.CanopyXSidecar = self.CanopyXSidecar || []).push([" + id + ",\"rows/" + index.ToString(System.Globalization.CultureInfo.InvariantCulture) +
                "\",String.raw`" + GetChunk(index) + "`]);\n";
            File.WriteAllText(path, text, encoding);
            var bytes = encoding.GetByteCount(text);
            result.FileCount++;
            result.TotalBytes += bytes;
            result.LargestFileBytes = Math.Max(result.LargestFileBytes, bytes);
        }

        return result;
    }

    /// <summary>Writes the <c>rowData</c> descriptor of the grid document.</summary>
    internal void WriteDescriptor(CanopyJsonWriter writer, string? sidecarBase) {
        writer.BeginObject().Property("version", 1).StringArray("columns", Columns).Property("count", RowCount).Property("ordered", true);
        if (Compression == CanopyRowCompression.Gzip) writer.Property("encoding", "gzip");
        writer.OptionalProperty("base", sidecarBase).Property("chunks", ChunkCount).EndObject();
    }
}
