using System.Globalization;
using CanopyX.Html;

namespace CanopyX.Examples;

/// <summary>
/// A certificate inventory with a record panel (docs/record-panel.md): rows show eight columns, each record about sixty fields
/// in tabs and sections under a pinned summary, with alternative names, contacts by role, related certificates ("Open all in
/// grid"), a timeline with before/after changes, a days-left sparkline, record deep links, print and export. A small page plugin
/// fills a drawer section (the extension point a host fills with a chart) and adds a record action. Writes:
///   certificate-inventory.html (and -dark)    the records carry their fields inline
///   certificate-drawer.html (and -modal/-dark) continuous records in the default or modal drawer
///   certificate-sidecar/index.html            the same grid whose record details load from record packs (file:// works)
///   certificate-tree.html                     the tree drawer: issuers and their certificates with the same record panel
/// </summary>
internal static class CertificateInventoryExample {
    internal const int Count = 120;

    private const string Plugin = """
<script>
(() => {
  // A drawer section a host fills: here a strip of the reminder stages before expiry, drawn from the record's values. A host
  // with a chart library mounts its chart in the same element (docs/record-panel.md shows a ChartForgeX chart).
  function stages(record, element, context) {
    const days = context.values.days, value = days && typeof days === "object" ? days.value : days;
    const strip = document.createElement("div"); strip.className = "reminder-stages"; strip.setAttribute("role", "img");
    strip.setAttribute("aria-label", "Reminder stages: 90, 60, 30 and 7 days before expiry; " + value + " days left");
    for (const stage of [90, 60, 30, 7, 0]) {
      const step = document.createElement("span"); step.className = "reminder-stage" + (value <= stage ? " reached" : "");
      step.textContent = stage ? stage + " d" : "Expiry"; strip.appendChild(step);
    }
    element.appendChild(strip);
  }
  CanopyX.use({
    name: "certificate-panel",
    drawerSections: { "reminder-stages": stages },
    recordActions: [{ label: "Copy thumbprint", run: ({ payload, record }) => navigator.clipboard.writeText(String((record.fields || payload?.fields || {}).thumbprint?.value ?? (record.fields || payload?.fields || {}).thumbprint ?? "")) }]
  });
})();
</script>
<style>
.reminder-stages{display:flex;gap:4px;margin:2px 0 4px}
.reminder-stage{flex:1;padding:4px 0;text-align:center;font-size:12px;border-radius:4px;border:1px solid var(--hfx-color-border);color:var(--hfx-color-text-muted)}
.reminder-stage.reached{border-color:var(--hfx-color-status-warn-fg);color:var(--hfx-color-status-warn-fg);font-weight:600}
</style>
""";

    internal static CanopyDataGridView View(CanopyRecordSource? source = null) {
        var view = new CanopyDataGridView("certificates", "Certificates") { PageSize = 200, StatusBar = true, Noun = "certificates", RowAction = CanopyGridRowAction.Details };
        view.Columns.Add(new CanopyColumn("cn", "Common name") { Sortable = true, Presenter = CanopyGridPresenter.Identifier(), Section = "Names" });
        view.Columns.Add(new CanopyColumn("status", "Status") { Sortable = true, Presenter = CanopyGridPresenter.State() });
        view.Columns.Add(new CanopyColumn("days", "Days left") { Kind = CanopyColumnKind.Number, Sortable = true });
        view.Columns.Add(new CanopyColumn("expires", "Expires") { Kind = CanopyColumnKind.DateTime, Sortable = true });
        view.Columns.Add(new CanopyColumn("issuer", "Issuer") { Sortable = true });
        view.Columns.Add(new CanopyColumn("owner", "Owner") { Sortable = true });
        view.Columns.Add(new CanopyColumn("names", "Alternative names") { Presenter = CanopyGridPresenter.Structured(CanopyGridStructuredDisplay.Chips, 2) });
        view.Columns.Add(new CanopyColumn("environment", "Environment") { Sortable = true });
        view.Columns.Add(new CanopyColumn("serial", "Serial") { Hidden = true, Sortable = true });

        var record = view.Record = new CanopyRecordPanel { DeepLink = true, HeaderStatus = "status" };
        foreach (var id in new[] { "days", "expires", "owner", "issuer" }) record.HeaderFacts.Add(id);
        void Field(string id, string title, CanopyColumnKind kind = CanopyColumnKind.Text, CanopyGridPresenter? presenter = null) =>
            record.Fields.Add(new CanopyColumn(id, title) { Kind = kind, Presenter = presenter });
        Field("subject", "Subject"); Field("thumbprint", "Thumbprint (SHA-1)"); Field("sha256", "Thumbprint (SHA-256)"); Field("keyAlgorithm", "Key algorithm");
        Field("keySize", "Key size", CanopyColumnKind.Number); Field("signatureAlgorithm", "Signature algorithm"); Field("version", "Version", CanopyColumnKind.Number);
        Field("subjectKeyId", "Subject key identifier"); Field("authorityKeyId", "Authority key identifier");
        Field("notBefore", "Valid from", CanopyColumnKind.DateTime); Field("validityDays", "Validity (days)", CanopyColumnKind.Number);
        Field("renewBy", "Renew by", CanopyColumnKind.DateTime); Field("autoRenew", "Automatic renewal", presenter: CanopyGridPresenter.Boolean());
        Field("renewalStatus", "Renewal status", presenter: CanopyGridPresenter.State());
        Field("wildcard", "Wildcard", presenter: CanopyGridPresenter.Boolean()); Field("sanCount", "Names", CanopyColumnKind.Number);
        Field("team", "Team"); Field("department", "Department"); Field("costCenter", "Cost center"); Field("service", "Business service");
        Field("contacts", "Contacts"); Field("escalation", "Escalation");
        Field("authority", "Certificate authority"); Field("profile", "Profile"); Field("orderNumber", "Order number"); Field("requestedBy", "Requested by");
        Field("requestedAt", "Requested", CanopyColumnKind.DateTime); Field("approvedBy", "Approved by"); Field("issuedAt", "Issued", CanopyColumnKind.DateTime);
        Field("validation", "Validation method"); Field("validationStatus", "Validation status", presenter: CanopyGridPresenter.State());
        Field("keyUsage", "Key usage"); Field("extendedKeyUsage", "Extended key usage"); Field("policies", "Policies"); Field("endpoints", "Deployed on");
        Field("ctLogged", "In transparency logs", presenter: CanopyGridPresenter.Boolean());
        Field("reminderStage", "Reminder stage"); Field("lastReminder", "Last reminder", CanopyColumnKind.DateTime); Field("recipients", "Recipients");
        Field("suppressed", "Notifications suppressed", presenter: CanopyGridPresenter.Boolean(inverted: true)); Field("suppression", "Suppression reason");
        Field("completeness", "Completeness", CanopyColumnKind.Number, CanopyGridPresenter.Progress(100)); Field("missing", "Missing data");
        Field("source", "Data source"); Field("lastSync", "Last synchronised", CanopyColumnKind.DateTime);
        Field("chain", "Renewal chain"); Field("sameName", "Certificates with the same name");
        Field("history", "Days left, last 12 months", CanopyColumnKind.Number, CanopyGridPresenter.SparklineLine(markLast: true, higherIsGood: true));
        Field("timeline", "Timeline"); Field("changes", "Latest changes");

        CanopyRecordSection Section(string id, string label, params string[] fields) {
            var section = new CanopyRecordSection(id, label);
            foreach (var field in fields) section.Fields.Add(field);
            record.Sections.Add(section);
            return section;
        }
        Section("validity", "Validity", "notBefore", "renewBy", "validityDays", "autoRenew", "renewalStatus").Renderer = "reminder-stages";
        Section("ownership", "Ownership", "team", "department", "costCenter", "service", "escalation", "contacts");
        Section("reminders", "Reminders", "reminderStage", "lastReminder", "recipients", "suppressed", "suppression");
        Section("names", "Names", "cn", "names", "wildcard", "sanCount", "environment");
        Section("usage", "Usage", "keyUsage", "extendedKeyUsage", "policies", "ctLogged", "endpoints");
        Section("issuance", "Issuance", "authority", "profile", "orderNumber", "requestedBy", "requestedAt", "approvedBy", "issuedAt", "validation", "validationStatus");
        var identity = Section("identity", "Identity", "subject", "serial", "thumbprint", "sha256", "keyAlgorithm", "keySize", "signatureAlgorithm", "version");
        identity.Sections.Add(new CanopyRecordSection("keys", "Key identifiers") { Collapsed = true });
        identity.Sections[0].Fields.Add("subjectKeyId"); identity.Sections[0].Fields.Add("authorityKeyId");
        Section("related", "Related certificates", "chain", "sameName");
        Section("history", "History", "history", "timeline", "changes");
        Section("quality", "Data quality", "completeness", "missing", "source", "lastSync");
        void Tab(string id, string label, params string[] sections) { var tab = new CanopyRecordTab(id, label); foreach (var section in sections) tab.Sections.Add(section); record.Tabs.Add(tab); }
        Tab("overview", "Overview", "validity", "ownership", "reminders");
        Tab("fields", "Names & usage", "names", "usage");
        Tab("issuance", "Issuance", "issuance", "identity");
        Tab("related", "Related", "related");
        Tab("history", "History", "history", "quality");
        if (source != null) record.Source = source;
        return view;
    }

    internal static void Write(string output) {
        var view = View();
        for (var i = 0; i < Count; i++) view.Rows.Add(CertificateRecords.Row(i, Count, withFields: true));
        foreach (var theme in new[] { CanopyTheme.Light, CanopyTheme.Dark }) {
            var page = view.ToHtmlPage(new CanopyHtmlOptions { Title = "CanopyX certificate inventory", Theme = theme });
            File.WriteAllText(Path.Combine(output, "certificate-inventory" + (theme == CanopyTheme.Dark ? "-dark" : "") + ".html"), page.Replace("</body>", Plugin + "</body>"));
        }

        // Continuous records make the pinned section navigation and single-scroller drawer easy to explore.
        view.Record!.Tabs.Clear();
        foreach (var modal in new[] { false, true }) {
            view.RecordDrawerModal = modal;
            foreach (var theme in new[] { CanopyTheme.Light, CanopyTheme.Dark }) {
                var name = "certificate-drawer" + (modal ? "-modal" : "") + (theme == CanopyTheme.Dark ? "-dark" : "");
                var page = view.ToHtmlPage(new CanopyHtmlOptions { Title = "CanopyX certificate drawer", Theme = theme });
                File.WriteAllText(Path.Combine(output, name + ".html"), page.Replace("</body>", Plugin + "</body>"));
            }
        }

        // The same grid without record fields in the page: each drawer loads its record from a pack beside the page.
        var folder = Path.Combine(output, "certificate-sidecar");
        Directory.CreateDirectory(folder);
        var sidecar = View(CanopyRecordSource.Sidecar("records/", 16));
        for (var i = 0; i < Count; i++) sidecar.Rows.Add(CertificateRecords.Row(i, Count, withFields: false));
        CanopyRecordSidecar.Write(folder, sidecar, Enumerable.Range(0, Count).Select(i => {
            var details = new CanopyGridRecord(CertificateRecords.Id(i));
            foreach (var field in CertificateRecords.Fields(i, Count)) details.Fields[field.Key] = field.Value;
            return details;
        }));
        File.WriteAllText(Path.Combine(folder, "index.html"), sidecar.ToHtmlPage(new CanopyHtmlOptions { Title = "CanopyX certificate inventory (record packs)" }).Replace("</body>", Plugin + "</body>"));

        WriteTree(output);
    }

    // The tree drawer has the same record panel: issuers, and their certificates with record fields and links into the grid.
    private static void WriteTree(string output) {
        var tree = new CanopyTreeView("certificate-tree", "Certificates by issuer") { DeepLink = false };
        tree.Columns.Add(new CanopyColumn("name", "Issuer and certificate"));
        tree.Columns.Add(new CanopyColumn("status", "Status") { Section = "State" });
        tree.Columns.Add(new CanopyColumn("days", "Days left") { Kind = CanopyColumnKind.Number, Sortable = true, Section = "State" });
        var record = tree.Record = new CanopyRecordPanel { DeepLink = true, HeaderStatus = "status" };
        record.HeaderFacts.Add("days");
        foreach (var (id, title) in new[] { ("owner", "Owner"), ("team", "Team"), ("names", "Alternative names"), ("contacts", "Contacts"), ("timeline", "Timeline"), ("next", "Renewed by") })
            record.Fields.Add(new CanopyColumn(id, title));
        for (var issuer = 0; issuer < CertificateRecords.Issuers.Length; issuer++) {
            var node = new CanopyNode("issuer-" + issuer.ToString(CultureInfo.InvariantCulture), CertificateRecords.Issuers[issuer]) { Expanded = true };
            for (var i = issuer; i < 24; i += CertificateRecords.Issuers.Length) {
                var (status, tone) = CertificateRecords.Status(i);
                var child = new CanopyNode("tree-" + CertificateRecords.Id(i), CertificateRecords.Name(i, Count));
                child.Cells["status"] = new CanopyCell(status) { Tone = tone };
                child.Cells["days"] = CertificateRecords.DaysLeft(i);
                var fields = CertificateRecords.Fields(i, Count);
                child.Fields["owner"] = CertificateRecords.Row(i, Count, false).Cells["owner"];
                foreach (var key in new[] { "team", "contacts", "timeline" }) child.Fields[key] = fields[key];
                child.Fields["names"] = CertificateRecords.Row(i, Count, false).Cells["names"];
                // A link to another node of the tree; its path lets the tree expand to it.
                var next = (i + 3) % 24;
                var link = CanopyCell.Link(CertificateRecords.Name(next, Count) + " (" + CertificateRecords.Issuers[next % CertificateRecords.Issuers.Length] + ")", "tree-" + CertificateRecords.Id(next));
                link.Ref!.Path.Add("issuer-" + (next % CertificateRecords.Issuers.Length).ToString(CultureInfo.InvariantCulture)); link.Ref.Path.Add("tree-" + CertificateRecords.Id(next));
                child.Fields["next"] = link;
                node.Children.Add(child);
            }
            tree.Roots.Add(node);
        }
        File.WriteAllText(Path.Combine(output, "certificate-tree.html"), tree.ToHtmlPage(new CanopyHtmlOptions { Title = "CanopyX certificate tree" }));
    }
}
