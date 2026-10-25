using System.IO;
using System.Text;
using System.Text.Json;

namespace CanopyX.Data;

/// <summary>Captures the complete authored definition while limiting advertised operations to the server schema.</summary>
internal static class CanopySchemaDefinition {
    internal static string Capture(string definition, CanopyDataSchema schema) {
        var changed = false;
        foreach (var column in schema.View.Columns) {
            if (!schema.TryGetColumn(column.Id, out var allowed) || allowed.Filterable != column.Filterable || allowed.Sortable != column.Sortable) {
                changed = true;
                break;
            }
        }
        if (!changed) return definition;

        using var document = JsonDocument.Parse(definition);
        using var stream = new MemoryStream();
        using (var writer = new Utf8JsonWriter(stream)) {
            writer.WriteStartObject();
            foreach (var property in document.RootElement.EnumerateObject()) {
                if (property.Name == "columns") {
                    writer.WriteStartArray("columns");
                    foreach (var column in property.Value.EnumerateArray()) Column(writer, column, schema);
                    writer.WriteEndArray();
                } else if (property.Name == "searchColumns") {
                    // Omitting an emptied explicit list would otherwise mean search-all to a browser.
                    if (schema.SearchColumns.Count != 0) Identities(writer, property, schema);
                } else if (property.Name == "search" && schema.View.SearchColumns.Count != 0 && schema.SearchColumns.Count == 0) {
                    writer.WriteBoolean("search", false);
                } else if (property.Name == "reporting") {
                    writer.WriteStartObject("reporting");
                    foreach (var option in property.Value.EnumerateObject()) {
                        if (option.Name == "facetColumns") Identities(writer, option, schema);
                        else if (option.Name == "ordering") {
                            writer.WriteStartObject("ordering");
                            foreach (var ordering in option.Value.EnumerateObject())
                                if (schema.TryGetColumn(ordering.Name, out _)) ordering.WriteTo(writer);
                            writer.WriteEndObject();
                        } else option.WriteTo(writer);
                    }
                    writer.WriteEndObject();
                } else property.WriteTo(writer);
            }
            writer.WriteEndObject();
        }
        // The core writer also escapes interpolation starts so a document stays literal inside a bundle's template string.
        return Encoding.UTF8.GetString(stream.ToArray()).Replace("${", "\\u0024{");
    }

    private static void Column(Utf8JsonWriter writer, JsonElement definition, CanopyDataSchema schema) {
        var mapped = schema.TryGetColumn(definition.GetProperty("id").GetString()!, out var column);
        writer.WriteStartObject();
        foreach (var property in definition.EnumerateObject()) {
            if (!mapped && (property.Name == "sortable" || property.Name == "editable" || property.Name == "editor" ||
                property.Name == "validation" || property.Name == "filterable" || property.Name == "exportable" || property.Name == "aggregatable")) continue;
            if (mapped && !column.Filterable && property.Name == "filterable") continue;
            if (mapped && !column.Sortable && property.Name == "sortable") continue;
            property.WriteTo(writer);
        }
        if (!mapped) {
            writer.WriteBoolean("sortable", false);
            writer.WriteBoolean("filterable", false);
            writer.WriteBoolean("exportable", false);
        } else {
            if (!column.Filterable) writer.WriteBoolean("filterable", false);
            if (!column.Sortable) writer.WriteBoolean("sortable", false);
        }
        writer.WriteEndObject();
    }

    private static void Identities(Utf8JsonWriter writer, JsonProperty property, CanopyDataSchema schema) {
        writer.WriteStartArray(property.Name);
        foreach (var id in property.Value.EnumerateArray())
            if (schema.TryGetColumn(id.GetString()!, out _)) id.WriteTo(writer);
        writer.WriteEndArray();
    }
}
