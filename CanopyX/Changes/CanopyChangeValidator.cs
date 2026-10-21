using System;
using System.Collections.Generic;

namespace CanopyX;

/// <summary>The checks a diff, a change list and a propagation view pass before they are written; the browser's changes part applies the same rules.</summary>
internal static class CanopyChangeValidator {
    internal static void Validate(CanopyTextDiff diff) {
        Id(diff.Id, "The diff");
        Text(diff.Label, "The diff label", 200, false);
        Line(diff.Path, "The diff path", 2048);
        Line(diff.PreviousPath, "The diff's previous path", 2048);
        Text(diff.Message, "The diff message", 1000, true);
        Text(diff.BeforeTitle, "The diff's before title", 200, true);
        Text(diff.AfterTitle, "The diff's after title", 200, true);
        if (!Enum.IsDefined(typeof(CanopyDiffContent), diff.Content) || !Enum.IsDefined(typeof(CanopyDiffLayout), diff.Layout)) throw new InvalidOperationException("The diff has an unknown option value.");
        if (diff.Context < 0 || diff.Context > 20) throw new InvalidOperationException("A diff shows 0 to 20 unchanged lines around a change.");
        if (diff.Notes.Count > 16) throw new InvalidOperationException("A diff has at most 16 notes.");
        foreach (var note in diff.Notes) Text(note?.Text, "A diff note", 500, false);
        if (diff.BeforeText != null && diff.BeforeText.Length > CanopyTextDiff.MaxTextLength || diff.AfterText != null && diff.AfterText.Length > CanopyTextDiff.MaxTextLength)
            throw new InvalidOperationException("A diff text has at most " + CanopyTextDiff.MaxTextLength + " characters.");
        if (diff.UnifiedDiff != null && diff.UnifiedDiff.Length > 2 * CanopyTextDiff.MaxTextLength) throw new InvalidOperationException("The unified diff is too long.");
        if ((diff.BeforeText == null) != (diff.AfterText == null)) throw new InvalidOperationException("A diff has both texts or neither.");
        if (diff.Content != CanopyDiffContent.Text) {
            if (diff.Hunks.Count > 0 || diff.BeforeText != null) throw new InvalidOperationException("A diff without text content has no hunks and no texts; its message says why.");
            return;
        }

        if (diff.Hunks.Count == 0 && diff.BeforeText == null) throw new InvalidOperationException("A text diff needs hunks or both texts.");
        var beforeLines = diff.BeforeText == null ? null : CanopyTextDiffAlgorithm.SplitLines(diff.BeforeText);
        var afterLines = diff.AfterText == null ? null : CanopyTextDiffAlgorithm.SplitLines(diff.AfterText);
        int nextBefore = 1, nextAfter = 1, total = 0;
        foreach (var hunk in diff.Hunks) {
            if (hunk == null || hunk.Lines.Count == 0) throw new InvalidOperationException("A diff hunk holds at least one line.");
            if (hunk.BeforeStart < nextBefore || hunk.AfterStart < nextAfter) throw new InvalidOperationException("Diff hunks are in order and do not overlap.");
            // Outside the hunks both texts are the same, so the unchanged run before each hunk is as long on both sides.
            if (hunk.BeforeStart - nextBefore != hunk.AfterStart - nextAfter) throw new InvalidOperationException("The unchanged lines between diff hunks must be as many on both sides.");
            int before = hunk.BeforeStart, after = hunk.AfterStart;
            foreach (var line in hunk.Lines) {
                if (line == null || !Enum.IsDefined(typeof(CanopyDiffLineKind), line.Kind)) throw new InvalidOperationException("A diff line is unchanged, removed or added.");
                if (line.Text.Length > CanopyTextDiff.MaxLineLength || line.Text.IndexOf('\n') >= 0 || line.Text.IndexOf('\r') >= 0)
                    throw new InvalidOperationException("A diff line is one line of at most " + CanopyTextDiff.MaxLineLength + " characters.");
                if (line.Kind != CanopyDiffLineKind.Added) Match(beforeLines, before++, line.Text, "earlier");
                if (line.Kind != CanopyDiffLineKind.Removed) Match(afterLines, after++, line.Text, "later");
            }

            total += hunk.Lines.Count;
            if (total > CanopyTextDiff.MaxLines) throw new InvalidOperationException("A diff holds at most " + CanopyTextDiff.MaxLines + " lines.");
            nextBefore = before;
            nextAfter = after;
        }

        if (beforeLines != null && afterLines != null && diff.Hunks.Count > 0 && beforeLines.Count - nextBefore != afterLines.Count - nextAfter)
            throw new InvalidOperationException("The diff's hunks do not account for every difference between its texts.");
    }

    private static void Match(List<string>? lines, int number, string text, string side) {
        if (lines == null) return;
        if (number > lines.Count || lines[number - 1] != text) throw new InvalidOperationException("A diff hunk's line " + number + " does not match the " + side + " text.");
    }

    internal static void Validate(CanopyChangeList list) {
        Id(list.Id, "The change list");
        Text(list.Label, "The change list label", 200, false);
        if (list.Items.Count > CanopyChangeList.MaxItems) throw new InvalidOperationException("A change list holds at most " + CanopyChangeList.MaxItems + " items.");
        if (list.Actions.Count > 8) throw new InvalidOperationException("A change list has at most 8 actions.");
        if (list.HashLength < 4 || list.HashLength > 64) throw new InvalidOperationException("A change list shows 4 to 64 characters of a hash.");
        if (list.PageSize < 10 || list.PageSize > 1000) throw new InvalidOperationException("A change list shows 10 to 1,000 items at a time.");
        if (!Enum.IsDefined(typeof(CanopyTimeZone), list.TimeZone)) throw new InvalidOperationException("The change list has an unknown time zone.");
        if (list.Toolbar.Count > 8) throw new InvalidOperationException("A change list's bar has at most 8 actions.");
        if ((list.Exports & ~(CanopyChangeExports.Csv | CanopyChangeExports.Json)) != 0) throw new InvalidOperationException("The change list has an unknown export.");
        Values(list.Values, "The change list");
        var actions = new HashSet<string>(StringComparer.Ordinal);
        foreach (var action in list.Actions) Action(action, actions);
        var all = new HashSet<string>(actions, StringComparer.Ordinal);
        foreach (var action in list.Toolbar) {
            Action(action, all);
            if (action.Reveal != CanopyChangeReveal.None) throw new InvalidOperationException("The bar action '" + action.Id + "' has no item to reveal.");
            var key = action.Copy ?? action.Link;
            if (key != null && !list.Values.ContainsKey(key)) throw new InvalidOperationException("The bar action '" + action.Id + "' uses the list value '" + key + "', which the list does not have.");
        }

        var ids = new HashSet<string>(StringComparer.Ordinal);
        foreach (var item in list.Items) {
            if (item == null || item.Id.Length > 256 || !ids.Add(item.Id)) throw new InvalidOperationException("Change list items need unique ids of at most 256 characters.");
            var what = "The item '" + item.Id + "'";
            if (!Enum.IsDefined(typeof(CanopyChangeKind), item.Kind)) throw new InvalidOperationException(what + " has an unknown kind.");
            Line(item.Path, what + "'s path", 2048);
            if (item.Path.Trim().Length == 0) throw new InvalidOperationException(what + " needs a path.");
            Line(item.PreviousPath, what + "'s previous path", 2048);
            if (item.Kind == CanopyChangeKind.Renamed && item.PreviousPath == null) throw new InvalidOperationException(what + " is renamed and needs its previous path.");
            if ((item.Kind == CanopyChangeKind.Added || item.Kind == CanopyChangeKind.Removed) && item.PreviousPath != null) throw new InvalidOperationException(what + " is added or removed and has no previous path.");
            Text(item.KindLabel, what + "'s kind label", 64, true);
            Text(item.Secondary, what + "'s secondary text", 200, true);
            Version(item.Before, what);
            Version(item.After, what);
            if (item.Facts.Count > 32) throw new InvalidOperationException(what + " has at most 32 facts.");
            foreach (var fact in item.Facts) {
                Text(fact?.Label, what + "'s fact label", 200, false);
                if (fact!.Before == null && fact.After == null) throw new InvalidOperationException(what + "'s fact '" + fact.Label + "' needs a value.");
                Text(fact.Before, what + "'s fact value", 2000, true);
                Text(fact.After, what + "'s fact value", 2000, true);
                Text(fact.Note, what + "'s fact note", 500, true);
            }

            if (item.Flags.Count > 16) throw new InvalidOperationException(what + " has at most 16 flags.");
            var flags = new HashSet<string>(StringComparer.Ordinal);
            foreach (var flag in item.Flags) {
                if (flag == null || flag.Id.Length > 64 || !flags.Add(flag.Id)) throw new InvalidOperationException(what + " needs unique flag ids of at most 64 characters.");
                Text(flag.Label, what + "'s flag label", 64, false);
                Text(flag.Reason, what + "'s flag reason", 500, false);
            }

            if (item.Diff != null) Validate(item.Diff);
            foreach (var action in item.Actions) if (action == null || !actions.Contains(action)) throw new InvalidOperationException(what + " offers the undeclared action '" + action + "'.");
            Values(item.Values, what);
        }
    }

    private static void Action(CanopyChangeAction? action, HashSet<string> ids) {
        if (action == null || action.Id.Length > 64 || !ids.Add(action.Id)) throw new InvalidOperationException("Change list actions need unique ids of at most 64 characters.");
        var what = "The action '" + action.Id + "'";
        Text(action.Label, "The label of action '" + action.Id + "'", 64, false);
        if (!Enum.IsDefined(typeof(CanopyChangeActionIcon), action.Icon) || !Enum.IsDefined(typeof(CanopyChangeReveal), action.Reveal)) throw new InvalidOperationException(what + " has an unknown icon or reveal.");
        if (action.Copy != null && (action.Copy.Length == 0 || action.Copy.Length > 64)) throw new InvalidOperationException(what + " copies a value key of 1 to 64 characters.");
        if (action.Link != null && (action.Link.Length == 0 || action.Link.Length > 64)) throw new InvalidOperationException(what + " opens a value key of 1 to 64 characters.");
        var kinds = (action.Copy != null ? 1 : 0) + (action.Link != null ? 1 : 0) + (action.Reveal != CanopyChangeReveal.None ? 1 : 0);
        if (kinds > 1) throw new InvalidOperationException(what + " copies, opens a link or reveals: one of them.");
        if (action.Reason && kinds > 0) throw new InvalidOperationException(what + " asks for a reason, so it is the host's: it does not copy, link or reveal.");
    }

    /// <summary>A view's id: at most 256 characters, as the browser checks it.</summary>
    private static void Id(string id, string what) {
        if (id.Length > 256) throw new InvalidOperationException(what + " needs an id of at most 256 characters.");
    }

    private static void Values(IDictionary<string, string> values, string what) {
        if (values.Count > 16) throw new InvalidOperationException(what + " has at most 16 values.");
        foreach (var value in values) {
            if (value.Key.Length == 0 || value.Key.Length > 64 || value.Value == null || value.Value.Length > 4096) throw new InvalidOperationException(what + " has a value with a key of 1 to 64 characters and text of at most 4,096.");
        }
    }

    internal static void Validate(CanopyPropagation view) {
        Id(view.Id, "The propagation view");
        Text(view.Label, "The propagation label", 200, false);
        Text(view.Summary, "The propagation summary", 500, true);
        Text(view.Title, "The propagation title", 200, true);
        Text(view.GroupCount, "The propagation group count", 200, true);
        if (view.GroupCount != null && !CanopyPlural.IsValid(view.GroupCount, "{count}")) throw new InvalidOperationException("The propagation group count needs {count} in every form, and plural forms that end with [other].");
        if (view.State.HasValue && !Enum.IsDefined(typeof(CanopyPropagationState), view.State.Value) || !Enum.IsDefined(typeof(CanopyTimeZone), view.TimeZone))
            throw new InvalidOperationException("The propagation view has an unknown option value.");
        if (view.Start > view.AsOf) throw new InvalidOperationException("A propagation view starts before its evidence time.");
        if (view.Witnesses.Count == 0 || view.Witnesses.Count > CanopyPropagation.MaxWitnesses) throw new InvalidOperationException("A propagation view has 1 to " + CanopyPropagation.MaxWitnesses + " replicas.");
        var ids = new HashSet<string>(StringComparer.Ordinal);
        foreach (var witness in view.Witnesses) {
            if (witness == null || witness.Id.Length > 256 || !ids.Add(witness.Id)) throw new InvalidOperationException("Propagation replicas need unique ids of at most 256 characters.");
            var what = "The replica '" + witness.Id + "'";
            if (!Enum.IsDefined(typeof(CanopyPropagationState), witness.State)) throw new InvalidOperationException(what + " has an unknown state.");
            Text(witness.Label, what + "'s label", 200, false);
            Text(witness.Secondary, what + "'s secondary text", 200, true);
            Text(witness.Note, what + "'s note", 500, true);
            Text(witness.Group, what + "'s group", 200, true);
            if (witness.FirstSeen > witness.LastSeen) throw new InvalidOperationException(what + " was first seen after it last reported.");
        }
    }

    private static void Version(CanopyChangeVersion? version, string what) {
        if (version == null) return;
        if (version.Size < 0 || version.Size > 9007199254740991L) throw new InvalidOperationException(what + " has a size outside 0 to 2^53 − 1.");
        Line(version.Hash, what + "'s hash", 256);
        if (version.Hash != null && version.Hash.Trim().Length == 0) throw new InvalidOperationException(what + " has an empty hash.");
    }

    /// <summary>Optional text on one line: no line breaks, at most <paramref name="max"/> characters.</summary>
    private static void Line(string? value, string what, int max) {
        if (value == null) return;
        if (value.Length > max || value.IndexOf('\n') >= 0 || value.IndexOf('\r') >= 0) throw new InvalidOperationException(what + " is one line of at most " + max + " characters.");
    }

    private static void Text(string? value, string what, int max, bool optional) {
        if (value == null) {
            if (optional) return;
            throw new InvalidOperationException(what + " is required.");
        }

        if (!CanopyFlowValues.HasVisibleText(value) || value.Length > max) throw new InvalidOperationException(what + " is visible text of at most " + max + " characters.");
    }
}
