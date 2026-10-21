using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Net;
using System.Net.Sockets;
using System.Text.RegularExpressions;

namespace CanopyX.Data;

/// <summary>
/// The server's checks of one answer, as the browser's flow checks it (55-flow-validate.js and the forms part's formCheck):
/// required, ranges, steps, lengths, patterns, list and choice counts, item rules, records cells and secrets. Values are
/// canonical (<c>CanopyFlowValues.TryCanonical</c>); each check returns the first problem's message, or null.
/// </summary>
internal static class CanopyFlowFieldRules {
    private static readonly Regex Email = new Regex(@"^[^\s@]+@[^\s@]+\.[^\s@.]+$", RegexOptions.CultureInvariant);
    private static readonly Regex Host = new Regex(@"^(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)*[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.?$", RegexOptions.CultureInvariant);
    private static readonly Regex IPv4 = new Regex(@"^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$", RegexOptions.CultureInvariant);
    private static readonly Regex IPv6Shape = new Regex(@"^[0-9A-Fa-f:.]{2,45}$", RegexOptions.CultureInvariant);
    private static readonly Regex Prefix = new Regex(@"^[0-9]{1,3}$", RegexOptions.CultureInvariant);

    /// <summary>The first problem of a non-secret answer.</summary>
    internal static string? Problem(CanopyFlowField field, object? value, CanopyLabels labels) {
        var title = field.Label;
        switch (field.Kind) {
            case CanopyFlowFieldKind.Toggle:
                return field.IsRequired && !(value is bool on && on) ? Say(field.Validation, labels.GridEditRequired, title) : null;
            case CanopyFlowFieldKind.Records:
                return Records(field, value as IList, labels);
            case CanopyFlowFieldKind.List:
            case CanopyFlowFieldKind.MultiChoice:
            case CanopyFlowFieldKind.Pick:
                return Items(field, value as IList, labels);
            case CanopyFlowFieldKind.Duration: {
                if (value == null) return field.IsRequired ? Say(field.Validation, labels.GridEditRequired, title) : null;
                CanopyFlowValues.TryParseDuration((string)value, out var span);
                if (field.MinimumDuration.HasValue && span < field.MinimumDuration.Value) return Say(field.Validation, labels.GridEditMin, title, "min", Words(field.MinimumDuration.Value, labels));
                if (field.MaximumDuration.HasValue && span > field.MaximumDuration.Value) return Say(field.Validation, labels.GridEditMax, title, "max", Words(field.MaximumDuration.Value, labels));
                return null;
            }
            default:
                return Scalar(field.Validation, field.Kind, field.NumberStep, value, title, labels) ?? DisabledChoice(field, value, labels);
        }
    }

    /// <summary>The first problem of a secret the reader typed (lengths and pattern), or of one that is required and missing.</summary>
    internal static string? SecretProblem(CanopyFlowField field, string? value, bool kept, CanopyLabels labels) {
        if (value == null) return field.IsRequired && !kept ? Say(field.Validation, labels.GridEditRequired, field.Label) : null;
        return Scalar(field.Validation, CanopyFlowFieldKind.Text, null, value, field.Label, labels);
    }

    /// <summary>formCheck: required, then the number or date-and-time range and step, then text lengths and pattern.</summary>
    private static string? Scalar(CanopyCellValidation rules, CanopyFlowFieldKind kind, double? step, object? value, string title, CanopyLabels labels) {
        if (value == null || value is string empty && empty.Length == 0) return rules.Required ? Say(rules, labels.GridEditRequired, title) : null;
        if (value is double number) {
            if (rules.Minimum.HasValue && number < rules.Minimum.Value) return Say(rules, labels.GridEditMin, title, "min", CanopyDataValues.FormatNumber(rules.Minimum.Value));
            if (rules.Maximum.HasValue && number > rules.Maximum.Value) return Say(rules, labels.GridEditMax, title, "max", CanopyDataValues.FormatNumber(rules.Maximum.Value));
            if (step.HasValue) {
                var steps = (number - (rules.Minimum ?? 0)) / step.Value;
                if (Math.Abs(steps - Math.Round(steps)) > 1e-9) return Say(rules, labels.GridEditStep, title, "step", CanopyDataValues.FormatNumber(step.Value));
            }

            return null;
        }

        if (kind == CanopyFlowFieldKind.DateTime && value is string iso && CanopyFlowValues.TryParseMoment(iso, out var moment)) {
            var at = Truncate(moment);
            if (rules.Earliest.HasValue && at < Truncate(rules.Earliest.Value)) return Say(rules, labels.GridEditMin, title, "min", CanopyFlowValues.FormatMoment(rules.Earliest.Value));
            if (rules.Latest.HasValue && at > Truncate(rules.Latest.Value)) return Say(rules, labels.GridEditMax, title, "max", CanopyFlowValues.FormatMoment(rules.Latest.Value));
            return null;
        }

        if (value is string text) {
            if (rules.MinLength.HasValue && text.Length < rules.MinLength.Value) return Say(rules, labels.GridEditMinLength, title, "min", rules.MinLength.Value.ToString(CultureInfo.InvariantCulture));
            if (rules.MaxLength.HasValue && text.Length > rules.MaxLength.Value) return Say(rules, labels.GridEditMaxLength, title, "max", rules.MaxLength.Value.ToString(CultureInfo.InvariantCulture));
            if (rules.Pattern != null && !Matches(rules.Pattern, text)) return Say(rules, labels.GridEditPattern, title);
        }

        return null;
    }

    private static string? Items(CanopyFlowField field, IList? items, CanopyLabels labels) {
        var title = field.Label;
        if (items == null || items.Count == 0) return field.IsRequired ? Say(field.Validation, labels.GridEditRequired, title) : null;
        if (field.MinItems.HasValue && items.Count < field.MinItems.Value) return Fill(labels.FlowItemsMin, ("field", title), ("min", Count(field.MinItems.Value)));
        if (field.MaxItems.HasValue && items.Count > field.MaxItems.Value) return Fill(labels.FlowItemsMax, ("field", title), ("max", Count(field.MaxItems.Value)));
        if (field.Kind != CanopyFlowFieldKind.List) return DisabledChoice(field, items, labels);
        foreach (var entry in items) {
            var item = (string)entry!;
            if (field.ItemRule != CanopyFlowItemRule.None && !Fits(field.ItemRule, item)) return field.Validation.Message ?? Fill(RuleLabel(field.ItemRule, labels), ("item", item));
            if (field.ListItemPattern != null && !Matches(field.ListItemPattern, item)) return field.Validation.Message ?? Fill(labels.FlowItemPattern, ("item", item));
        }

        return null;
    }

    /// <summary>Document options may describe a disabled initial value, but a submitted choice must be available.</summary>
    private static string? DisabledChoice(CanopyFlowField field, object? value, CanopyLabels labels) {
        if (value == null || field.OptionsSource == CanopyFlowOptionsSource.Host) return null;
        foreach (var option in field.Options) {
            if (option.DisabledReason == null) continue;
            if (value is IList items) {
                foreach (var item in items) if (item != null && CanopyFlowValues.SameScalar(option.Value, item))
                    return Say(field.Validation, labels.GridEditChoice, field.Label);
            } else if (CanopyFlowValues.SameScalar(option.Value, value)) {
                return Say(field.Validation, labels.GridEditChoice, field.Label);
            }
        }

        return null;
    }

    private static string? Records(CanopyFlowField field, IList? rows, CanopyLabels labels) {
        var title = field.Label;
        if (rows == null || rows.Count == 0) return field.IsRequired ? Say(field.Validation, labels.GridEditRequired, title) : null;
        if (field.MinItems.HasValue && rows.Count < field.MinItems.Value) return Fill(labels.FlowItemsMin, ("field", title), ("min", Count(field.MinItems.Value)));
        if (field.MaxItems.HasValue && rows.Count > field.MaxItems.Value) return Fill(labels.FlowItemsMax, ("field", title), ("max", Count(field.MaxItems.Value)));
        for (var index = 0; index < rows.Count; index++) {
            var row = (IDictionary<string, object?>)rows[index]!;
            foreach (var column in field.Columns) {
                if (column.Kind == CanopyFlowRecordColumnKind.Toggle) continue;
                row.TryGetValue(column.Id, out var cell);
                var problem = Problem(column.CellField(), cell, labels);
                if (problem != null) return Fill(labels.FlowRecordProblem, ("row", Count(index + 1)), ("message", problem));
            }
        }

        return null;
    }

    /// <summary>The built-in item rules, as FLOW_ITEM_RULES checks them.</summary>
    internal static bool Fits(CanopyFlowItemRule rule, string value) {
        switch (rule) {
            case CanopyFlowItemRule.Email: return Email.IsMatch(value);
            case CanopyFlowItemRule.Host: return value.Length <= 253 && Host.IsMatch(value);
            case CanopyFlowItemRule.IpAddress: return IsIPv4(value) || IsIPv6(value);
            case CanopyFlowItemRule.Cidr: {
                var parts = value.Split('/');
                if (parts.Length != 2 || !Prefix.IsMatch(parts[1])) return false;
                var bits = int.Parse(parts[1], CultureInfo.InvariantCulture);
                return IsIPv4(parts[0]) && bits <= 32 || IsIPv6(parts[0]) && bits <= 128;
            }
            case CanopyFlowItemRule.Url:
                return Uri.TryCreate(value, UriKind.Absolute, out var url) && (url.Scheme == Uri.UriSchemeHttp || url.Scheme == Uri.UriSchemeHttps) && url.Host.Length > 0;
            default: return true;
        }
    }

    private static bool IsIPv4(string value) => IPv4.IsMatch(value);

    private static bool IsIPv6(string value) =>
        IPv6Shape.IsMatch(value) && value.IndexOf(':') >= 0 && IPAddress.TryParse(value, out var address) && address.AddressFamily == AddressFamily.InterNetworkV6;

    private static string RuleLabel(CanopyFlowItemRule rule, CanopyLabels labels) => rule switch {
        CanopyFlowItemRule.Email => labels.FlowItemEmail,
        CanopyFlowItemRule.Host => labels.FlowItemHost,
        CanopyFlowItemRule.IpAddress => labels.FlowItemIp,
        CanopyFlowItemRule.Cidr => labels.FlowItemCidr,
        _ => labels.FlowItemUrl
    };

    /// <summary>Whether the whole text matches a pattern in the syntax JavaScript and .NET share; a match that runs too long fails.</summary>
    internal static bool Matches(string pattern, string text) {
        try {
            var match = CommitValidation.Compile(pattern).Match(text);
            // .NET's $ also matches before a final line feed; JavaScript's does not.
            return match.Success && match.Index == 0 && match.Length == text.Length;
        } catch (RegexMatchTimeoutException) {
            return false;
        } catch (ArgumentException) {
            return false;
        }
    }

    private static DateTimeOffset Truncate(DateTimeOffset value) => new DateTimeOffset(value.UtcTicks - value.UtcTicks % TimeSpan.TicksPerMillisecond, TimeSpan.Zero);

    private static string Say(CanopyCellValidation rules, string template, string title, string? name = null, string? value = null) =>
        rules.Message ?? (name == null ? Fill(template, ("column", title)) : Fill(template, ("column", title), (name, value!)));

    private static string Count(int value) => value.ToString(CultureInfo.InvariantCulture);

    /// <summary>A duration in words, in the largest unit that divides it, as the review page says it.</summary>
    internal static string Words(TimeSpan value, CanopyLabels labels) {
        var seconds = value.Ticks / TimeSpan.TicksPerSecond;
        var (size, template) = seconds % 86400 == 0 && seconds >= 86400 ? (86400L, labels.FlowDays) : seconds % 3600 == 0 && seconds >= 3600 ? (3600L, labels.FlowHours) :
            seconds % 60 == 0 && seconds >= 60 ? (60L, labels.FlowMinutes) : (1L, labels.FlowSeconds);
        var count = seconds / size;
        return Fill(Plural(template, count), ("count", count.ToString(CultureInfo.InvariantCulture)));
    }

    /// <summary>The form of a plural label (<c>[one]…[other]…</c>) for a count: "one" for 1, otherwise "other".</summary>
    private static string Plural(string template, long count) {
        if (template.IndexOf('[') != 0) return template;
        var forms = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (Match match in Regex.Matches(template, @"\[([a-z]+)\]([^\[]*)")) forms[match.Groups[1].Value] = match.Groups[2].Value;
        if (count == 1 && forms.TryGetValue("one", out var one)) return one;
        return forms.TryGetValue("other", out var other) ? other : template;
    }

    /// <summary>Fills <c>{name}</c> placeholders, as the browser's fill does.</summary>
    internal static string Fill(string template, params (string Name, string Value)[] values) {
        var text = template;
        foreach (var (name, value) in values) text = text.Replace("{" + name + "}", value);
        return text;
    }
}
