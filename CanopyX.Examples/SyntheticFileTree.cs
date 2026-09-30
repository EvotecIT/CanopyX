using System.Globalization;
using CanopyX;

namespace CanopyX.Examples;

/// <summary>
/// Builds a deterministic file-share-like tree: shares, department folders, project folders, and files, some with a
/// version history whose versions open a before/after table. The host side of a real report does the same work: it
/// computes the rollups (sizes, "changed" counts) and flags, and CanopyX only shows them.
/// </summary>
internal sealed class SyntheticFileTree {
    private static readonly string[] Departments = { "Finance", "Engineering", "Legal", "Marketing", "Operations", "Research", "Sales", "Support" };
    private static readonly string[] Projects = { "Budget", "Roadmap", "Contracts", "Campaign", "Łódź office", "İstanbul launch", "Straße survey", "Αθήνα partners", "Москва office", "Quarterly review", "Hiring", "Audit" };
    private static readonly string[] Owners = { "anna.kowalska", "ben.okafor", "chen.wei", "dana.levi", "erik.lund", "fatima.zahra" };
    private static readonly string[] Extensions = { ".xlsx", ".docx", ".pdf", ".pptx", ".csv", ".txt" };
    private static readonly DateTime Now = new DateTime(2026, 9, 27, 12, 0, 0, DateTimeKind.Utc);

    private readonly Dictionary<string, int> _changedBelow = new Dictionary<string, int>(StringComparer.Ordinal);
    private uint _state = 20260927;

    /// <summary>Gets how many nodes the last call to <see cref="Build"/> created.</summary>
    internal int NodeCount { get; private set; }

    /// <summary>Builds the tree. The first project of the first department of the first share holds a long list of files.</summary>
    /// <param name="shares">Top-level shares (at most 26).</param>
    /// <param name="departments">Department folders per share.</param>
    /// <param name="projects">Project folders per department.</param>
    /// <param name="minFiles">Fewest files per project.</param>
    /// <param name="maxFiles">Most files per project.</param>
    /// <param name="longListFiles">Files in the long list.</param>
    internal List<CanopyNode> Build(int shares, int departments, int projects, int minFiles, int maxFiles, int longListFiles) {
        NodeCount = 0;
        var roots = new List<CanopyNode>();
        for (var s = 0; s < Math.Min(shares, 26); s++) {
            var letter = (char)('a' + s);
            var share = Node("share-" + letter, @"\\files\share-" + letter, "share");
            share.Group = true;
            for (var d = 0; d < departments; d++) {
                var name = Departments[d % Departments.Length] + (d >= Departments.Length ? " " + (d / Departments.Length + 1) : string.Empty);
                var department = Node(share.Id + "/d" + d, name, "folder");
                for (var p = 0; p < projects; p++) {
                    var project = Node(department.Id + "/p" + p, Projects[(s + d + p) % Projects.Length], "folder");
                    var files = s == 0 && d == 0 && p == 0 ? longListFiles : minFiles + (int)(Next() * (maxFiles - minFiles + 1));
                    for (var f = 0; f < files; f++) {
                        project.Children.Add(File(project.Id + "/f" + f, f));
                    }

                    Rollup(project);
                    department.Children.Add(project);
                }

                Rollup(department);
                share.Children.Add(department);
            }

            Rollup(share);
            roots.Add(share);
        }

        if (roots.Count > 0) {
            roots[0].Expanded = true;
        }

        return roots;
    }

    private CanopyNode Node(string id, string label, string icon) {
        NodeCount++;
        return new CanopyNode(id, label) { Kind = icon == "share" ? "share" : "folder", Icon = icon };
    }

    private CanopyNode File(string id, int index) {
        NodeCount++;
        var project = Projects[(int)(Next() * Projects.Length)];
        var file = new CanopyNode(id, project + " " + (index + 1) + Extensions[index % Extensions.Length]) { Kind = "file", Icon = "file" };
        var size = (long)(Next() * 50_000_000);
        var modified = Now.AddMinutes(-(int)(Next() * 60 * 24 * 90));
        var owner = Next() < 0.12 ? null : Owners[(int)(Next() * Owners.Length)];
        file.Cells["size"] = new CanopyCell(size) { Text = FormatSize(size) };
        file.Cells["modified"] = modified;
        file.Cells["owner"] = owner ?? new CanopyCell() { Text = "not collected", Tone = CanopyTone.Muted, Title = "The owner was not collected for this share." };
        file.Cells["state"] = size > 40_000_000 ? new CanopyCell("large") { Text = "Large", Tone = CanopyTone.Warning }
            : modified < Now.AddDays(-80) ? new CanopyCell("stale") { Text = "Stale", Tone = CanopyTone.Muted }
            : new CanopyCell("ok") { Text = "OK", Tone = CanopyTone.Success };
        if (modified > Now.AddDays(-7)) {
            file.Flags.Add("changed");
            file.Badges.Add(new CanopyBadge("changed", CanopyTone.Info) { Title = "Changed in the last 7 days" });
        }

        if (index % 9 == 0) {
            file.Children.Add(History(file.Id, modified));
        }

        return file;
    }

    private CanopyNode History(string fileId, DateTime modified) {
        NodeCount++;
        var history = new CanopyNode(fileId + "/history", "History") { Kind = "group", Icon = "history" };
        var versions = 2 + (int)(Next() * 4);
        for (var v = versions; v >= 1; v--) {
            NodeCount += 2;
            var version = new CanopyNode(history.Id + "/v" + v, "Version " + v) { Kind = "version" };
            version.Cells["modified"] = modified.AddDays(-(versions - v) * 3);
            version.Cells["owner"] = Owners[(v + versions) % Owners.Length];
            var detail = new CanopyTableDetail("Changes in version " + v).AddColumns("Property", "Before", "After");
            detail.AddRow("Size", FormatSize(1_000_000L * v), new CanopyCell(FormatSize(1_200_000L * v)) { Tone = CanopyTone.Success });
            detail.AddRow("Retention", new CanopyCell("30 days") { Tone = CanopyTone.Danger }, new CanopyCell("90 days") { Tone = CanopyTone.Success });
            detail.AddRow("Sharing", "Team", new CanopyCell("Everyone") { Tone = CanopyTone.Warning });
            // A backtick and ${ are the two sequences a bundle pack has to escape (see "Packs" in docs/data-protocol.md).
            detail.AddRow("Path template", "`share`/${team}", "`share`/${team}/${year}");
            version.Children.Add(new CanopyNode(version.Id + "/changes", "Changes") { Detail = detail });
            history.Children.Add(version);
        }

        return history;
    }

    /// <summary>Host-side rollups: total size, item count, and how many files changed below, as a badge and an ancestor flag.</summary>
    private void Rollup(CanopyNode folder) {
        long size = 0;
        var changed = 0;
        foreach (var child in folder.Children) {
            if (child.Cells.TryGetValue("size", out var cell) && cell.Value is long bytes) {
                size += bytes;
            }

            changed += child.Flags.Contains("changed") ? 1 : 0;
            changed += _changedBelow.TryGetValue(child.Id, out var below) ? below : 0;
        }

        _changedBelow[folder.Id] = changed;
        folder.Cells["size"] = new CanopyCell(size) { Text = FormatSize(size) };
        folder.Cells["items"] = folder.Children.Count;
        if (changed > 0) {
            folder.Flags.Add("changed-below");
            folder.Badges.Add(new CanopyBadge(changed + " changed", CanopyTone.Info) { Title = "Changed files below" });
        }
    }

    private static string FormatSize(long bytes) {
        string[] units = { "B", "KB", "MB", "GB", "TB" };
        double value = bytes;
        var unit = 0;
        while (value >= 1024 && unit < units.Length - 1) {
            value /= 1024;
            unit++;
        }

        return value.ToString(unit == 0 ? "0" : "0.0", CultureInfo.InvariantCulture) + " " + units[unit];
    }

    /// <summary>A linear congruential generator, so the tree is the same on every machine and runtime.</summary>
    private double Next() {
        _state = unchecked(_state * 1664525u + 1013904223u);
        return _state / 4294967296.0;
    }
}
