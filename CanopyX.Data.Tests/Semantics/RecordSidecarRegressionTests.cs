using System.Globalization;
using System.Text;
using System.Text.Json;
using Xunit;
using Xunit.Abstractions;

namespace CanopyX.Data.Tests;

/// <summary>Record-pack exports bound file lifetimes and preserve streamed scripts, regeneration and local URL paths.</summary>
public sealed class RecordSidecarRegressionTests {
    private readonly ITestOutputHelper _output;
    public RecordSidecarRegressionTests(ITestOutputHelper output) { _output = output; }

    [Fact]
    public void ManyShards_KeepOnlyABoundedNumberOfPackFilesOpenWhileStreaming() {
        using var directory = new ExportDirectory();
        var view = Grid("records/", 65536);
        var ids = DistinctShards(65536, 256);
        var observed = -1;
        IEnumerable<CanopyGridRecord> Records() {
            foreach (var id in ids) yield return new CanopyGridRecord(id);
            observed = LockedPacks(directory.Path);
        }
        var written = CanopyRecordSidecar.Write(directory.Path, view, Records());
        _output.WriteLine("encounteredShards=" + written.Count + "; retainedOpenPackFiles=" + observed);
        Assert.Equal(256, written.Count);
        Assert.InRange(observed, 0, 32);
        Assert.Equal(0, LockedPacks(directory.Path));
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void InterleavedShards_AppendEveryRecordExactlyOnceWithOneHeaderAndFooter(bool tree) {
        using var directory = new ExportDirectory();
        const int shards = 48;
        var ids = Enumerable.Range(0, shards).ToDictionary(shard => shard, _ => new List<string>());
        for (var index = 0; ids.Values.Any(values => values.Count < 3); index++) {
            var id = "record-" + index.ToString(CultureInfo.InvariantCulture);
            var list = ids[CanopyRecordSidecar.Shard(id, shards)];
            if (list.Count < 3) list.Add(id);
        }
        var records = Enumerable.Range(0, 3).SelectMany(pass => ids.OrderBy(pair => pair.Key).Select(pair => {
            var record = new CanopyGridRecord(pair.Value[pass]);
            record.Fields["detail"] = new CanopyCell(new string('x', 5000) + "</script>é:" + record.Id);
            return record;
        })).ToArray();
        IReadOnlyList<string> written;
        if (tree) {
            var view = new CanopyTreeView("records", "Records") { Record = new CanopyRecordPanel { Source = CanopyRecordSource.Sidecar("records/", shards) } };
            view.Columns.Add(new CanopyColumn("name", "Name")); view.Record.Fields.Add(new CanopyColumn("detail", "Detail"));
            written = CanopyRecordSidecar.Write(directory.Path, view, records);
        } else written = CanopyRecordSidecar.Write(directory.Path, Grid("records/", shards), records);
        Assert.Equal(Enumerable.Range(0, shards).Select(shard => "records/r" + shard.ToString(CultureInfo.InvariantCulture) + ".js"), written);
        foreach (var path in written) {
            var bytes = File.ReadAllBytes(System.IO.Path.Combine(directory.Path, path));
            Assert.False(bytes.Length >= 3 && bytes[0] == 239 && bytes[1] == 187 && bytes[2] == 191);
            var text = Encoding.UTF8.GetString(bytes);
            const string prefix = "(self.CanopyXSidecar = self.CanopyXSidecar || []).push(";
            Assert.StartsWith(prefix, text); Assert.EndsWith("]);\n", text);
            Assert.Equal(text.IndexOf(prefix, StringComparison.Ordinal), text.LastIndexOf(prefix, StringComparison.Ordinal));
            Assert.DoesNotContain("</script>", text);
            using var json = JsonDocument.Parse(text.Substring(prefix.Length, text.Length - prefix.Length - 3));
            var pack = json.RootElement[2]; var shard = pack.GetProperty("shard").GetInt32();
            Assert.Equal("records", json.RootElement[0].GetString()); Assert.Equal("r" + shard, json.RootElement[1].GetString());
            Assert.Equal("canopyx/2", pack.GetProperty("protocol").GetString()); Assert.Equal("gridRecordPack", pack.GetProperty("type").GetString());
            Assert.Equal("records", pack.GetProperty("view").GetString());
            var entries = pack.GetProperty("records").EnumerateArray().ToArray();
            Assert.Equal(ids[shard], entries.Select(entry => entry.GetProperty("id").GetString()));
            Assert.All(entries, entry => Assert.Equal(new string('x', 5000) + "</script>é:" + entry.GetProperty("id").GetString(), entry.GetProperty("fields").GetProperty("detail").GetString()));
        }
        Assert.Equal(0, LockedPacks(directory.Path));
    }

    [Fact]
    public void Regeneration_RemovesOnlyObsoleteOwnedPacksAfterSuccessfulFinalization() {
        using var directory = new ExportDirectory();
        var view = Grid("records/", 64); var ids = DistinctShards(64, 40);
        var original = CanopyRecordSidecar.Write(directory.Path, view, ids.Select(id => new CanopyGridRecord(id)));
        var packFolder = System.IO.Path.Combine(directory.Path, "records");
        foreach (var file in new[] { "r01.js", "r-notes.js", "user.txt" }) File.WriteAllText(System.IO.Path.Combine(packFolder, file), "user file");
        var obsolete = System.IO.Path.Combine(directory.Path, original[1]);
        var presentDuringEnumeration = false;
        IEnumerable<CanopyGridRecord> Records() {
            yield return new CanopyGridRecord(ids[0]);
            presentDuringEnumeration = File.Exists(obsolete);
        }
        var retained = CanopyRecordSidecar.Write(directory.Path, view, Records());
        Assert.True(presentDuringEnumeration);
        Assert.Single(retained); Assert.False(File.Exists(obsolete)); Assert.Equal(0, LockedPacks(directory.Path));
        Assert.Equal(new[] { "r-notes.js", "r01.js", "user.txt" }, Directory.GetFiles(packFolder).Select(System.IO.Path.GetFileName).Except(retained.Select(System.IO.Path.GetFileName)).OrderBy(name => name, StringComparer.Ordinal));
        Assert.Empty(CanopyRecordSidecar.Write(directory.Path, view, Array.Empty<CanopyGridRecord>()));
        Assert.Equal(new[] { "r-notes.js", "r01.js", "user.txt" }, Directory.GetFiles(packFolder).Select(System.IO.Path.GetFileName).OrderBy(name => name, StringComparer.Ordinal));
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void EnumerationFailure_ReleasesPackFilesAndKeepsObsoleteFiles(bool canceled) {
        using var directory = new ExportDirectory(); var view = Grid("records/", 65536);
        var ids = DistinctShards(65536, 40);
        Directory.CreateDirectory(System.IO.Path.Combine(directory.Path, "records"));
        var used = new HashSet<int>(ids.Select(id => CanopyRecordSidecar.Shard(id, 65536)));
        var obsoleteShard = Enumerable.Range(0, 65536).Last(shard => !used.Contains(shard));
        var obsolete = System.IO.Path.Combine(directory.Path, "records", "r" + obsoleteShard.ToString(CultureInfo.InvariantCulture) + ".js"); File.WriteAllText(obsolete, "old pack");
        Exception failure = canceled ? new OperationCanceledException("Host canceled enumeration.") : new InvalidOperationException("Host enumeration failed.");
        IEnumerable<CanopyGridRecord> Records() { foreach (var id in ids) yield return new CanopyGridRecord(id); throw failure; }
        var actual = Assert.ThrowsAny<Exception>(() => CanopyRecordSidecar.Write(directory.Path, view, Records()));
        Assert.Same(failure, actual); Assert.Equal(0, LockedPacks(directory.Path)); Assert.Equal("old pack", File.ReadAllText(obsolete));
    }

    [Fact]
    public void PackOpenFailure_ReleasesOtherPacksBeforePropagatingTheFileError() {
        using var directory = new ExportDirectory(); var view = Grid("records/", 65536);
        var ids = DistinctShards(65536, 41);
        var blocked = System.IO.Path.Combine(directory.Path, "records", "r" + CanopyRecordSidecar.Shard(ids[40], 65536).ToString(CultureInfo.InvariantCulture) + ".js");
        Directory.CreateDirectory(blocked);
        var error = Assert.ThrowsAny<Exception>(() => CanopyRecordSidecar.Write(directory.Path, view, ids.Select(id => new CanopyGridRecord(id))));
        Assert.True(error is IOException || error is UnauthorizedAccessException, error.GetType().FullName);
        Assert.Equal(0, LockedPacks(directory.Path)); Assert.True(Directory.Exists(blocked));
    }

    [Theory]
    [InlineData("move-next")]
    [InlineData("cancellation")]
    [InlineData("validation")]
    [InlineData("file-open")]
    public void PrimaryExportFailure_IsPreservedWhenHostEnumeratorDisposalAlsoFails(string scenario) {
        using var directory = new ExportDirectory(); var view = Grid("records/", 65536);
        var ids = DistinctShards(65536, 41);
        var records = ids.Select(id => new CanopyGridRecord(id)).ToArray();
        Exception? primary = scenario == "move-next" ? new InvalidOperationException("The host could not read the next record.") :
            scenario == "cancellation" ? new OperationCanceledException("The host canceled the read.") : null;
        if (scenario == "validation") records[40].Fields["undeclared"] = "invalid";
        if (scenario == "file-open") Directory.CreateDirectory(System.IO.Path.Combine(directory.Path, "records", "r" + CanopyRecordSidecar.Shard(ids[40], 65536).ToString(CultureInfo.InvariantCulture) + ".js"));
        Directory.CreateDirectory(System.IO.Path.Combine(directory.Path, "records"));
        var used = new HashSet<int>(ids.Select(id => CanopyRecordSidecar.Shard(id, 65536)));
        var obsoleteShard = Enumerable.Range(0, 65536).First(shard => !used.Contains(shard));
        var obsolete = System.IO.Path.Combine(directory.Path, "records", "r" + obsoleteShard.ToString(CultureInfo.InvariantCulture) + ".js");
        File.WriteAllText(obsolete, "old pack");
        var disposal = new ApplicationException("The host enumerator also failed to close.");
        var input = new FailingEnumerator(records, primary, disposal);
        var error = Assert.ThrowsAny<Exception>(() => CanopyRecordSidecar.Write(directory.Path, view, input));
        if (primary != null) Assert.Same(primary, error);
        else if (scenario == "validation") { Assert.IsType<InvalidOperationException>(error); Assert.Contains("undeclared", error.Message); }
        else Assert.True(error is IOException || error is UnauthorizedAccessException, error.GetType().FullName);
        Assert.Equal(1, input.Disposals); Assert.Equal(1, input.Enumerations); Assert.Equal(0, LockedPacks(directory.Path));
        Assert.Equal("old pack", File.ReadAllText(obsolete));
    }

    [Fact]
    public void EnumeratorDisposalFailure_IsReportedWhenEnumerationOtherwiseSucceeds() {
        using var directory = new ExportDirectory(); var view = Grid("records/", 64);
        var disposal = new ApplicationException("The host enumerator failed to close.");
        var input = new FailingEnumerator(DistinctShards(64, 40).Select(id => new CanopyGridRecord(id)).ToArray(), null, disposal);
        Assert.Same(disposal, Assert.Throws<ApplicationException>(() => CanopyRecordSidecar.Write(directory.Path, view, input)));
        Assert.Equal(1, input.Disposals); Assert.Equal(1, input.Enumerations); Assert.Equal(0, LockedPacks(directory.Path));
    }

    [Theory]
    [InlineData("query")]
    [InlineData("fragment")]
    [InlineData("encoded-parent")]
    [InlineData("encoded-slash")]
    [InlineData("encoded-fragment")]
    [InlineData("encoded-percent")]
    [InlineData("newline")]
    [InlineData("tab")]
    [InlineData("carriage-return")]
    [InlineData("nul")]
    [InlineData("leading-space")]
    public void RecordFolders_RejectUrlDelimitersEscapesAndControls(string scenario) {
        var folder = scenario switch {
            "query" => "records?version=1/", "fragment" => "records#one/", "encoded-parent" => "records/%2e%2e/",
            "encoded-slash" => "records%2fdata/", "encoded-fragment" => "records%23one/", "encoded-percent" => "records%25data/",
            "newline" => "reco\nrds/", "tab" => "reco\trds/", "carriage-return" => "reco\rrds/", "leading-space" => " records/", _ => "reco\0rds/"
        };
        Assert.Throws<ArgumentException>(() => CanopyRecordSource.Sidecar(folder, 4));
    }

    [Theory]
    [InlineData("record packs/")]
    [InlineData("données/")]
    [InlineData("record-v1.2/nested/")]
    [InlineData("records/ leading/")]
    public void PlainRecordFolders_PreserveWorkingSpacesUnicodeAndNestedPaths(string folder) {
        using var directory = new ExportDirectory(); var view = Grid(folder, 1);
        var path = Assert.Single(CanopyRecordSidecar.Write(directory.Path, view, new[] { new CanopyGridRecord("one") }));
        Assert.Equal(folder + "r0.js", path); Assert.True(File.Exists(System.IO.Path.Combine(directory.Path, path)));
        var uri = new Uri(new Uri("https://example.invalid/page/index.html"), path);
        Assert.Equal("/page/" + path, Uri.UnescapeDataString(uri.AbsolutePath)); Assert.Empty(uri.Query); Assert.Empty(uri.Fragment);
    }

    private static CanopyDataGridView Grid(string folder, int shards) {
        var view = new CanopyDataGridView("records", "Records") { Record = new CanopyRecordPanel { Source = CanopyRecordSource.Sidecar(folder, shards) } };
        view.Columns.Add(new CanopyColumn("name", "Name")); view.Record.Fields.Add(new CanopyColumn("detail", "Detail")); return view;
    }
    private static List<string> DistinctShards(int shards, int count) {
        var seen = new HashSet<int>(); var ids = new List<string>();
        for (var index = 0; ids.Count < count; index++) {
            var id = "id-" + index.ToString(CultureInfo.InvariantCulture);
            if (seen.Add(CanopyRecordSidecar.Shard(id, shards))) ids.Add(id);
        }
        return ids;
    }
    private static int LockedPacks(string directory) {
        var locked = 0;
        foreach (var path in Directory.EnumerateFiles(directory, "r*.js", SearchOption.AllDirectories)) {
            try { using var stream = new FileStream(path, FileMode.Open, FileAccess.ReadWrite, FileShare.None); }
            catch (IOException) { locked++; }
        }
        return locked;
    }
    private sealed class FailingEnumerator : IEnumerable<CanopyGridRecord>, IEnumerator<CanopyGridRecord> {
        private readonly IReadOnlyList<CanopyGridRecord> _records;
        private readonly Exception? _primary;
        private readonly Exception _disposal;
        private int _index = -1;
        internal FailingEnumerator(IReadOnlyList<CanopyGridRecord> records, Exception? primary, Exception disposal) { _records = records; _primary = primary; _disposal = disposal; }
        internal int Enumerations { get; private set; }
        internal int Disposals { get; private set; }
        public CanopyGridRecord Current => _records[_index];
        object System.Collections.IEnumerator.Current => Current;
        public bool MoveNext() { if (++_index < _records.Count) return true; if (_primary != null) throw _primary; return false; }
        public void Reset() => throw new NotSupportedException();
        public void Dispose() { Disposals++; throw _disposal; }
        public IEnumerator<CanopyGridRecord> GetEnumerator() { Enumerations++; return this; }
        System.Collections.IEnumerator System.Collections.IEnumerable.GetEnumerator() => GetEnumerator();
    }
    private sealed class ExportDirectory : IDisposable {
        public ExportDirectory() { Path = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "canopyx-record-proof-" + Guid.NewGuid().ToString("N")); Directory.CreateDirectory(Path); }
        public string Path { get; }
        public void Dispose() { Directory.Delete(Path, true); }
    }
}
