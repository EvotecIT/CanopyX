using CanopyX;
using CanopyX.AspNetCore;
using CanopyX.Data;
using CanopyX.Html;
using FleetInventory;
using Microsoft.EntityFrameworkCore;

// Fleet inventory: CanopyX grids in remote mode over SQLite and EF Core, with an editable page and a two-level grouped page.
// Options (command line or environment): --database <path> (default: fleet.db in the temp folder), --rows <count> (default 100000).
// --bench times typical requests in process and exits; --sql also prints the SQL that EF Core sends.
var bench = args.Contains("--bench");
var builder = WebApplication.CreateBuilder(args.Where(arg => arg != "--bench" && arg != "--sql").ToArray());
var database = builder.Configuration["database"] ?? Path.Combine(Path.GetTempPath(), "canopyx-fleet", "fleet.db");
var rows = int.TryParse(builder.Configuration["rows"], out var count) && count > 0 ? count : 100000;
Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(database))!);
var sql = args.Contains("--sql");
var connectionString = "Data Source=" + database;
builder.Services.AddDbContext<FleetDb>(options => {
    options.UseSqlite(connectionString).UseQueryTrackingBehavior(QueryTrackingBehavior.NoTracking);
    if (sql) options.LogTo(Console.WriteLine, new[] { DbLoggerCategory.Database.Command.Name }, LogLevel.Information);
});

var app = builder.Build();
using (var scope = app.Services.CreateScope()) FleetSeed.Ensure(scope.ServiceProvider.GetRequiredService<FleetDb>(), rows);
if (bench) {
    await Bench.RunAsync(app.Services);
    return;
}

// Every saved row increments the revision in the database, so readers of an older revision reload instead of mixing snapshots.
var revision = new FleetRevision(connectionString);
revision.Ensure();
var grids = new[] {
    (Path: "/", Endpoint: "/api/machines", View: FleetGrid.View("machines", "Machines", grouped: false), Note: (Func<CanopyTheme, string>?)null),
    (Path: "/by-site", Endpoint: "/api/machines-by-site", View: FleetGrid.View("machines-by-site", "Machines by site", grouped: true), Note: null),
    (Path: "/edit", Endpoint: "/api/machines-edit", View: FleetGrid.EditableView(), Note: FleetDemo.EditNote),
    (Path: "/by-site-os", Endpoint: "/api/machines-by-site-os", View: FleetGrid.GroupedView(), Note: FleetDemo.GroupNote)
};
foreach (var grid in grids) {
    var map = FleetGrid.Map(grid.View);
    var editable = map.Schema.EditableColumns.Count > 0;
    app.MapCanopyRemote(grid.Endpoint, http => http.RequestServices.GetRequiredService<FleetDb>().Machines, map, options => {
        options.Query.Executor = new EfCoreExecutor();
        options.Query.Revision = revision.ReadAsync;
        options.Limits.MaxPageSize = 1000;
        options.Limits.MaxExportRows = 250000;
        // The sample has no sign-in. Real hosts keep the default, which requires authorization, or name a policy.
        options.AllowAnonymous = true;
        if (!editable) return;
        options.Writer = http => {
            var db = http.RequestServices.GetRequiredService<FleetDb>();
            return new CanopyQueryableWriter<Machine>(map, new EfCoreWriteStore<Machine>(db), new CanopyQueryableWriterOptions<Machine> {
                Revision = revision.ReadAsync,
                Saving = async (_, token) => { await FleetRevision.IncrementAsync(db, token); return null; },
                Failed = (row, error) => http.RequestServices.GetRequiredService<ILoggerFactory>().CreateLogger("FleetInventory").LogError(error, "Machine {Id} was not saved.", row.Id)
            });
        };
        // Real hosts name the policy that may write (options.WriteAuthorizationPolicy = "Inventory.Write"); the sample has no sign-in.
        options.AllowAnonymousWrites = true;
    });
    var light = FleetGrid.Page(grid.View, map.Schema, grid.Endpoint, CanopyTheme.Light, grid.Note?.Invoke(CanopyTheme.Light));
    var dark = FleetGrid.Page(grid.View, map.Schema, grid.Endpoint, CanopyTheme.Dark, grid.Note?.Invoke(CanopyTheme.Dark));
    app.MapGet(grid.Path, (HttpContext http) => Results.Content(http.Request.Query["theme"] == "dark" ? dark : light, "text/html; charset=utf-8"));
}

// The conflict demonstration of the editable page. The custom header keeps other sites' forms from calling it.
app.MapPost("/api/demo/other-user/{id:int}", async (int id, HttpContext http, FleetDb db) => {
    if (http.Request.Headers["X-Fleet-Demo"] != "1") return Results.BadRequest();
    return await FleetDemo.OtherUserAsync(db, id, http.RequestAborted) ? Results.NoContent() : Results.NotFound();
});

app.Run();
