using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Runtime.ExceptionServices;
using System.Text;

namespace CanopyX;

/// <summary>Bounds open record-pack streams; evicted packs resume at their end without repeating the header.</summary>
internal sealed class CanopyRecordPackWriters : IDisposable {
    private const int Capacity = 16;
    private readonly string _folder;
    private readonly Encoding _encoding;
    private readonly Dictionary<int, LinkedListNode<Pack>> _open = new Dictionary<int, LinkedListNode<Pack>>();
    private readonly LinkedList<Pack> _recent = new LinkedList<Pack>();

    internal CanopyRecordPackWriters(string folder, Encoding encoding) { _folder = folder; _encoding = encoding; }

    internal StreamWriter Get(int shard, bool first = false) {
        if (_open.TryGetValue(shard, out var existing)) {
            _recent.Remove(existing); _recent.AddFirst(existing); return existing.Value.Writer;
        }
        if (_open.Count == Capacity) {
            var oldest = _recent.Last!;
            // Keep it tracked until disposal succeeds, so failure cleanup retries it and releases every other pack.
            oldest.Value.Writer.Dispose(); _open.Remove(oldest.Value.Shard); _recent.RemoveLast();
        }
        var stream = new FileStream(Path.Combine(_folder, "r" + shard.ToString(CultureInfo.InvariantCulture) + ".js"),
            first ? FileMode.Create : FileMode.Open, FileAccess.Write, FileShare.None, 4096);
        StreamWriter writer;
        try {
            if (!first) stream.Seek(0, SeekOrigin.End);
            writer = new StreamWriter(stream, _encoding);
        } catch { stream.Dispose(); throw; }
        _open.Add(shard, _recent.AddFirst(new Pack(shard, writer)));
        return writer;
    }

    public void Dispose() => Close(false);
    internal void DisposeAfterFailure() => Close(true);

    private void Close(bool failed) {
        Exception? failure = null;
        foreach (var pack in _recent) {
            try { pack.Writer.Dispose(); }
            catch (Exception error) { if (failure == null) failure = error; }
        }
        _recent.Clear(); _open.Clear();
        if (!failed && failure != null) ExceptionDispatchInfo.Capture(failure).Throw();
    }

    private sealed class Pack {
        internal Pack(int shard, StreamWriter writer) { Shard = shard; Writer = writer; }
        internal int Shard { get; }
        internal StreamWriter Writer { get; }
    }
}
