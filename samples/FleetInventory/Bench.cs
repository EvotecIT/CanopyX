using System.Diagnostics;
using CanopyX.Data;
using Microsoft.EntityFrameworkCore;

namespace FleetInventory;

/// <summary>Times typical remote requests against the sample database in process (no HTTP), for the performance notes.</summary>
/// <remarks>Run <c>FleetInventory --bench --rows 1000000 --database path</c>. Each request runs once to warm up, then the median of five runs is reported.</remarks>
public static class Bench {
    public static async Task RunAsync(IServiceProvider services) {
        var view = FleetGrid.View("machines", "Machines", grouped: false);
        var grouped = FleetGrid.View("machines-by-site", "Machines by site", grouped: true);
        var levels = FleetGrid.GroupedView();
        var cases = new (string Name, CanopyX.CanopyDataGridView View, Func<CanopyRemoteHandler, Task<string>> Run)[] {
            ("first page, default order", view, handler => handler.QueryAsync("{\"offset\":0,\"limit\":200}")),
            ("first page, sorted by name (indexed)", view, handler => handler.QueryAsync("{\"offset\":0,\"limit\":200,\"sort\":[{\"column\":\"name\",\"direction\":\"asc\"}]}")),
            ("middle page, sorted by name", view, handler => handler.QueryAsync(Offset(handler, 0.5, "name"))),
            ("last page, sorted by name", view, handler => handler.QueryAsync(Offset(handler, 1, "name"))),
            ("first page, sorted by memory (no index)", view, handler => handler.QueryAsync("{\"offset\":0,\"limit\":200,\"sort\":[{\"column\":\"memory\",\"direction\":\"desc\"}]}")),
            ("quick search \"war-w\"", view, handler => handler.QueryAsync("{\"offset\":0,\"limit\":200,\"search\":\"war-w\"}")),
            ("filter group (cores >= 64 or no site)", view, handler => handler.QueryAsync("{\"offset\":0,\"limit\":200,\"filterGroup\":{\"operator\":\"or\",\"filters\":[{\"column\":\"cores\",\"operator\":\"ge\",\"values\":[64]},{\"column\":\"site\",\"operator\":\"isNull\",\"values\":[]}],\"groups\":[]}}")),
            ("value list: site", view, handler => handler.FacetAsync("{\"column\":\"site\",\"query\":{\"revision\":\"bench\"}}")),
            ("value list: model, filtered", view, handler => handler.FacetAsync("{\"column\":\"model\",\"query\":{\"revision\":\"bench\",\"filters\":[{\"column\":\"online\",\"operator\":\"eq\",\"values\":[true]}]}}")),
            ("summary (3 aggregates)", view, handler => handler.SummaryAsync("{\"revision\":\"bench\"}")),
            ("grouped summary by site", grouped, handler => handler.SummaryAsync("{\"revision\":\"bench\"}")),
            ("grouped page in the middle", grouped, handler => handler.QueryAsync(Offset(handler, 0.5, "name"))),
            ("two-level summary: site by machines, then os", levels, handler => handler.SummaryAsync("{\"revision\":\"bench\"}")),
            ("two-level page in the middle", levels, handler => handler.QueryAsync(Offset(handler, 0.5, "name"))),
            ("three-level summary with distinct models", levels, handler => handler.SummaryAsync("{\"revision\":\"bench\",\"groupBy\":[{\"column\":\"site\",\"direction\":\"asc\"},{\"column\":\"os\",\"direction\":\"asc\"},{\"column\":\"model\",\"direction\":\"asc\"}]}"))
        };
        Console.WriteLine("| Request | Median (ms) |");
        Console.WriteLine("| --- | ---: |");
        foreach (var (name, definition, run) in cases) {
            var times = new List<double>();
            for (var i = 0; i < 6; i++) {
                using var scope = services.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<FleetDb>();
                var map = FleetGrid.Map(definition);
                var provider = new CanopyQueryableProvider<Machine>(() => db.Machines, map,
                    new CanopyQueryOptions { Executor = new EfCoreExecutor(), Revision = _ => new ValueTask<string>("bench") });
                var handler = new CanopyRemoteHandler(map.Schema, provider);
                var watch = Stopwatch.StartNew();
                await run(handler);
                if (i > 0) times.Add(watch.Elapsed.TotalMilliseconds);
            }
            times.Sort();
            Console.WriteLine("| " + name + " | " + times[times.Count / 2].ToString("F1", System.Globalization.CultureInfo.InvariantCulture) + " |");
        }
        var export = Stopwatch.StartNew();
        using (var scope = services.CreateScope()) {
            var db = scope.ServiceProvider.GetRequiredService<FleetDb>();
            var map = FleetGrid.Map(view);
            var options = new CanopyRemoteOptions();
            options.Limits.MaxExportRows = int.MaxValue - 1;
            var handler = new CanopyRemoteHandler(map.Schema, new CanopyQueryableProvider<Machine>(() => db.Machines, map,
                new CanopyQueryOptions { Executor = new EfCoreExecutor(), Revision = _ => new ValueTask<string>("bench") }), options);
            var job = await handler.PrepareExportAsync("{\"scope\":\"all\",\"revision\":\"bench\",\"query\":{\"sort\":[{\"column\":\"name\",\"direction\":\"asc\"}]}}", "csv");
            var counter = new CountingStream();
            await job.WriteAsync(counter);
            Console.WriteLine();
            Console.WriteLine("CSV export of all " + job.RecordCount.ToString("N0", System.Globalization.CultureInfo.InvariantCulture) + " rows: " +
                export.Elapsed.TotalSeconds.ToString("F2", System.Globalization.CultureInfo.InvariantCulture) + " s, " +
                (counter.Length / 1048576d).ToString("F1", System.Globalization.CultureInfo.InvariantCulture) + " MiB, peak working set " +
                (Process.GetCurrentProcess().PeakWorkingSet64 / 1048576d).ToString("F0", System.Globalization.CultureInfo.InvariantCulture) + " MiB");
        }
    }

    private static string Offset(CanopyRemoteHandler handler, double fraction, string column) {
        var total = handler.Provider.CountAsync(new CanopyDataRequest(handler.Schema), default).AsTask().GetAwaiter().GetResult();
        var offset = Math.Max(0, (int)((total - 200) * fraction));
        return "{\"offset\":" + offset + ",\"limit\":200,\"sort\":[{\"column\":\"" + column + "\",\"direction\":\"asc\"}]}";
    }

    private sealed class CountingStream : Stream {
        private long _length;
        public override bool CanRead => false;
        public override bool CanSeek => false;
        public override bool CanWrite => true;
        public override long Length => _length;
        public override long Position { get => _length; set => throw new NotSupportedException(); }
        public override void Flush() { }
        public override int Read(byte[] buffer, int offset, int count) => throw new NotSupportedException();
        public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
        public override void SetLength(long value) => throw new NotSupportedException();
        public override void Write(byte[] buffer, int offset, int count) => _length += count;
    }
}
