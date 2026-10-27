using System;
using System.Collections.Generic;
using System.Globalization;

namespace CanopyX;

/// <summary>How the change views write sizes, times, durations and folders, the same in the static renderers and the browser.</summary>
internal static class CanopyChangeFormat {
    private static readonly string[] Units = { "B", "KB", "MB", "GB", "TB" };

    /// <summary>A size in bytes as the browser writes it: bytes below 1,024, then KB, MB, GB or TB with one decimal at most.</summary>
    internal static string Size(long bytes, CultureInfo culture) {
        if (bytes < 1024) return bytes.ToString("N0", culture) + " B";
        double value = bytes;
        var unit = 0;
        while (value >= 1024 && unit < Units.Length - 1) { value /= 1024; unit++; }
        return value.ToString("#,##0.#", culture) + " " + Units[unit];
    }

    /// <summary>A time in UTC as <c>yyyy-MM-dd HH:mm</c> in the label's words ("{time} UTC").</summary>
    internal static string Time(DateTimeOffset time, CanopyLabels labels) =>
        labels.ChangeUtcTime.Replace("{time}", time.UtcDateTime.ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture));

    /// <summary>A readable snapshot or propagation time with the UTC mark kept with its clock.</summary>
    internal static string HumanTime(DateTimeOffset time, CanopyLabels labels, CultureInfo culture) =>
        labels.ChangeUtcTime.Replace("{time}", time.UtcDateTime.ToString("dd MMM yyyy, HH:mm", culture)).Replace(" UTC", "\u00a0UTC");

    /// <summary>A duration in the largest two units that matter: seconds, minutes, hours and minutes, or days and hours.</summary>
    internal static string Duration(TimeSpan span, CanopyLabels labels, CultureInfo culture) {
        var seconds = (long)Math.Max(0, Math.Floor(span.TotalSeconds));
        string Unit(string template, long count) => template.Replace("{count}", count.ToString("N0", culture));
        if (seconds < 60) return Unit(labels.ChangeSeconds, seconds);
        var minutes = seconds / 60;
        if (minutes < 60) return Unit(labels.ChangeMinutes, minutes);
        var hours = minutes / 60;
        if (hours < 24) return Unit(labels.ChangeHours, hours) + (minutes % 60 == 0 ? string.Empty : " " + Unit(labels.ChangeMinutes, minutes % 60));
        return Unit(labels.ChangeDays, hours / 24) + (hours % 24 == 0 ? string.Empty : " " + Unit(labels.ChangeHours, hours % 24));
    }

    /// <summary>A path's folder (everything before its last <c>/</c> or <c>\</c>) and its name.</summary>
    internal static (string Folder, string Name) Split(string path) {
        var at = Math.Max(path.LastIndexOf('/'), path.LastIndexOf('\\'));
        return at < 0 ? (string.Empty, path) : (path.Substring(0, at), path.Substring(at + 1));
    }

    /// <summary>The start of a hash, as the list shows it.</summary>
    internal static string Short(string hash, int length) => hash.Length <= length ? hash : hash.Substring(0, length) + "…";

    /// <summary>The kind's label, or the item's own.</summary>
    internal static string Kind(CanopyChangeItem item, CanopyLabels labels) => item.KindLabel ?? item.Kind switch {
        CanopyChangeKind.Added => labels.ChangeAdded,
        CanopyChangeKind.Removed => labels.ChangeRemoved,
        CanopyChangeKind.Renamed => labels.ChangeRenamed,
        _ => labels.ChangeModified
    };

    /// <summary>The tone of a kind: added success, removed danger, modified info, renamed neutral.</summary>
    internal static CanopyTone Tone(CanopyChangeKind kind) => kind switch {
        CanopyChangeKind.Added => CanopyTone.Success,
        CanopyChangeKind.Removed => CanopyTone.Danger,
        CanopyChangeKind.Renamed => CanopyTone.Neutral,
        _ => CanopyTone.Info
    };

    /// <summary>The label, symbol and tone of a propagation state.</summary>
    internal static (string Label, string Symbol, CanopyTone Tone) State(CanopyPropagationState state, CanopyLabels labels) => state switch {
        CanopyPropagationState.Converged => (labels.ChangeConverged, "✓", CanopyTone.Success),
        CanopyPropagationState.Propagating => (labels.ChangePropagating, "◷", CanopyTone.Warning),
        CanopyPropagationState.Fault => (labels.ChangeFault, "✕", CanopyTone.Danger),
        _ => (labels.ChangeUnknown, "?", CanopyTone.Muted)
    };

    /// <summary>
    /// The items in the order the list shows them: when grouped, by folder (the folder as the first of its items writes it, ordered by
    /// the folder with <c>/</c> for <c>\</c>, ordinally), each folder's items as given; otherwise one group of all items.
    /// </summary>
    internal static List<(string Folder, List<CanopyChangeItem> Items)> Folders(CanopyChangeList list) {
        if (!list.GroupByFolder) return new List<(string, List<CanopyChangeItem>)> { (string.Empty, new List<CanopyChangeItem>(list.Items)) };
        var folders = new List<(string Key, string Folder, List<CanopyChangeItem> Items)>();
        var index = new Dictionary<string, List<CanopyChangeItem>>(StringComparer.Ordinal);
        foreach (var item in list.Items) {
            var folder = Split(item.Path).Folder;
            var key = folder.Replace('\\', '/');
            if (!index.TryGetValue(key, out var items)) { index[key] = items = new List<CanopyChangeItem>(); folders.Add((key, folder, items)); }
            items.Add(item);
        }

        folders.Sort((a, b) => string.CompareOrdinal(a.Key, b.Key));
        return folders.ConvertAll(folder => (folder.Folder, folder.Items));
    }
}
