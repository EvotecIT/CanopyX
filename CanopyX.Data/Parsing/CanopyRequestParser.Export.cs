using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
using System.Text.Json;

namespace CanopyX.Data;

public static partial class CanopyRequestParser {
    /// <summary>Parses an export request: the request object the browser grid hands to its host export hook.</summary>
    /// <param name="json">The request: <c>scope</c>, <c>query</c>, <c>revision</c>, <c>selection</c>, optional
    /// <c>querySelection</c>, <c>columns</c>, <c>values</c>, <c>timeZone</c>, optional <c>recordCount</c>, <c>locale</c> and <c>fileName</c>.</param>
    /// <param name="schema">The column allow-list.</param>
    /// <param name="limits">Safety limits; null uses the defaults.</param>
    /// <returns>The validated export request with the effective record query of its scope.</returns>
    /// <exception cref="CanopyRequestException">The request is invalid or exceeds a limit.</exception>
    public static CanopyExportRequest ParseExport(string json, CanopyDataSchema schema, CanopyRemoteLimits? limits = null) {
        if (schema == null) throw new ArgumentNullException(nameof(schema));
        limits ??= new CanopyRemoteLimits();
        using var document = Open(json, limits);
        var root = RequireObject(document.RootElement, "export request");
        var scope = (OptionalString(root, "scope") ?? "filtered") switch {
            "filtered" => CanopyExportScope.Filtered,
            "selected" => CanopyExportScope.Selected,
            "all" => CanopyExportScope.All,
            _ => throw new CanopyRequestException(CanopyRequestError.InvalidExport, "The export scope is filtered, selected or all.")
        };
        if (!root.TryGetProperty("query", out var queryElement)) throw new CanopyRequestException(CanopyRequestError.InvalidExport, "An export needs its accepted query.");
        var query = Query(queryElement, schema, limits, true);
        var revision = OptionalString(root, "revision") ?? query.Revision ?? throw new CanopyRequestException(CanopyRequestError.InvalidExport, "An export needs its accepted revision.");
        RequireIdentifier(revision, "revision");
        if (query.Revision != null && query.Revision != revision) throw new CanopyRequestException(CanopyRequestError.InvalidExport, "The export query and revision differ.");
        var window = limits.MaxExportRows + 1;
        CanopyDataRequest effective;
        switch (scope) {
            case CanopyExportScope.Filtered:
                effective = query.WithWindow(0, window);
                break;
            case CanopyExportScope.All:
                effective = query.WithoutCriteria().WithWindow(0, window);
                break;
            default:
                effective = Selection(root, schema, limits, query, revision).WithWindow(0, window);
                break;
        }
        var columns = ExportColumns(root, schema);
        var values = OptionalString(root, "values") ?? "display";
        if (values != "display" && values != "raw") throw new CanopyRequestException(CanopyRequestError.InvalidExport, "Export values are display or raw.");
        var zone = OptionalString(root, "timeZone") ?? "utc";
        if (zone != "utc" && zone != "local") throw new CanopyRequestException(CanopyRequestError.InvalidExport, "The export time zone is utc or local.");
        int? recordCount = null;
        if (root.TryGetProperty("recordCount", out var count) && count.ValueKind != JsonValueKind.Null) {
            if (count.ValueKind != JsonValueKind.Number || !count.TryGetInt32(out var parsed) || parsed < 0)
                throw new CanopyRequestException(CanopyRequestError.InvalidExport, "The record count must be a nonnegative integer or null.");
            recordCount = parsed;
        }
        return new CanopyExportRequest(scope, effective, columns, values == "raw", revision, recordCount,
            SafeFileName(OptionalString(root, "fileName"), schema.ViewId), Locale(OptionalString(root, "locale")),
            zone == "local" ? CanopyTimeZone.Local : CanopyTimeZone.Utc);
    }

    private static CanopyDataRequest Selection(JsonElement root, CanopyDataSchema schema, CanopyRemoteLimits limits, CanopyDataRequest query, string revision) {
        if (root.TryGetProperty("querySelection", out var selection) && selection.ValueKind != JsonValueKind.Null) {
            RequireObject(selection, "query selection");
            if (OptionalString(selection, "kind") != "query") throw new CanopyRequestException(CanopyRequestError.InvalidExport, "A query selection has kind query.");
            if (OptionalString(selection, "revision") is string selected && selected != revision)
                throw new CanopyRequestException(CanopyRequestError.InvalidExport, "The selection belongs to another revision.");
            if (!selection.TryGetProperty("query", out var selectionQuery)) throw new CanopyRequestException(CanopyRequestError.InvalidExport, "A query selection needs its query.");
            var criteria = Query(selectionQuery, schema, limits, true);
            if (criteria.Revision != null && criteria.Revision != revision)
                throw new CanopyRequestException(CanopyRequestError.InvalidExport, "The selection query belongs to another revision.");
            return criteria.WithIdentities(null, Identities(selection, "excludedIds", limits, true));
        }
        var ids = Identities(root, "selection", limits, false);
        if (ids.Count == 0) throw new CanopyRequestException(CanopyRequestError.InvalidExport, "A selected export needs selected records.");
        return query.WithoutCriteria().WithIdentities(ids, null);
    }

    private static List<string> Identities(JsonElement owner, string name, CanopyRemoteLimits limits, bool optional) {
        var ids = new List<string>();
        if (!owner.TryGetProperty(name, out var list) || list.ValueKind == JsonValueKind.Null) {
            if (optional) return ids;
            throw new CanopyRequestException(CanopyRequestError.InvalidExport, "The field '" + name + "' is required.");
        }
        if (list.ValueKind != JsonValueKind.Array) throw new CanopyRequestException(CanopyRequestError.InvalidExport, "The field '" + name + "' must be an array of identities.");
        if (list.GetArrayLength() > limits.MaxSelectedIds) throw CanopyRequestException.Limit("Too many record identities.");
        foreach (var item in list.EnumerateArray()) {
            if (item.ValueKind != JsonValueKind.String) throw new CanopyRequestException(CanopyRequestError.InvalidExport, "Record identities are text.");
            var id = item.GetString()!;
            RequireIdentifier(id, "record identity");
            ids.Add(id);
        }
        return ids;
    }

    private static List<CanopyDataColumn> ExportColumns(JsonElement root, CanopyDataSchema schema) {
        var columns = new List<CanopyDataColumn>();
        var seen = new HashSet<string>(StringComparer.Ordinal);
        if (root.TryGetProperty("columns", out var list) && list.ValueKind != JsonValueKind.Null) {
            if (list.ValueKind != JsonValueKind.Array) throw new CanopyRequestException(CanopyRequestError.InvalidExport, "Export columns must be an array.");
            foreach (var item in list.EnumerateArray()) {
                var id = item.ValueKind == JsonValueKind.String ? item.GetString()! : item.ValueKind == JsonValueKind.Object ? RequireString(item, "id") :
                    throw new CanopyRequestException(CanopyRequestError.InvalidExport, "An export column is an identity or an object with an id.");
                var column = schema.GetColumn(id);
                if (!seen.Add(column.Id)) throw new CanopyRequestException(CanopyRequestError.InvalidExport, "Export columns must be unique.");
                columns.Add(column);
            }
        }
        if (columns.Count == 0) foreach (var column in schema.Columns) if (!column.Hidden) columns.Add(column);
        if (columns.Count == 0) throw new CanopyRequestException(CanopyRequestError.InvalidExport, "An export needs at least one column.");
        return columns;
    }

    /// <summary>Keeps letters, digits, spaces, dots, dashes and underscores, and prefixes reserved Windows device names.</summary>
    internal static string SafeFileName(string? name, string fallback) {
        var source = string.IsNullOrWhiteSpace(name) ? fallback : name!;
        var builder = new StringBuilder(Math.Min(source.Length, 100));
        foreach (var unit in source) {
            if (builder.Length == 100) break;
            builder.Append(unit < 128 && (char.IsLetterOrDigit(unit) || unit == ' ' || unit == '-' || unit == '_' || unit == '.') ? unit : '_');
        }
        var text = builder.ToString().Trim().TrimEnd('.').TrimStart('.');
        if (text.Length == 0) return "export";
        // Windows reserves the device stem even when one or more file extensions follow it.
        var dot = text.IndexOf('.');
        var stem = (dot < 0 ? text : text.Substring(0, dot)).TrimEnd(' ');
        if (IsWindowsDeviceName(stem)) text = "_" + text.Substring(0, Math.Min(text.Length, 99)).TrimEnd('.', ' ');
        return text;
    }

    private static bool IsWindowsDeviceName(string stem) =>
        stem.Equals("CON", StringComparison.OrdinalIgnoreCase) || stem.Equals("PRN", StringComparison.OrdinalIgnoreCase) ||
        stem.Equals("AUX", StringComparison.OrdinalIgnoreCase) || stem.Equals("NUL", StringComparison.OrdinalIgnoreCase) ||
        stem.Length == 4 && stem[3] >= '1' && stem[3] <= '9' &&
        (stem.StartsWith("COM", StringComparison.OrdinalIgnoreCase) || stem.StartsWith("LPT", StringComparison.OrdinalIgnoreCase));

    /// <summary>Only cultures the platform lists are accepted, so client text cannot grow the runtime's culture cache.</summary>
    private static readonly Lazy<Dictionary<string, string>> KnownCultures = new Lazy<Dictionary<string, string>>(() => {
        var names = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var culture in CultureInfo.GetCultures(CultureTypes.AllCultures)) if (culture.Name.Length > 0) names[culture.Name] = culture.Name;
        return names;
    });

    private static string? Locale(string? name) {
        if (name == null || name.Length == 0 || name.Length > 85) return null;
        return KnownCultures.Value.TryGetValue(name, out var known) ? known : null;
    }
}
