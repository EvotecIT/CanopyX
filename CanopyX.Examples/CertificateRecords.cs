using System.Globalization;

namespace CanopyX.Examples;

/// <summary>
/// Generic certificate inventory data for the record panel example: each certificate's grid cells and about fifty record-only
/// fields (identity, validity, names, ownership with contacts by role, issuance, usage, reminders, data quality, related
/// certificates, a timeline with changes and a days-left history).
/// </summary>
internal static class CertificateRecords {
    internal static readonly string[] Issuers = { "Example Issuing CA 1", "Example Issuing CA 2", "Example Server CA" };
    internal static readonly string[] Teams = { "Platform", "Payments", "Identity", "Edge", "Data" };
    private static readonly string[] Environments = { "Production", "Staging", "Test" };
    private static readonly string[] People = { "Alex Morgan", "Sam Rivera", "Kim Park", "Robin Lee", "Jordan Diaz", "Casey Novak" };
    internal static readonly DateTime Today = new DateTime(2026, 10, 15, 0, 0, 0, DateTimeKind.Utc);

    internal static string Id(int index) => "cert-" + index.ToString("D4", CultureInfo.InvariantCulture);
    internal static string Name(int index, int count) => "app" + (index % Math.Max(1, count / 2)).ToString(CultureInfo.InvariantCulture) + ".example.com";
    internal static int DaysLeft(int index) => index % 9 == 4 ? -(index % 13) - 1 : 6 + index * 37 % 380;

    internal static (string Text, CanopyTone Tone) Status(int index) {
        var days = DaysLeft(index);
        return days < 0 ? ("Expired", CanopyTone.Danger) : days <= 30 ? ("Expiring", CanopyTone.Warning) : ("Valid", CanopyTone.Success);
    }

    internal static CanopyGridRow Row(int index, int count, bool withFields) {
        var row = new CanopyGridRow(Id(index));
        var name = Name(index, count);
        var (status, tone) = Status(index);
        var days = DaysLeft(index);
        row.Cells["cn"] = new CanopyCell(name) { Secondary = "Serial " + Serial(index) };
        row.Cells["status"] = new CanopyCell(status) { Tone = tone };
        row.Cells["days"] = new CanopyCell(days) { Tone = days < 0 ? CanopyTone.Danger : days <= 30 ? CanopyTone.Warning : CanopyTone.None };
        row.Cells["expires"] = Today.AddDays(days);
        row.Cells["issuer"] = Issuers[index % Issuers.Length];
        row.Cells["owner"] = People[index % People.Length];
        row.Cells["names"] = CanopyCell.List(Sans(index, name).Select(san => new CanopyCell(san)));
        row.Cells["environment"] = Environments[index % Environments.Length];
        row.Cells["serial"] = Serial(index);
        if (withFields) foreach (var field in Fields(index, count)) row.Fields[field.Key] = field.Value;
        return row;
    }

    internal static string Serial(int index) => "0x" + (0x4A1000 + index * 7919).ToString("X", CultureInfo.InvariantCulture);
    private static string Thumbprint(int index, int length) {
        var hash = (uint)(index * 2654435761u);
        var text = "";
        while (text.Length < length) { hash = hash * 1103515245u + 12345u; text += hash.ToString("X8", CultureInfo.InvariantCulture); }
        return text.Substring(0, length);
    }
    private static IEnumerable<string> Sans(int index, string name) {
        yield return name;
        for (var i = 1; i < 2 + index % 5; i++) yield return (i == 1 ? "www." : "alt" + i.ToString(CultureInfo.InvariantCulture) + ".") + name;
    }

    /// <summary>The record-only values of one certificate, by field id.</summary>
    internal static Dictionary<string, CanopyCell> Fields(int index, int count) {
        var name = Name(index, count);
        var days = DaysLeft(index);
        var expires = Today.AddDays(days);
        var issued = expires.AddDays(-398);
        var person = People[index % People.Length];
        var fields = new Dictionary<string, CanopyCell?>(StringComparer.Ordinal) {
            ["subject"] = "CN=" + name + ", O=Example Corp, C=US",
            ["thumbprint"] = new CanopyCell(Thumbprint(index, 40)) { Title = "SHA-1" },
            ["sha256"] = Thumbprint(index + 7, 64),
            ["keyAlgorithm"] = index % 4 == 0 ? "ECDSA P-256" : "RSA",
            ["keySize"] = index % 4 == 0 ? 256 : index % 3 == 0 ? 4096 : 2048,
            ["signatureAlgorithm"] = "sha256WithRSAEncryption",
            ["version"] = 3,
            ["subjectKeyId"] = Thumbprint(index + 3, 40),
            ["authorityKeyId"] = Thumbprint(index % 3 + 100, 40),
            ["notBefore"] = issued,
            ["validityDays"] = 398,
            ["renewBy"] = expires.AddDays(-30),
            ["autoRenew"] = index % 3 != 1,
            ["renewalStatus"] = days < 0 ? new CanopyCell("Overdue") { Tone = CanopyTone.Danger } : days <= 30 ? new CanopyCell("Due") { Tone = CanopyTone.Warning } : new CanopyCell("Not due") { Tone = CanopyTone.Success },
            ["wildcard"] = index % 7 == 0,
            ["sanCount"] = Sans(index, name).Count(),
            ["team"] = Teams[index % Teams.Length],
            ["department"] = index % 6 == 5 ? null : new CanopyCell("Engineering"),
            ["costCenter"] = index % 5 == 0 ? null : new CanopyCell("CC-" + (4100 + index % 40).ToString(CultureInfo.InvariantCulture)),
            ["service"] = "Customer portal " + (index % 4 + 1).ToString(CultureInfo.InvariantCulture),
            ["contacts"] = CanopyCell.Collection(Contacts(index)),
            ["escalation"] = index % 4 == 0 ? new CanopyCell("Page the on-call engineer of " + Teams[index % Teams.Length]) : null,
            ["authority"] = "Example Public CA",
            ["profile"] = index % 2 == 0 ? "Web server (OV)" : "Web server (DV)",
            ["orderNumber"] = (880000 + index * 13).ToString(CultureInfo.InvariantCulture),
            ["requestedBy"] = People[(index + 2) % People.Length],
            ["requestedAt"] = issued.AddDays(-2),
            ["approvedBy"] = index % 2 == 0 ? new CanopyCell(People[(index + 3) % People.Length]) : null,
            ["issuedAt"] = issued,
            ["validation"] = index % 2 == 0 ? "DNS" : "HTTP",
            ["validationStatus"] = new CanopyCell(index % 11 == 3 ? "Failed" : "Validated") { Tone = index % 11 == 3 ? CanopyTone.Danger : CanopyTone.Success },
            ["keyUsage"] = CanopyCell.List("Digital signature", "Key encipherment"),
            ["extendedKeyUsage"] = CanopyCell.List("Server authentication", "Client authentication"),
            ["policies"] = CanopyCell.Object(new CanopyCellField("Policy", "2.23.140.1.2.2"), new CanopyCellField("Validation", new CanopyCell(index % 2 == 0 ? "Organization" : "Domain") { Tone = CanopyTone.Info }),
                new CanopyCellField("Transparency", CanopyCell.List("Log A", "Log B"))),
            ["endpoints"] = CanopyCell.Collection(Endpoints(index, name)),
            ["ctLogged"] = true,
            ["reminderStage"] = days <= 30 ? "30 days" : days <= 60 ? "60 days" : "None",
            ["lastReminder"] = days <= 60 ? new CanopyCell(Today.AddDays(-3 - index % 5)) : null,
            ["recipients"] = CanopyCell.List(Email(person), Email(People[(index + 1) % People.Length])),
            ["suppressed"] = index % 10 == 9,
            ["suppression"] = index % 10 == 9 ? new CanopyCell("Decommission planned") : null,
            ["completeness"] = new CanopyCell(70 + index * 13 % 31) { Text = (70 + index * 13 % 31).ToString(CultureInfo.InvariantCulture) + " %" },
            ["missing"] = index % 5 == 0 ? CanopyCell.List("Cost center") : null,
            ["source"] = "Certificate service sync",
            ["lastSync"] = Today.AddHours(-2 - index % 7),
            ["chain"] = CanopyCell.Collection(Chain(index, count)),
            ["sameName"] = CanopyCell.Collection(SameName(index, count)),
            ["history"] = History(days),
            ["timeline"] = CanopyCell.Timeline(Timeline(index, person, issued)),
            ["changes"] = CanopyCell.Diff(new[] {
                new CanopyFieldChange("Owner", People[(index + 4) % People.Length], person),
                new CanopyFieldChange("Recipients", CanopyCell.List(Email(person), "certs-old@example.com"), CanopyCell.List(Email(person), Email(People[(index + 1) % People.Length]))),
                new CanopyFieldChange("Automatic renewal", false, index % 3 != 1) })
        };
        // Fields without data are left out: the panel hides them until the reader asks for empty fields.
        return fields.Where(pair => pair.Value != null).ToDictionary(pair => pair.Key, pair => pair.Value!, StringComparer.Ordinal);
    }

    private static string Email(string person) => person.ToLowerInvariant().Replace(' ', '.') + "@example.com";

    private static CanopyRecordList Contacts(int index) {
        var list = new CanopyRecordList();
        list.Columns.Add(new CanopyColumn("role", "Role"));
        list.Columns.Add(new CanopyColumn("name", "Name"));
        list.Columns.Add(new CanopyColumn("email", "Email") { Presenter = CanopyGridPresenter.Link(), Sizing = CanopyColumnSizing.Flex() });
        foreach (var (role, offset) in new[] { ("Owner", 0), ("Technical contact", 1), ("Backup owner", 2), ("Approver", 3) }) {
            var row = new CanopyGridRow(role.ToLowerInvariant().Replace(' ', '-'));
            var person = People[(index + offset) % People.Length];
            row.Cells["role"] = role; row.Cells["name"] = person; row.Cells["email"] = new CanopyCell("mailto:" + Email(person)) { Text = Email(person) };
            list.Rows.Add(row);
        }
        return list;
    }

    private static CanopyRecordList Endpoints(int index, string name) {
        var list = new CanopyRecordList { PageLength = 5 };
        list.Columns.Add(new CanopyColumn("host", "Host") { Sizing = CanopyColumnSizing.Flex() });
        list.Columns.Add(new CanopyColumn("port", "Port") { Kind = CanopyColumnKind.Number });
        list.Columns.Add(new CanopyColumn("seen", "Last seen") { Kind = CanopyColumnKind.DateTime });
        for (var i = 0; i < 2 + index % 9; i++) {
            var row = new CanopyGridRow("e" + i.ToString(CultureInfo.InvariantCulture));
            row.Cells["host"] = "10.20." + (index % 50).ToString(CultureInfo.InvariantCulture) + "." + (10 + i).ToString(CultureInfo.InvariantCulture) + " (" + name + ")";
            row.Cells["port"] = i % 3 == 2 ? 8443 : 443; row.Cells["seen"] = Today.AddHours(-i * 5 - 1);
            list.Rows.Add(row);
        }
        return list;
    }

    private static CanopyRecordList Related(string title) {
        var list = new CanopyRecordList();
        list.Columns.Add(new CanopyColumn("cn", title) { Sizing = CanopyColumnSizing.Flex() });
        list.Columns.Add(new CanopyColumn("status", "Status") { Presenter = CanopyGridPresenter.State() });
        list.Columns.Add(new CanopyColumn("expires", "Expires") { Kind = CanopyColumnKind.DateTime });
        return list;
    }
    private static CanopyGridRow RelatedRow(int index, int count) {
        var row = new CanopyGridRow(Id(index)); var (status, tone) = Status(index);
        row.Cells["cn"] = Name(index, count); row.Cells["status"] = new CanopyCell(status) { Tone = tone }; row.Cells["expires"] = Today.AddDays(DaysLeft(index));
        return row;
    }

    // The renewal chain: the certificates this one replaced and the one that replaced it, each a record of the same grid.
    private static CanopyRecordList Chain(int index, int count) {
        var list = Related("Certificate");
        foreach (var other in new[] { index - 7, index - 3, index + 5 }) if (other >= 0 && other < count) list.Rows.Add(RelatedRow(other, count));
        list.Target = new CanopyRecordTarget("certificates");
        return list;
    }

    // Every certificate with the same common name: the first five, a total for "Load more", and "Open all in grid".
    private static CanopyRecordList SameName(int index, int count) {
        var list = Related("Common name");
        var half = Math.Max(1, count / 2);
        var all = Enumerable.Range(0, count).Where(other => other != index && other % half == index % half).ToList();
        foreach (var other in all.Take(5)) list.Rows.Add(RelatedRow(other, count));
        list.Total = all.Count;
        list.Target = new CanopyRecordTarget("certificates") { Column = "cn" };
        list.Target.Values.Add(Name(index, count));
        return list;
    }

    private static CanopyCell History(int days) {
        var cell = new CanopyCell(days);
        for (var month = 11; month >= 0; month--) cell.Series.Add(new CanopyCellPeriod(Today.AddMonths(-month).ToString("yyyy-MM", CultureInfo.InvariantCulture), days + month * 30));
        return cell;
    }

    private static IEnumerable<CanopyRecordEvent> Timeline(int index, string person, DateTime issued) {
        yield return new CanopyRecordEvent(Today.AddDays(-3).AddHours(9), "Reminder sent to " + Email(person)) { Kind = "Reminder", Tone = CanopyTone.Info, Actor = "Reminder service" };
        var change = new CanopyRecordEvent(Today.AddDays(-12).AddHours(14), "Owner changed") { Kind = "Change", Tone = CanopyTone.Warning, Actor = People[(index + 2) % People.Length] };
        change.Changes.Add(new CanopyFieldChange("Owner", People[(index + 4) % People.Length], person));
        yield return change;
        if (index % 11 == 3) yield return new CanopyRecordEvent(Today.AddDays(-20), "Domain validation failed") { Kind = "Validation", Tone = CanopyTone.Danger, Actor = "Example Public CA" };
        yield return new CanopyRecordEvent(issued.AddHours(10), "Certificate issued") { Kind = "Issued", Tone = CanopyTone.Success, Actor = "Example Public CA" };
        yield return new CanopyRecordEvent(issued.AddDays(-2).AddHours(11), "Certificate requested") { Kind = "Request", Actor = People[(index + 2) % People.Length] };
    }
}
