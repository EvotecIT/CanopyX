using System.Globalization;
using CanopyX;

namespace CanopyX.Examples;

/// <summary>
/// The tree for the bundle packing benchmark (<c>tests/browser/bench/expand-benchmark.mjs</c>): a service catalog of
/// regions and services, where every service opens into sections that hold many small child lists and detail tables.
/// At the default size it has 5,000 services and about 380,000 rows under about 150,000 parents, which is the shape
/// that makes a bundle with one file per child list impractical to copy.
/// </summary>
/// <remarks>
/// Services are built one at a time from their number alone, so the same tree can be written from memory or streamed.
/// </remarks>
internal static class PackBenchTree {
    private static readonly string[] Regions = { "North", "South", "East", "West", "Central" };
    private static readonly string[] Products = { "Billing", "Catalog", "Checkout", "Identity", "Inventory", "Ledger", "Messaging", "Orders", "Pricing", "Reporting", "Routing", "Search", "Shipping", "Storage", "Telemetry" };
    private static readonly string[] Tiers = { "API", "Worker", "Gateway", "Scheduler", "Cache" };
    private static readonly string[] Areas = { "Network", "Security", "Runtime", "Logging", "Limits", "Storage" };
    private static readonly string[] Keys = { "timeout", "retries", "pool size", "buffer", "log level", "rate limit", "cache ttl", "batch size", "replicas", "window" };
    private static readonly string[] People = { "anna.kowalska", "ben.okafor", "chen.wei", "dana.levi", "erik.lund", "fatima.zahra" };
    private static readonly DateTime Now = new DateTime(2026, 9, 27, 12, 0, 0, DateTimeKind.Utc);

    /// <summary>The number of services per region at the default size.</summary>
    internal const int DefaultServicesPerRegion = 1000;

    /// <summary>Creates the view without nodes.</summary>
    internal static CanopyView View() {
        var view = new CanopyView("catalog", "Service catalog") { Search = new CanopySearchOptions { Placeholder = "Search services and releases" }, DeepLink = true };
        view.Columns.Add(new CanopyColumn("name", "Name") { Width = 380, Sortable = true });
        view.Columns.Add(new CanopyColumn("state", "State") { Width = 120 });
        view.Columns.Add(new CanopyColumn("changed", "Changed") { Kind = CanopyColumnKind.DateTime, Width = 170, Sortable = true });
        view.Columns.Add(new CanopyColumn("by", "Changed by") { Width = 150 });
        view.Columns.Add(new CanopyColumn("items", "Items") { Kind = CanopyColumnKind.Number, Width = 90 });
        return view;
    }

    /// <summary>The region nodes without their services.</summary>
    internal static IEnumerable<CanopyNode> RegionNodes(int servicesPerRegion) {
        for (var r = 0; r < Regions.Length; r++) {
            var region = new CanopyNode(RegionId(r), Regions[r] + " region") { Kind = "region", Group = true };
            region.Cells["items"] = servicesPerRegion;
            yield return region;
        }
    }

    /// <summary>The services of a region, each with its complete subtree, built as the caller enumerates them.</summary>
    internal static IEnumerable<CanopyNode> Services(int region, int servicesPerRegion) {
        for (var s = 0; s < servicesPerRegion; s++) {
            yield return Service(region, s);
        }
    }

    /// <summary>The number of the region a region node was created for.</summary>
    internal static int RegionNumber(CanopyNode region) => int.Parse(region.Id.Substring(7), CultureInfo.InvariantCulture);

    private static string RegionId(int region) => "region-" + region.ToString(CultureInfo.InvariantCulture);

    private static CanopyNode Service(int region, int number) {
        var random = new Lcg(unchecked((uint)(region * 100003 + number) * 2654435761u + 97u));
        var id = "svc-" + region + "-" + number.ToString("0000", CultureInfo.InvariantCulture);
        var service = new CanopyNode(id, Products[random.Below(Products.Length)] + " " + Tiers[random.Below(Tiers.Length)] + " " + region + number.ToString("0000", CultureInfo.InvariantCulture)) { Kind = "service" };
        var changed = Now.AddMinutes(-random.Below(60 * 24 * 120));
        service.Cells["state"] = random.Below(10) == 0 ? new CanopyCell("degraded") { Text = "Degraded", Tone = CanopyTone.Warning } : new CanopyCell("ok") { Text = "OK", Tone = CanopyTone.Success };
        service.Cells["changed"] = changed;
        service.Cells["by"] = People[random.Below(People.Length)];
        service.Children.Add(Releases(id, changed, ref random));
        service.Children.Add(Configuration(id, ref random));
        service.Children.Add(Endpoints(id, ref random));
        service.Children.Add(Access(id, ref random));
        service.Children.Add(Health(id, ref random));
        return service;
    }

    private static CanopyNode Releases(string id, DateTime changed, ref Lcg random) {
        var section = Section(id + "/releases", "Releases");
        var count = 4 + random.Below(5);
        for (var r = count; r >= 1; r--) {
            var release = new CanopyNode(section.Id + "/" + r, "Release " + r + " " + Areas[random.Below(Areas.Length)].ToLowerInvariant() + " update") { Kind = "release" };
            release.Cells["changed"] = changed.AddDays(-(count - r) * 5);
            release.Cells["by"] = People[random.Below(People.Length)];
            var table = new CanopyTableDetail("Changes in release " + r).AddColumns("Setting", "Area", "Change", "Before", "After");
            var rows = 14 + random.Below(30);
            for (var i = 0; i < rows; i++) {
                table.AddRow(Setting(ref random), Areas[random.Below(Areas.Length)], i % 5 == 0 ? "Added" : "Changed", Value(ref random), new CanopyCell(Value(ref random)) { Tone = CanopyTone.Success });
            }

            release.Children.Add(new CanopyNode(release.Id + "/changes", "Changes") { Kind = "detail", Detail = table });
            section.Children.Add(release);
        }

        section.Cells["items"] = count;
        return section;
    }

    private static CanopyNode Configuration(string id, ref Lcg random) {
        var section = Section(id + "/configuration", "Configuration");
        var count = 4 + random.Below(3);
        for (var g = 0; g < count; g++) {
            var group = new CanopyNode(section.Id + "/" + g, Areas[g % Areas.Length]) { Kind = "settings" };
            var table = new CanopyTableDetail().AddColumns("Setting", "Scope", "Value", "Source");
            var rows = 26 + random.Below(40);
            for (var i = 0; i < rows; i++) {
                table.AddRow(Setting(ref random), i % 3 == 0 ? "Region" : "Service", Value(ref random), "Policy " + random.Below(400).ToString("000", CultureInfo.InvariantCulture) + " / " + Areas[random.Below(Areas.Length)]);
            }

            group.Cells["items"] = rows;
            group.Children.Add(new CanopyNode(group.Id + "/table", "Settings") { Kind = "detail", Detail = table });
            section.Children.Add(group);
        }

        section.Cells["items"] = count;
        return section;
    }

    private static CanopyNode Endpoints(string id, ref Lcg random) {
        var section = Section(id + "/endpoints", "Endpoints");
        var count = 10 + random.Below(7);
        for (var e = 0; e < count; e++) {
            var endpoint = new CanopyNode(section.Id + "/" + e, "https://" + Regions[random.Below(Regions.Length)].ToLowerInvariant() + "-" + e + ".example.test/v" + (1 + random.Below(4))) { Kind = "endpoint" };
            endpoint.Cells["state"] = random.Below(12) == 0 ? new CanopyCell("off") { Text = "Disabled", Tone = CanopyTone.Muted } : "Enabled";
            var properties = new CanopyPropertiesDetail()
                .Add("Protocol", e % 4 == 0 ? "gRPC" : "HTTPS")
                .Add("Certificate", "CN=" + id + "-" + e + ".example.test, valid until 2027-0" + (1 + random.Below(9)) + "-15")
                .Add("Allowed callers", People[random.Below(People.Length)] + ", " + People[random.Below(People.Length)] + ", service accounts of " + Products[random.Below(Products.Length)])
                .Add("Rate limit", (100 * (1 + random.Below(50))).ToString("#,0", CultureInfo.InvariantCulture) + " requests per minute, burst " + (10 * (1 + random.Below(40))))
                .Add("Notes", "Reviewed " + Now.AddDays(-random.Below(300)).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) + "; next review after the " + Areas[random.Below(Areas.Length)].ToLowerInvariant() + " change window.");
            endpoint.Children.Add(new CanopyNode(endpoint.Id + "/properties", "Properties") { Kind = "detail", Detail = properties });
            section.Children.Add(endpoint);
        }

        section.Cells["items"] = count;
        return section;
    }

    private static CanopyNode Access(string id, ref Lcg random) {
        var section = Section(id + "/access", "Access");
        var count = 16 + random.Below(9);
        for (var a = 0; a < count; a++) {
            var grant = new CanopyNode(section.Id + "/" + a, (a % 3 == 0 ? "Group " : "User ") + People[random.Below(People.Length)] + " " + a) { Kind = "grant" };
            grant.Cells["state"] = a % 5 == 0 ? "Write" : "Read";
            section.Children.Add(grant);
        }

        var table = new CanopyTableDetail("Inherited access").AddColumns("Principal", "Permission", "Inherited from");
        for (var i = 0; i < 8; i++) {
            table.AddRow("Role " + Areas[random.Below(Areas.Length)] + " operators " + i, i % 2 == 0 ? "Read" : "Operate", Regions[random.Below(Regions.Length)] + " region policy " + random.Below(90));
        }

        section.Children.Add(new CanopyNode(section.Id + "/inherited", "Inherited access") { Kind = "detail", Detail = table });
        section.Cells["items"] = count;
        return section;
    }

    private static CanopyNode Health(string id, ref Lcg random) {
        var section = Section(id + "/health", "Health");
        var table = new CanopyTableDetail().AddColumns("Instance", "Version", "Last check", "In sync");
        var rows = 4 + random.Below(9);
        for (var i = 0; i < rows; i++) {
            var inSync = random.Below(15) != 0;
            table.AddRow("instance-" + i + "." + id + ".example.test", "4." + random.Below(20) + "." + random.Below(300), Now.AddMinutes(-random.Below(600)).ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture) + " UTC",
                new CanopyCell(inSync) { Text = inSync ? "Yes" : "No", Tone = inSync ? CanopyTone.Success : CanopyTone.Danger });
        }

        section.Children.Add(new CanopyNode(section.Id + "/table", "Health") { Kind = "detail", Detail = table });
        section.Cells["items"] = rows;
        return section;
    }

    private static CanopyNode Section(string id, string label) => new CanopyNode(id, label) { Kind = "section" };

    private static string Setting(ref Lcg random) => Areas[random.Below(Areas.Length)] + " / " + Keys[random.Below(Keys.Length)] + " " + random.Below(40);

    private static string Value(ref Lcg random) => random.Below(3) == 0
        ? (random.Below(5000) + 1).ToString(CultureInfo.InvariantCulture) + " ms"
        : "profile-" + random.Below(9000).ToString("0000", CultureInfo.InvariantCulture) + "-" + Tiers[random.Below(Tiers.Length)].ToLowerInvariant();

    /// <summary>A linear congruential generator, so the tree is the same on every machine and runtime.</summary>
    private struct Lcg {
        private uint _state;

        internal Lcg(uint seed) {
            _state = seed;
        }

        internal int Below(int limit) {
            _state = unchecked(_state * 1664525u + 1013904223u);
            return (int)((_state >> 8) % (uint)limit);
        }
    }
}
