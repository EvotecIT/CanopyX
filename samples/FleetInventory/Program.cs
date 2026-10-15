using CanopyX.AspNetCore;
using CanopyX.Data;
using CanopyX.Html;
using FleetInventory;
using Microsoft.EntityFrameworkCore;

// Fleet inventory: a CanopyX grid in remote mode over SQLite and EF Core.
// Options (command line or environment): --database <path> (default: fleet.db in the temp folder), --rows <count> (default 100000).
// --bench times typical requests in process and exits; --sql also prints the SQL that EF Core sends.
var bench = args.Contains("--bench");
var builder = WebApplication.CreateBuilder(args.Where(arg => arg != "--bench" && arg != "--sql").ToArray());
var database = builder.Configuration["database"] ?? Path.Combine(Path.GetTempPath(), "canopyx-fleet", "fleet.db");
var rows = int.TryParse(builder.Configuration["rows"], out var count) && count > 0 ? count : 100000;
Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(database))!);
var sql = args.Contains("--sql");
builder.Services.AddDbContext<FleetDb>(options => {
    options.UseSqlite("Data Source=" + database).UseQueryTrackingBehavior(QueryTrackingBehavior.NoTracking);
    if (sql) options.LogTo(Console.WriteLine, new[] { DbLoggerCategory.Database.Command.Name }, LogLevel.Information);
});

var app = builder.Build();
using (var scope = app.Services.CreateScope()) FleetSeed.Ensure(scope.ServiceProvider.GetRequiredService<FleetDb>(), rows);
if (bench) {
    await Bench.RunAsync(app.Services);
    return;
}

// The sample data is read-only, so one revision per process is exact. A writable store changes it with every write.
var revision = "seed-" + DateTime.UtcNow.Ticks.ToString(System.Globalization.CultureInfo.InvariantCulture);
var grids = new[] {
    (Path: "/", Endpoint: "/api/machines", View: FleetGrid.View("machines", "Machines", grouped: false)),
    (Path: "/by-site", Endpoint: "/api/machines-by-site", View: FleetGrid.View("machines-by-site", "Machines by site", grouped: true))
};
foreach (var grid in grids) {
    var map = FleetGrid.Map(grid.View);
    app.MapCanopyRemote(grid.Endpoint, http => http.RequestServices.GetRequiredService<FleetDb>().Machines, map, options => {
        options.Query.Executor = new EfCoreExecutor();
        options.Query.Revision = _ => new ValueTask<string>(revision);
        options.Limits.MaxPageSize = 1000;
        options.Limits.MaxExportRows = 250000;
        // The sample has no sign-in. Real hosts keep the default, which requires authorization, or name a policy.
        options.AllowAnonymous = true;
    });
    var light = FleetGrid.Page(grid.View, map.Schema, grid.Endpoint, CanopyTheme.Light);
    var dark = FleetGrid.Page(grid.View, map.Schema, grid.Endpoint, CanopyTheme.Dark);
    app.MapGet(grid.Path, (HttpContext http) => Results.Content(http.Request.Query["theme"] == "dark" ? dark : light, "text/html; charset=utf-8"));
}

app.Run();
