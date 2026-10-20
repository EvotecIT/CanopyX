using System;
using System.Collections;
using System.Collections.Generic;
using System.Text;
using CanopyX.Json;

namespace CanopyX;

/// <summary>
/// The equivalent command of a flow's answers, with the browser's rules (the flow-command part) and ConsoleMonster's
/// (<c>CommandLine</c>): hidden, empty and unchanged answers are left out (the default in create mode, the edited value in edit
/// mode), a switch that was on and is now off becomes <c>-Name:$false</c> or <c>--no-name</c>, lists join with commas, values are
/// quoted for the style, and a secret that was typed is <c>&lt;secret&gt;</c>. tests/fixtures/flow-commands.json keeps both in step.
/// </summary>
internal static class CanopyFlowCommandLine {
    private const string PlainPowerShell = "-_./:\\=+%";
    private const string PlainPosix = "-_./:=@%+,";
    private const string PlainWindows = "-_./:\\=@%+,";

    internal static string? Format(CanopyFlow flow, IReadOnlyDictionary<string, object?> answers, IEnumerable<string>? typedSecrets) {
        if (flow.Command == null) return null;
        var style = flow.Command.Style;
        var typed = new HashSet<string>(typedSecrets ?? new string[0], StringComparer.Ordinal);
        var visible = CanopyFlowValidator.VisibleFieldIds(flow, answers);
        var edit = flow.IsEditMode || flow.Initial.Count > 0 || flow.StoredSecrets.Count > 0 || flow.Baseline != null;
        var arguments = new List<string>();
        foreach (var field in CanopyFlowValidator.Fields(flow)) {
            if (field.ParameterName == null || !visible.Contains(field.Id) || field.Kind == CanopyFlowFieldKind.Records) continue;
            if (field.Kind == CanopyFlowFieldKind.Secret) {
                if (typed.Contains(field.Id)) arguments.Add(Parameter(field.ParameterName, style) + (style == CanopyFlowCommandStyle.Windows ? ":" : " ") + "<secret>");
                continue;
            }

            if (!answers.TryGetValue(field.Id, out var raw) || raw == null) continue;
            var value = CanopyFlowValues.TryCanonical(field, raw, out var error);
            if (error != null || IsEmpty(value)) continue;
            object? baseline = edit ? (flow.Initial.TryGetValue(field.Id, out var initial) && initial != null ? CanopyFlowValues.TryCanonical(field, initial, out _) : null) :
                field.DefaultValue == null ? null : CanopyFlowValues.TryCanonical(field, field.DefaultValue, out _);
            if (Same(value, IsEmpty(baseline) ? null : baseline)) continue;
            if (value is bool flag && !flag) {
                if (baseline is bool on && on) arguments.Add(style == CanopyFlowCommandStyle.PowerShell ? Parameter(field.ParameterName, style) + ":$false" : Argument("no-" + field.ParameterName, true, style));
                continue;
            }

            arguments.Add(Argument(field.ParameterName, field.Kind == CanopyFlowFieldKind.Pick ? CanopyFlowRecordValues.PickIds(value) : value, style));
        }

        var line = new StringBuilder(flow.Command.Name);
        foreach (var argument in arguments) if (argument.Length > 0) line.Append(' ').Append(argument);
        return line.ToString();
    }

    private static bool IsEmpty(object? value) => value == null || value is string text && text.Length == 0 || value is ICollection list && list.Count == 0;

    private static bool Same(object? left, object? right) {
        var a = new CanopyJsonWriter(64);
        CanopyFlowValues.Write(a, left);
        var b = new CanopyJsonWriter(64);
        CanopyFlowValues.Write(b, right);
        return string.Equals(a.ToString(), b.ToString(), StringComparison.Ordinal);
    }

    internal static string Parameter(string name, CanopyFlowCommandStyle style) {
        var bare = name.TrimStart('-', '/');
        return style == CanopyFlowCommandStyle.Posix ? (name.StartsWith("-", StringComparison.Ordinal) ? name : (bare.Length == 1 ? "-" : "--") + bare) :
            style == CanopyFlowCommandStyle.Windows ? "/" + bare : "-" + bare;
    }

    internal static string Quote(string value, CanopyFlowCommandStyle style) {
        var allowed = style == CanopyFlowCommandStyle.Posix ? PlainPosix : style == CanopyFlowCommandStyle.Windows ? PlainWindows : PlainPowerShell;
        var plain = value.Length > 0;
        foreach (var ch in value) if (!char.IsLetterOrDigit(ch) && allowed.IndexOf(ch) < 0) { plain = false; break; }
        if (plain) return value;
        return style == CanopyFlowCommandStyle.Posix ? "'" + value.Replace("'", "'\\''") + "'" :
            style == CanopyFlowCommandStyle.Windows ? "\"" + value.Replace("\"", "\\\"") + "\"" : "'" + value.Replace("'", "''") + "'";
    }

    internal static string Argument(string name, object? value, CanopyFlowCommandStyle style) {
        var parameter = Parameter(name, style);
        if (value == null) return string.Empty;
        if (value is bool flag) return flag ? parameter : string.Empty;
        string text;
        if (value is string single) {
            if (single.Length == 0) return string.Empty;
            text = Quote(single, style);
        } else if (value is IEnumerable list) {
            var parts = new List<string>();
            foreach (var item in list) if (item != null) parts.Add(Quote(Text(item), style));
            if (parts.Count == 0) return string.Empty;
            text = string.Join(",", parts);
        } else {
            text = Quote(Text(value), style);
        }

        return parameter + (style == CanopyFlowCommandStyle.Windows ? ":" : " ") + text;
    }

    /// <summary>A scalar as the browser writes it: text as it is, numbers as JavaScript writes them, booleans in lower case.</summary>
    private static string Text(object value) {
        switch (value) {
            case string text: return text;
            case bool flag: return flag ? "true" : "false";
            case double number: {
                var writer = new CanopyJsonWriter(32);
                writer.Number(number);
                return writer.ToString();
            }
            default: return Convert.ToString(value, System.Globalization.CultureInfo.InvariantCulture) ?? string.Empty;
        }
    }
}