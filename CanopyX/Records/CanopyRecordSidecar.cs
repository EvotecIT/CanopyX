using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using CanopyX.Bundles;
using CanopyX.Json;

namespace CanopyX;

/// <summary>
/// Writes a view's record details as record packs beside its page (<see cref="CanopyRecordSource.Sidecar"/>), so a drawer loads one
/// record's fields when it opens instead of the page embedding every detail of every row. Packs are scripts, so they load from
/// <c>file://</c> as well as from a server.
/// </summary>
/// <remarks>
/// A record goes to pack <c>r&lt;n&gt;.js</c>, where n is the FNV-1a hash of its id's UTF-16 code units modulo the source's shard
/// count (<see cref="Shard"/>). Each pack registers a <c>gridRecordPack</c> document: <c>{ view, shard, records: [{ id, cells?,
/// fields?, row? }] }</c>. Records are streamed with at most 16 open pack files. Packs reopen at their end when records
/// revisit an evicted shard; the writer retains record identities and encountered shard numbers, not record contents.
/// Obsolete packs are removed only after all current packs have been finalized and closed. Write to a fresh output
/// directory and publish only after this method succeeds: encountered packs are replaced directly, so a failed export
/// can leave partial files and does not atomically replace an existing report.
/// Host enumerators are disposed; a cleanup failure does not replace an export error or cancellation already in progress.
/// </remarks>
public static class CanopyRecordSidecar {
    private static readonly Encoding FileEncoding = new UTF8Encoding(false);

    /// <summary>Returns the pack a record belongs to: the FNV-1a hash of its id's UTF-16 code units modulo the shard count.</summary>
    /// <param name="id">The record's identity.</param>
    /// <param name="shards">The number of packs.</param>
    /// <returns>The pack number, from 0 to <paramref name="shards"/> - 1.</returns>
    /// <exception cref="ArgumentException">The id is empty.</exception>
    /// <exception cref="ArgumentOutOfRangeException">The shard count is below 1.</exception>
    public static int Shard(string id, int shards) {
        CanopyIdentifiers.Require(id, nameof(id));
        if (shards < 1) throw new ArgumentOutOfRangeException(nameof(shards));
        unchecked {
            var hash = 2166136261u;
            foreach (var unit in id) hash = (hash ^ unit) * 16777619u;
            return (int)(hash % (uint)shards);
        }
    }

    /// <summary>Writes the record packs of a grid into its page's folder, under the grid's sidecar source folder.</summary>
    /// <param name="pageDirectory">The folder of the page that holds the grid.</param>
    /// <param name="view">The grid, whose record panel has a <see cref="CanopyRecordSource.Sidecar"/> source.</param>
    /// <param name="records">The records' details, each id once.</param>
    /// <returns>The pack files written, relative to <paramref name="pageDirectory"/>.</returns>
    /// <exception cref="ArgumentNullException">An argument is null.</exception>
    /// <exception cref="InvalidOperationException">The view has no sidecar source, an id repeats, or a record is invalid.</exception>
    public static IReadOnlyList<string> Write(string pageDirectory, CanopyDataGridView view, IEnumerable<CanopyGridRecord> records) {
        if (view == null) throw new ArgumentNullException(nameof(view));
        view.Validate();
        var columns = CanopyGridRecord.ColumnIds(view.Columns);
        return Write(pageDirectory, view.Id, view.Record, records, (record, writer) => record.WriteContent(writer, columns, view.Record, view.Columns));
    }

    /// <summary>Writes the record packs of a tree into its page's folder, under the tree's sidecar source folder.</summary>
    /// <param name="pageDirectory">The folder of the page that holds the tree.</param>
    /// <param name="view">The tree, whose record panel has a <see cref="CanopyRecordSource.Sidecar"/> source.</param>
    /// <param name="records">The records' details, each id once, without rows.</param>
    /// <returns>The pack files written, relative to <paramref name="pageDirectory"/>.</returns>
    /// <exception cref="ArgumentNullException">An argument is null.</exception>
    /// <exception cref="InvalidOperationException">The view has no sidecar source, an id repeats, or a record is invalid.</exception>
    public static IReadOnlyList<string> Write(string pageDirectory, CanopyTreeView view, IEnumerable<CanopyGridRecord> records) {
        if (view == null) throw new ArgumentNullException(nameof(view));
        view.Validate();
        var columns = CanopyGridRecord.ColumnIds(view.Columns);
        return Write(pageDirectory, view.Id, view.Record, records, (record, writer) => {
            if (record.Row != null) throw new InvalidOperationException("A tree's record details have no row.");
            record.WriteContent(writer, columns, view.Record, null);
        });
    }

    private static IReadOnlyList<string> Write(string pageDirectory, string viewId, CanopyRecordPanel? panel, IEnumerable<CanopyGridRecord> records, Action<CanopyGridRecord, CanopyJsonWriter> content) {
        if (pageDirectory == null) throw new ArgumentNullException(nameof(pageDirectory));
        if (records == null) throw new ArgumentNullException(nameof(records));
        var source = panel?.Source;
        if (source == null || source.Kind != CanopyRecordSourceKind.Sidecar) throw new InvalidOperationException("View '" + viewId + "' has no sidecar record source.");
        var page = Path.GetFullPath(pageDirectory).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar) + Path.DirectorySeparatorChar;
        var folder = Path.GetFullPath(Path.Combine(page, source.Base!.Replace('/', Path.DirectorySeparatorChar)));
        if (!folder.StartsWith(page, StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException("The record packs must stay inside the page's folder.");
        Directory.CreateDirectory(folder);
        var shards = new SortedSet<int>();
        var files = new CanopyRecordPackWriters(folder, FileEncoding);
        var ids = new HashSet<string>(StringComparer.Ordinal);
        IEnumerator<CanopyGridRecord>? enumerator = null;
        try {
            enumerator = records.GetEnumerator();
            while (enumerator.MoveNext()) {
                var record = enumerator.Current;
                if (record == null || !ids.Add(record.Id)) throw new InvalidOperationException("Record packs need unique, non-null records.");
                // Packs are scripts: a "__proto__" key in an object literal would set a prototype instead of a value.
                if (record.HasKey("__proto__")) throw new InvalidOperationException("Record '" + record.Id + "' has a value named __proto__, which a record pack cannot carry.");
                var shard = Shard(record.Id, source.Shards);
                var entry = new CanopyJsonWriter(512);
                entry.BeginObject().Property("id", record.Id);
                content(record, entry);
                entry.EndObject();
                var first = shards.Add(shard);
                var file = files.Get(shard, first);
                if (first) {
                    var head = new CanopyJsonWriter(128);
                    head.BeginArray().String(viewId).String("r" + shard);
                    file.Write("(self.CanopyXSidecar = self.CanopyXSidecar || []).push(" + head + ",{\"protocol\":\"" + CanopyProtocol.Version + "\",\"type\":\"gridRecordPack\",\"view\":");
                    var view = new CanopyJsonWriter(64); view.String(viewId);
                    file.Write(view + ",\"shard\":" + shard + ",\"records\":[");
                } else file.Write(',');
                file.Write(entry.ToString());
            }
            // Successful-enumeration disposal errors are export failures; stop tracking before calling Dispose.
            var completed = enumerator; enumerator = null;
            completed.Dispose();
            var written = new List<string>();
            foreach (var shard in shards) {
                files.Get(shard).Write("]}]);\n");
                written.Add(source.Base + "r" + shard + ".js");
            }
            files.Dispose();
            CanopySidecarFiles.RemoveObsolete(folder, "r", shards.Contains);
            return written.AsReadOnly();
        } catch {
            // As with tree bundle enumeration, preserve the primary failure while still attempting host cleanup.
            try { enumerator?.Dispose(); } catch (Exception) { }
            files.DisposeAfterFailure();
            throw;
        }
    }
}
