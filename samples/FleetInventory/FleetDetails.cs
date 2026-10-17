using Microsoft.Data.Sqlite;

namespace FleetInventory;

/// <summary>A rack: the machines mounted together, shown as a machine's related records.</summary>
public sealed class Rack {
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public List<Machine> Machines { get; set; } = new List<Machine>();
}

/// <summary>A program installed on a machine: a paged collection of the machine's record.</summary>
public sealed class InstalledSoftware {
    public int Id { get; set; }
    public int MachineId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Version { get; set; } = string.Empty;
    public string? Publisher { get; set; }
    public DateTime? InstalledOn { get; set; }
}

/// <summary>A maintenance visit: the machine's timeline.</summary>
public sealed class MaintenanceEvent {
    public int Id { get; set; }
    public int MachineId { get; set; }
    public DateTime At { get; set; }
    public string Kind { get; set; } = string.Empty;
    public string Summary { get; set; } = string.Empty;
    public string? Technician { get; set; }
}

/// <summary>A configuration change: the machine's before/after list.</summary>
public sealed class ConfigurationChange {
    public int Id { get; set; }
    public int MachineId { get; set; }
    public DateTime At { get; set; }
    public string Setting { get; set; } = string.Empty;
    public string? Before { get; set; }
    public string? After { get; set; }
}

/// <summary>Seeds the record details of every machine with prepared inserts, from a random sequence of their own so the machines
/// themselves stay the rows earlier sample databases had.</summary>
public static class FleetDetailsSeed {
    public const int RackSize = 20;
    private static readonly (string Name, string? Publisher)[] Programs = {
        ("Office suite", "Northwind"), ("Mail client", "Northwind"), ("Browser", "Open Web"), ("Database server", "Contoso"), ("Backup agent", "Fabrikam"),
        ("Monitoring agent", "Fabrikam"), ("Antivirus", "Litware"), ("PDF reader", "Adatum"), ("Compiler", "Open Source"), ("Container runtime", "Open Source"),
        ("Remote desktop", "Contoso"), ("VPN client", "Litware"), ("Spreadsheet tools", "Northwind"), ("Image editor", "Adatum"), ("Media player", "Open Web"),
        ("Password manager", "Litware"), ("Log shipper", "Fabrikam"), ("Web server", "Open Source"), ("Message broker", "Contoso"), ("Scripting runtime", "Open Source"),
        ("Device drivers", null), ("Firmware tools", null), ("Text editor", "Open Source"), ("Diagram tool", "Adatum")
    };
    // Each visit's summary with the kind it is, so a timeline tag always fits its event.
    private static readonly (string Summary, string Kind)[] Visits = {
        ("Replaced a fan", "Repair"), ("Cleaned filters", "Inspection"), ("Upgraded memory", "Upgrade"), ("Replaced a disk", "Repair"),
        ("Updated firmware", "Upgrade"), ("Checked cabling", "Inspection"), ("Power supply failed", "Failure"), ("Disk reported read errors", "Failure"),
        ("Routine health check", "Inspection"), ("Replaced the power supply", "Repair")
    };
    private static readonly string[] OperatingSystems = { "Windows", "Linux", "macOS", "FreeBSD" };
    private static readonly string[] SiteNames = { "Amsterdam", "Austin", "Berlin", "Singapore", "São Paulo", "Sydney", "Toronto", "Warsaw" };
    private static readonly string[] TeamNames = { "Platform", "Data", "Payments", "Identity", "Edge", "Research", "Support" };
    private static readonly string[] BackupPlans = { "None", "Weekly", "Daily", "Hourly" };
    private static readonly string[] Technicians = { "Alex", "Sam", "Robin", "Kim", "Jordan", "Taylor" };
    private static readonly string[] Settings = { "Memory (GB)", "Cores", "Operating system", "Site", "Team", "Backup plan" };
    private static readonly string[] Notes = { "Spare parts kept on site.", "Scheduled for replacement next quarter.", "Hosts a shared build cache.", "Keep online during business hours.", "Battery replaced last year." };

    /// <summary>The values of a machine's own detail columns, from the details sequence.</summary>
    public static (string Serial, string Purchased, string? Notes, int? Rack, int? Replaces) Machine(Random random, int id, DateTime now) {
        var serial = "SN-" + random.Next(10000000, 99999999).ToString(System.Globalization.CultureInfo.InvariantCulture);
        var purchased = now.AddDays(-random.Next(30, 2400)).Date.ToString("yyyy-MM-dd HH:mm:ss", System.Globalization.CultureInfo.InvariantCulture);
        var notes = random.Next(3) == 0 ? Notes[random.Next(Notes.Length)] : null;
        int? rack = random.Next(10) == 0 ? null : 1 + (id - 1) / RackSize;
        int? replaces = id > 1000 && random.Next(8) == 0 ? random.Next(1, id) : null;
        return (serial, purchased, notes, rack, replaces);
    }

    /// <summary>Inserts the racks machines are mounted in.</summary>
    public static void InsertRacks(SqliteConnection connection, SqliteTransaction transaction, int rows) {
        using var rack = Command(connection, transaction, "INSERT INTO Racks (Id, Name) VALUES ($id, $name)", out var p);
        for (var i = 1; i <= (rows + RackSize - 1) / RackSize; i++) { p[0].Value = i; p[1].Value = "Rack " + i.ToString("D4", System.Globalization.CultureInfo.InvariantCulture); rack.ExecuteNonQuery(); }
    }

    /// <summary>Inserts every machine's software, maintenance events and configuration changes.</summary>
    public static void Insert(SqliteConnection connection, SqliteTransaction transaction, int rows, DateTime now) {
        var random = new Random(4242);
        var history = new Random(4343);
        var current = CurrentValues(connection, transaction, rows);
        using var software = Command(connection, transaction, "INSERT INTO InstalledSoftware (MachineId, Name, Version, Publisher, InstalledOn) VALUES ($machine, $name, $version, $publisher, $installed)", out var s);
        using var events = Command(connection, transaction, "INSERT INTO MaintenanceEvents (MachineId, At, Kind, Summary, Technician) VALUES ($machine, $at, $kind, $summary, $technician)", out var e);
        using var changes = Command(connection, transaction, "INSERT INTO ConfigurationChanges (MachineId, At, Setting, Before, After) VALUES ($machine, $at, $setting, $before, $after)", out var c);
        for (var machine = 1; machine <= rows; machine++) {
            // Every seventh machine carries a long software list, so its record pages with Load more.
            var programs = machine % 7 == 1 ? 18 + random.Next(7) : 1 + random.Next(9);
            var start = random.Next(Programs.Length);
            for (var i = 0; i < programs; i++) {
                var (name, publisher) = Programs[(start + i) % Programs.Length];
                s[0].Value = machine; s[1].Value = name; s[2].Value = random.Next(1, 12) + "." + random.Next(0, 20);
                s[3].Value = (object?)publisher ?? DBNull.Value;
                s[4].Value = random.Next(12) == 0 ? DBNull.Value : Date(now.AddDays(-random.Next(1, 900)));
                software.ExecuteNonQuery();
            }
            for (var i = random.Next(7); i > 0; i--) {
                var (summary, kind) = Visits[random.Next(Visits.Length)];
                e[0].Value = machine; e[1].Value = Date(now.AddMinutes(-random.Next(60, 60 * 24 * 400))); e[2].Value = kind;
                e[3].Value = summary; e[4].Value = random.Next(6) == 0 ? DBNull.Value : Technicians[random.Next(Technicians.Length)];
                events.ExecuteNonQuery();
            }
            // Changes run back from the machine's current values: the newest change of a setting ends on its value today, and each
            // older one ends where the next one starts, in the setting's own type and unit.
            var values = new Dictionary<string, string?>(current[machine - 1]);
            var at = now;
            for (var i = history.Next(5); i > 0; i--) {
                var setting = Settings[history.Next(Settings.Length)];
                if (!values.TryGetValue(setting, out var after) || after == null) continue;
                var before = Earlier(history, setting, after);
                at = at.AddMinutes(-history.Next(60, 60 * 24 * 50));
                c[0].Value = machine; c[1].Value = Date(at); c[2].Value = setting;
                c[3].Value = (object?)before ?? DBNull.Value; c[4].Value = after;
                changes.ExecuteNonQuery();
                values[setting] = before;
            }
        }
    }

    /// <summary>Each machine's values today for the settings its changes record, as the grid shows them.</summary>
    private static List<Dictionary<string, string?>> CurrentValues(SqliteConnection connection, SqliteTransaction transaction, int rows) {
        var values = new List<Dictionary<string, string?>>(rows);
        using var read = connection.CreateCommand();
        read.Transaction = transaction;
        read.CommandText = "SELECT Id, Site, Os, Cores, MemoryGb, TeamId FROM Machines ORDER BY Id";
        using var reader = read.ExecuteReader();
        var plans = new Random(4444);
        while (reader.Read()) {
            values.Add(new Dictionary<string, string?> {
                ["Site"] = reader.IsDBNull(1) ? null : reader.GetString(1),
                ["Operating system"] = OperatingSystems[reader.GetInt32(2)],
                ["Cores"] = reader.IsDBNull(3) ? null : reader.GetInt32(3).ToString(System.Globalization.CultureInfo.InvariantCulture),
                ["Memory (GB)"] = Number(reader.GetDouble(4)),
                ["Team"] = reader.IsDBNull(5) ? null : TeamNames[reader.GetInt32(5) - 1],
                ["Backup plan"] = BackupPlans[1 + plans.Next(BackupPlans.Length - 1)]
            });
        }
        return values;
    }

    /// <summary>A plausible value of a setting before it changed to <paramref name="after"/>; null when it was not set yet.</summary>
    private static string? Earlier(Random random, string setting, string after) {
        string Other(string[] choices) { string value; do value = choices[random.Next(choices.Length)]; while (value == after); return value; }
        switch (setting) {
            case "Memory (GB)":
                var memory = double.Parse(after, System.Globalization.CultureInfo.InvariantCulture);
                return Number(memory > 2 ? Math.Round(memory / 2, 1) : memory * 2);
            case "Cores":
                var cores = int.Parse(after, System.Globalization.CultureInfo.InvariantCulture);
                return (cores > 1 ? cores / 2 : 2).ToString(System.Globalization.CultureInfo.InvariantCulture);
            case "Operating system": return Other(OperatingSystems);
            case "Site": return random.Next(6) == 0 ? null : Other(SiteNames);
            case "Team": return random.Next(6) == 0 ? null : Other(TeamNames);
            default: return Other(BackupPlans);
        }
    }

    private static string Number(double value) => value.ToString("0.#", System.Globalization.CultureInfo.InvariantCulture);

    private static string Date(DateTime value) => value.ToString("yyyy-MM-dd HH:mm:ss", System.Globalization.CultureInfo.InvariantCulture);

    private static SqliteCommand Command(SqliteConnection connection, SqliteTransaction transaction, string sql, out SqliteParameter[] parameters) {
        var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = sql;
        var names = System.Text.RegularExpressions.Regex.Matches(sql, @"\$\w+").Cast<System.Text.RegularExpressions.Match>().Select(match => match.Value).Distinct().ToArray();
        parameters = names.Select(name => command.Parameters.Add(new SqliteParameter { ParameterName = name })).ToArray();
        command.Prepare();
        return command;
    }
}
