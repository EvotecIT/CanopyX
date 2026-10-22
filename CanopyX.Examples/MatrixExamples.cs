using System.Globalization;
using CanopyX.Html;
using CanopyX.Rendering;

namespace CanopyX.Examples;

/// <summary>
/// Status matrices with invented data (docs/matrix.md): replication between 150 domain controllers grouped by site (a square
/// matrix), services by servers with phone cards, and 400 policies by 40 domain controllers that opens on the problems only.
/// matrix-replication.html, matrix-services.html, matrix-consistency.html (each with a dark page), and matrix-static.html.
/// </summary>
internal static class MatrixExamples {
    private static readonly string[] Sites = { "Oslo", "Lyon", "Rome", "Porto", "Gdansk", "Vienna", "Dublin", "Tallinn", "Malmo", "Brno", "Ghent", "Turku" };

    internal static void Write(string output) {
        // The pages set no height: each matrix fills the window, and a matrix whose rows fit is only as tall as they are (AutoHeight).
        foreach (var theme in new[] { CanopyTheme.Light, CanopyTheme.Dark }) {
            var suffix = theme == CanopyTheme.Dark ? "-dark" : string.Empty;
            Replication().SaveHtmlPage(Path.Combine(output, "matrix-replication" + suffix + ".html"), new CanopyHtmlOptions { Title = "Inbound replication", Theme = theme });
            Services().SaveHtmlPage(Path.Combine(output, "matrix-services" + suffix + ".html"), new CanopyHtmlOptions { Title = "Services by server", Theme = theme });
            Consistency().SaveHtmlPage(Path.Combine(output, "matrix-consistency" + suffix + ".html"), new CanopyHtmlOptions { Title = "Policy consistency", Theme = theme });
        }

        // Plain N by N matrices for the scroll benchmarks (tests/browser/bench/matrix-benchmark.mjs, matrix-performance.spec.mjs).
        foreach (var size in new[] { 150, 400 }) Bench(size).SaveHtmlPage(Path.Combine(output, "large", "matrix-" + size + ".html"), new CanopyHtmlOptions { Title = "Matrix " + size, Height = "820px" });

        // The static fallback for email, print and Office, as a host would put it in a message body: tone cells, the servers grouped
        // by site (heading rows with their counts and totals) and the services grouped by tier (bands), then the long list form.
        var services = Services(24);
        services.Columns.GroupBy = "tier";
        foreach (var (name, theme, background) in new[] { ("matrix-static.html", new CanopyStaticTheme(), "#ffffff"), ("matrix-static-dark.html", CanopyStaticTheme.Dark(), "#16181c") }) {
            var page = "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\"><title>Matrix static fallback</title></head><body style=\"font-family:Calibri,Arial,sans-serif;margin:16px;background:" + background + "\">" +
                CanopyStaticHtml.RenderMatrix(services, new CanopyStaticHtmlOptions { Theme = theme }) + "<br>" + CanopyStaticHtml.RenderMatrix(Consistency(), new CanopyStaticHtmlOptions { Theme = theme }) + "</body></html>";
            File.WriteAllText(Path.Combine(output, name), page, new System.Text.UTF8Encoding(false));
        }
    }

    /// <summary>A plain N by N matrix with random states, about 8% needing attention and 10% without data, for the benchmarks.</summary>
    internal static CanopyMatrix Bench(int size) {
        var matrix = new CanopyMatrix("bench-" + size.ToString(CultureInfo.InvariantCulture), "Matrix " + size.ToString(CultureInfo.InvariantCulture));
        matrix.State("failing", "Failing", CanopyTone.Danger, CanopyMatrixSymbol.Cross, attention: true).State("warning", "Warning", CanopyTone.Warning, CanopyMatrixSymbol.Warning, attention: true)
            .State("ok", "Healthy", CanopyTone.Success, CanopyMatrixSymbol.Check);
        for (var i = 0; i < size; i++) {
            matrix.Rows.Item("r" + i.ToString(CultureInfo.InvariantCulture), "Entity " + (i + 1).ToString("000", CultureInfo.InvariantCulture));
            matrix.Columns.Item("c" + i.ToString(CultureInfo.InvariantCulture), "Target " + (i + 1).ToString("000", CultureInfo.InvariantCulture));
        }

        var random = new Random(size);
        for (var r = 0; r < size; r++) {
            for (var c = 0; c < size; c++) {
                var roll = random.Next(100);
                if (roll < 10) continue;
                matrix.Set(matrix.Rows.Items[r].Id, matrix.Columns.Items[c].Id, roll < 13 ? "failing" : roll < 18 ? "warning" : "ok");
            }
        }

        return matrix;
    }

    /// <summary>Inbound replication: destination by source domain controller, links within a site and between site bridgeheads.</summary>
    internal static CanopyMatrix Replication(int count = 150) {
        var matrix = new CanopyMatrix("replication", "Inbound replication") { Square = true, CellWidth = 30 };
        matrix.State("failing", "Failing", CanopyTone.Danger, CanopyMatrixSymbol.Cross, attention: true)
            .State("delayed", "Delayed", CanopyTone.Warning, CanopyMatrixSymbol.Clock, attention: true)
            .State("healthy", "Healthy", CanopyTone.Success, CanopyMatrixSymbol.Check);
        matrix.Rows.Title = "Destination";
        matrix.Columns.Title = "Source";
        matrix.Rows.Noun = "domain controllers";
        matrix.Rows.GroupCount = "[one]{count} domain controller[other]{count} domain controllers";
        matrix.Rows.Attribute("site", "Site", facet: true).Attribute("domain", "Domain", facet: true);
        matrix.Rows.GroupBy = "site";
        matrix.Rows.SortBy = CanopyMatrix.SortByLabel;
        var random = new Random(150);
        var sites = new List<string>();
        for (var i = 0; i < count; i++) {
            var site = Sites[i % Sites.Length];
            var id = "dc" + (i + 1).ToString("000", CultureInfo.InvariantCulture);
            sites.Add(site);
            var domain = i % 5 == 0 ? "emea.example.net" : "corp.example.net";
            matrix.Rows.Item(id, "DC" + (i + 1).ToString("000", CultureInfo.InvariantCulture), item => {
                item.Value("site", site).Value("domain", domain);
                item.Secondary = site.ToLowerInvariant() + "." + domain;
            });
        }

        for (var r = 0; r < count; r++) {
            for (var c = 0; c < count; c++) {
                if (r == c) continue;
                var sameSite = sites[r] == sites[c];
                var bridgeheads = r % Sites.Length == r && c % Sites.Length == c;
                if (!sameSite && !(bridgeheads || (r < Sites.Length * 2 && c < Sites.Length * 2 && random.Next(3) == 0))) continue;
                var roll = random.Next(100);
                var cell = matrix.Set(matrix.Rows.Items[r].Id, matrix.Rows.Items[c].Id, roll < 3 ? "failing" : roll < 8 ? "delayed" : "healthy");
                if (roll < 3) cell.Text = (1 + random.Next(9)).ToString(CultureInfo.InvariantCulture);
                if (roll < 3) cell.Title = "The last " + cell.Text + " attempts failed: the RPC server is unavailable.";
                if (roll >= 3 && roll < 8) cell.Value = 15 + random.Next(170);
                cell.Detail("Last success", new DateTime(2026, 10, 20, 6, 0, 0, DateTimeKind.Utc).AddMinutes(-random.Next(600)).ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture) + " UTC");
            }
        }

        return matrix;
    }

    /// <summary>Services by server: a probe state per pair, servers grouped by site, a card per server on phones.</summary>
    internal static CanopyMatrix Services(int servers = 60) {
        var matrix = new CanopyMatrix("services", "Services by server") { Phone = CanopyMatrixPhoneLayout.Cards, CellWidth = 44 };
        matrix.State("critical", "Critical", CanopyTone.Danger, CanopyMatrixSymbol.Cross, attention: true)
            .State("warning", "Warning", CanopyTone.Warning, CanopyMatrixSymbol.Warning, attention: true)
            .State("paused", "In maintenance", CanopyTone.Info, CanopyMatrixSymbol.Pause)
            .State("ok", "Running", CanopyTone.Success, CanopyMatrixSymbol.Check)
            .State("absent", "Not installed", CanopyTone.Muted, CanopyMatrixSymbol.Dash);
        matrix.Rows.Title = "Server";
        matrix.Rows.Noun = "servers";
        matrix.Rows.GroupCount = "[one]{count} server[other]{count} servers";
        matrix.Rows.Attribute("site", "Site", facet: true).Attribute("role", "Role", facet: true);
        matrix.Rows.GroupBy = "site";
        matrix.Columns.Title = "Service";
        matrix.Columns.Attribute("tier", "Tier", facet: true);
        var services = new[] { ("dns", "DNS", "Core"), ("ldap", "LDAP", "Core"), ("kdc", "Kerberos", "Core"), ("ntp", "Time", "Core"), ("smb", "File sharing", "Platform"),
            ("print", "Print spooler", "Platform"), ("web", "Web server", "Apps"), ("sql", "Database", "Apps"), ("backup", "Backup agent", "Ops"), ("av", "Antivirus", "Ops"),
            ("patch", "Update agent", "Ops"), ("mon", "Monitoring agent", "Ops"), ("cert", "Certificate service", "Platform"), ("vpn", "Remote access", "Platform") };
        foreach (var (id, label, tier) in services) matrix.Columns.Item(id, label, column => column.Value("tier", tier));
        var random = new Random(60);
        var roles = new[] { "Domain controller", "File server", "Application server" };
        for (var i = 0; i < servers; i++) {
            var role = roles[i % roles.Length];
            var site = Sites[i % 6];
            var id = "srv" + (i + 1).ToString("00", CultureInfo.InvariantCulture);
            matrix.Rows.Item(id, "SRV-" + site.Substring(0, 3).ToUpperInvariant() + "-" + (i + 1).ToString("00", CultureInfo.InvariantCulture), server => server.Value("site", site).Value("role", role));
            var paused = random.Next(15) == 0;
            foreach (var (service, _, tier) in services) {
                var installed = tier == "Core" ? role == "Domain controller" : tier == "Apps" ? role == "Application server" : true;
                if (!installed) { matrix.Set(id, service, "absent"); continue; }
                var roll = random.Next(100);
                var cell = matrix.Set(id, service, paused ? "paused" : roll < 3 ? "critical" : roll < 9 ? "warning" : "ok");
                if (!paused && roll < 9) cell.Text = (roll < 3 ? 3 : 1 + random.Next(2)).ToString(CultureInfo.InvariantCulture) + "/3";
                if (!paused && roll < 9) cell.Title = "Probes failing: " + cell.Text + ".";
            }
        }

        return matrix;
    }

    /// <summary>Policy consistency: 400 policies by 40 domain controllers, opening on the policies and controllers that differ.</summary>
    internal static CanopyMatrix Consistency(int policies = 400, int controllers = 40) {
        var matrix = new CanopyMatrix("consistency", "Policy consistency") { AttentionOnly = true, CellWidth = 28, Density = CanopyGridDensity.Compact };
        matrix.State("differs", "Differs", CanopyTone.Danger, CanopyMatrixSymbol.Cross, attention: true)
            .State("missing", "Missing", CanopyTone.Warning, CanopyMatrixSymbol.Warning, attention: true)
            .State("same", "In sync", CanopyTone.Success, CanopyMatrixSymbol.Dot);
        matrix.Rows.Title = "Policy";
        matrix.Rows.Noun = "policies";
        matrix.Rows.Attribute("area", "Area", facet: true).Attribute("changed", "Last changed", CanopyColumnKind.DateTime);
        matrix.Rows.SortBy = CanopyMatrix.SortByTotal;
        matrix.Rows.SortDescending = true;
        matrix.Columns.Title = "Domain controller";
        matrix.Columns.Attribute("site", "Site", facet: true);
        matrix.Columns.GroupBy = "site";
        var areas = new[] { "Security", "Network", "Desktop", "Servers", "Browsers" };
        var random = new Random(400);
        for (var c = 0; c < controllers; c++) {
            matrix.Columns.Item("dc" + (c + 1).ToString("00", CultureInfo.InvariantCulture), "DC" + (c + 1).ToString("00", CultureInfo.InvariantCulture), column => column.Value("site", Sites[c % 4]));
        }

        for (var p = 0; p < policies; p++) {
            var id = "gpo" + (p + 1).ToString("000", CultureInfo.InvariantCulture);
            matrix.Rows.Item(id, areas[p % areas.Length] + " baseline " + (p + 1).ToString("000", CultureInfo.InvariantCulture), policy => policy
                .Value("area", areas[p % areas.Length]).Value("changed", new DateTime(2026, 10, 1, 0, 0, 0, DateTimeKind.Utc).AddHours(-random.Next(24 * 60))));
            var drift = random.Next(12) == 0;
            for (var c = 0; c < controllers; c++) {
                var roll = random.Next(100);
                var state = drift && roll < 25 ? "differs" : drift && roll < 32 ? "missing" : "same";
                var cell = matrix.Set(id, matrix.Columns.Items[c].Id, state);
                if (state == "differs") cell.Detail("Version here", (12 + random.Next(4)).ToString(CultureInfo.InvariantCulture)).Detail("Version at the primary", "16");
            }
        }

        return matrix;
    }
}
