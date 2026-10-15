using CanopyX;
using CanopyX.Data;

namespace FleetInventory;

/// <summary>The machines' record panel: drawer-only fields, installed software, maintenance history, configuration changes and
/// the machines in the same rack, all loaded from the database when a drawer opens.</summary>
public static class FleetRecords {
    /// <summary>Adds the record panel to a machines grid: its fields, sections and tabs, with details loaded on demand.</summary>
    public static void Panel(CanopyDataGridView view) {
        view.RowAction = CanopyGridRowAction.Details;
        var record = view.Record = new CanopyRecordPanel { Source = CanopyRecordSource.Host(), DeepLink = true, HeaderStatus = "online" };
        foreach (var fact in new[] { "site", "os", "team" }) record.HeaderFacts.Add(fact);
        record.Fields.Add(new CanopyColumn("serial", "Serial number"));
        record.Fields.Add(new CanopyColumn("purchased", "Purchased") { Kind = CanopyColumnKind.DateTime });
        record.Fields.Add(new CanopyColumn("notes", "Notes") { Wrap = true });
        record.Fields.Add(new CanopyColumn("replaces", "Replaces"));
        record.Fields.Add(new CanopyColumn("software", "Installed software"));
        record.Fields.Add(new CanopyColumn("maintenance", "Maintenance"));
        record.Fields.Add(new CanopyColumn("changes", "Configuration changes"));
        record.Fields.Add(new CanopyColumn("rack", "Machines in the same rack"));
        void Section(string id, string label, params string[] fields) {
            var section = new CanopyRecordSection(id, label);
            foreach (var field in fields) section.Fields.Add(field);
            record.Sections.Add(section);
        }
        Section("hardware", "Hardware", "serial", "model", "cores", "memory", "purchased");
        Section("status", "Status", "lastSeen", "notes", "replaces");
        Section("programs", "Programs", "software");
        Section("activity", "Activity", "maintenance", "changes");
        Section("related", "Rack", "rack");
        void Tab(string id, string label, params string[] sections) {
            var tab = new CanopyRecordTab(id, label);
            foreach (var section in sections) tab.Sections.Add(section);
            record.Tabs.Add(tab);
        }
        Tab("overview", "Overview", "hardware", "status");
        Tab("software", "Software", "programs");
        Tab("history", "History", "activity");
        Tab("related", "Related", "related");
    }

    /// <summary>The record allow-list: only these fields are read, each through the grid's own query for the caller.</summary>
    /// <remarks>The rack's machines and the replaced machine are reached through navigations, not through the grid's query.
    /// The sample's readers see every machine; a host whose readers see only their team's machines restricts the navigation to
    /// what every reader of the record may read (<c>m =&gt; m.Rack!.Machines.Where(peer =&gt; peer.TeamId == m.TeamId)</c>) or
    /// leaves such fields out.</remarks>
    public static CanopyRecordMap<Machine> Map(CanopyColumnMap<Machine> columns) => new CanopyRecordMap<Machine>(columns)
        .Field("serial", machine => machine.SerialNumber)
        .Field("purchased", machine => machine.PurchasedOn, Day)
        .Field("notes", machine => machine.Notes)
        .Link("replaces", machine => machine.ReplacesId, machine => machine.Replaces!.Name)
        .Collection("software", machine => machine.Software, list => list.Key(item => item.Id).OrderBy(item => item.Name)
            .Column(new CanopyColumn("name", "Program"), item => item.Name)
            .Column(new CanopyColumn("version", "Version"), item => item.Version)
            .Column(new CanopyColumn("publisher", "Publisher"), item => item.Publisher)
            .Column(new CanopyColumn("installed", "Installed") { Kind = CanopyColumnKind.DateTime }, item => item.InstalledOn, Day)
            .PageSize(10))
        .Timeline("maintenance", machine => machine.Maintenance, events => events.Key(item => item.Id).Time(item => item.At)
            .Summary(item => item.Summary).Actor(item => item.Technician)
            .Kind(item => item.Kind, kind => kind == "Failure" ? CanopyTone.Danger : kind == "Repair" ? CanopyTone.Warning : kind == "Upgrade" ? CanopyTone.Info : CanopyTone.Neutral)
            .Limit(25))
        .Changes("changes", machine => machine.Changes, changes => changes.Key(item => item.Id).Name(item => item.Setting)
            .Before(item => item.Before).After(item => item.After).OrderBy(item => item.At, descending: true).Limit(20))
        .Collection("rack", machine => machine.Rack!.Machines, list => list.Key(peer => peer.Id).OrderBy(peer => peer.Name)
            .Column(new CanopyColumn("name", "Machine"), peer => peer.Name)
            .Column(new CanopyColumn("site", "Site"), peer => peer.Site)
            .Column(new CanopyColumn("os", "Operating system"), peer => peer.Os)
            .Target("machines").PageSize(10));

    /// <summary>A date shown without its time; the raw value stays the instant, so sorting and exports keep it.</summary>
    private static CanopyCell? Day(DateTime? date) => date == null ? null
        : new CanopyCell(DateTime.SpecifyKind(date.Value, DateTimeKind.Utc)) { Text = date.Value.ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture) };
}
