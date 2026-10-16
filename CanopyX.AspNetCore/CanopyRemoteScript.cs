using System;
using System.IO;
using System.Text;
using System.Text.Json;
using System.Security.Cryptography;
using CanopyX.Data;

namespace CanopyX.AspNetCore;

/// <summary>Writes the small browser script that connects a hosted CanopyX grid to endpoints mapped by <see cref="CanopyRemoteEndpointExtensions"/>.</summary>
/// <remarks>
/// The script calls <c>CanopyX.configure(viewId, …)</c> with a source whose <c>query</c>, <c>facet</c>, <c>summary</c>, for a view with a
/// filterable date column <c>range</c> (calendar and timeline periods, posted to <c>{endpoint}/range</c>),
/// for a view with editable columns <c>commit</c>, and for a record schema <c>record</c> hooks post to the endpoints (with the
/// grid's cancellation signal), and registers one export format per server format so the Export menu offers a complete
/// server-side download. After a commit answers with a new dataset revision the grid reloads, because the revision it read
/// pages at is gone; map a writer (<see cref="CanopyRemoteEndpointOptions.Writer"/>) for views with editable columns. Include
/// the script after the CanopyX runtime and before the grid mounts. It sends same-origin credentials and expects JSON error
/// bodies, whose message the grid shows; rejected requests carry the HTTP <c>status</c> and the error <c>code</c>.
/// </remarks>
public static class CanopyRemoteScript {
    private static readonly (string Id, string Label)[] DefaultFormats = { ("csv", "CSV from server (all matching rows)") };

    /// <summary>Creates the script element for a grid.</summary>
    /// <param name="schema">The schema the endpoints serve; it decides whether value-list and summary hooks are wired.</param>
    /// <param name="endpoint">The route prefix the endpoints were mapped at, for example <c>/api/hosts</c>.</param>
    /// <param name="exportFormats">Server export formats to offer in the Export menu, with their menu labels, for example
    /// <c>("csv", "CSV, all matching rows")</c>. Null offers server CSV with an English label.</param>
    /// <returns>A <c>&lt;script&gt;</c> element.</returns>
    public static string Element(CanopyDataSchema schema, string endpoint, params (string Id, string Label)[]? exportFormats) =>
        "<script>" + Script(schema, endpoint, exportFormats) + "</script>";

    /// <summary>Creates the script text for a grid, without the element.</summary>
    /// <param name="schema">The schema the endpoints serve.</param>
    /// <param name="endpoint">The route prefix.</param>
    /// <param name="exportFormats">Server export formats with their menu labels; null offers server CSV.</param>
    /// <returns>The JavaScript text, safe to place inside a <c>&lt;script&gt;</c> element.</returns>
    public static string Script(CanopyDataSchema schema, string endpoint, params (string Id, string Label)[]? exportFormats) =>
        Write(schema ?? throw new ArgumentNullException(nameof(schema)), endpoint, exportFormats, false);

    /// <summary>Creates the script element for a grid whose record panel loads details from the record route.</summary>
    /// <param name="records">The record allow-list the record route serves (<see cref="CanopyRecordMap{T}.Schema"/>); its
    /// <see cref="CanopyRecordSchema.Data"/> decides the other hooks.</param>
    /// <param name="endpoint">The route prefix the endpoints were mapped at.</param>
    /// <param name="exportFormats">Server export formats with their menu labels; null offers server CSV.</param>
    /// <returns>A <c>&lt;script&gt;</c> element.</returns>
    public static string Element(CanopyRecordSchema records, string endpoint, params (string Id, string Label)[]? exportFormats) =>
        "<script>" + Script(records, endpoint, exportFormats) + "</script>";

    /// <summary>Creates the script text for a grid whose record panel loads details from the record route, without the element.</summary>
    /// <param name="records">The record allow-list the record route serves.</param>
    /// <param name="endpoint">The route prefix.</param>
    /// <param name="exportFormats">Server export formats with their menu labels; null offers server CSV.</param>
    /// <returns>The JavaScript text, safe to place inside a <c>&lt;script&gt;</c> element.</returns>
    /// <remarks>
    /// The source's <c>record</c> hook posts to <c>{endpoint}/record</c>. A 404 <c>recordNotFound</c> answers null: the drawer
    /// shows the row without details, and a record the grid has not loaded stays unopened. A 409 <c>staleRevision</c> (the data
    /// changed since the grid read its rows, for example after a save) reloads the grid at the current revision and opens the
    /// same record again there, because details always belong to the rows they open from. Other errors reject, so the drawer
    /// shows the message with Retry.
    /// </remarks>
    public static string Script(CanopyRecordSchema records, string endpoint, params (string Id, string Label)[]? exportFormats) =>
        Write((records ?? throw new ArgumentNullException(nameof(records))).Data, endpoint, exportFormats, true);

    private static string Write(CanopyDataSchema schema, string endpoint, (string Id, string Label)[]? exportFormats, bool records) {
        if (string.IsNullOrEmpty(endpoint)) throw new ArgumentException("The endpoint is required.", nameof(endpoint));
        if (exportFormats == null || exportFormats.Length == 0) exportFormats = DefaultFormats;
        var facets = false;
        var range = false;
        foreach (var column in schema.Columns) {
            facets |= column.Facetable;
            range |= column.Filterable && column.Kind == CanopyColumnKind.DateTime;
        }
        using var stream = new MemoryStream();
        using (var writer = new Utf8JsonWriter(stream)) {
            writer.WriteStartObject();
            writer.WriteString("view", schema.ViewId);
            writer.WriteString("endpoint", endpoint.TrimEnd('/'));
            writer.WriteBoolean("facets", facets);
            writer.WriteBoolean("summary", schema.HasSummary);
            writer.WriteBoolean("range", range);
            writer.WriteBoolean("commit", schema.EditableColumns.Count > 0);
            writer.WriteBoolean("records", records);
            writer.WriteStartArray("formats");
            foreach (var (id, label) in exportFormats) {
                writer.WriteStartObject();
                writer.WriteString("id", id);
                writer.WriteString("exportId", "remote-" + Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(schema.ViewId + "\0" + endpoint + "\0" + id))).ToLowerInvariant().Substring(0, 24));
                writer.WriteString("label", label);
                writer.WriteEndObject();
            }
            writer.WriteEndArray();
            writer.WriteEndObject();
        }
        // Utf8JsonWriter's default encoder escapes <, > and &, so the settings cannot close the script element.
        return "(function(settings){" + Body + "})(" + Encoding.UTF8.GetString(stream.ToArray()) + ");";
    }

    private const string Body = """
async function post(path, body, signal, missing) {
  const response = await fetch(settings.endpoint + path, { method: "POST", credentials: "same-origin", signal,
    headers: { "Content-Type": "application/json", "Accept": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) {
    let message = "The server answered " + response.status + ".", code = null;
    try { const problem = await response.json(); if (problem && typeof problem.message === "string") message = problem.message; if (problem && typeof problem.error === "string") code = problem.error; } catch (ignored) { }
    if (missing && response.status === 404 && code === "recordNotFound") return null;
    const error = new Error(message);
    error.status = response.status; error.code = code;
    throw error;
  }
  return response;
}
async function exportFile(response, fallback) {
  const disposition = response.headers.get("Content-Disposition") || "";
  const encoded = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(disposition), plain = /filename\s*=\s*(?:"([^"]*)"|([^;]*))/i.exec(disposition);
  let name = plain ? (plain[1] || plain[2]).trim() : fallback;
  if (encoded) { try { name = decodeURIComponent(encoded[1].trim()); } catch (ignored) { } }
  name = name.split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f]/g, "_");
  if (!name || name === "." || name === "..") name = fallback;
  const blob = await response.blob();
  return new File([blob], name, { type: blob.type });
}
const source = { query: (query, options) => post("/query", query, options.signal).then(response => response.json()) };
if (settings.records) {
  // A record that is not available answers null: no details, and a record the grid has not loaded stays unopened.
  const read = (request, signal) => post("/record", request, signal, true).then(response => response && response.json());
  source.record = (request, options) => read(request, options.signal).catch(error => {
    // The data changed since the grid read its rows (a save, here or elsewhere). Details belong to the rows they open from,
    // so the grid reloads at the current revision and opens the same record again there.
    if (error.code === "staleRevision" && request.revision) reopenAtCurrentRevision(request.id);
    throw error;
  });
}
let reloading = false;
function reopenAtCurrentRevision(id) {
  if (reloading) return;
  for (const host of document.querySelectorAll("[data-canopyx-mounted]")) {
    const grid = host.canopyx;
    if (!grid || !grid.view || grid.view.id !== settings.view) continue;
    reloading = true;
    setTimeout(() => Promise.resolve(grid.reload()).then(() => grid.openRecord(id)).catch(() => { }).then(() => { reloading = false; }), 0);
    return;
  }
}
if (settings.facets) source.facet = (request, options) => post("/facet", request, options.signal).then(response => response.json());
if (settings.summary) source.summary = (query, options) => post("/summary", query, options.signal).then(response => response.json());
if (settings.range) source.range = (request, options) => post("/range", request, options.signal).then(response => response.json());
if (settings.commit) {
  // Saving changes a revision the grid still reads pages at; once a commit answers with a new one, the grid reloads.
  // Grid events do not bubble, so the document listens in the capture phase.
  const asked = new Set();
  source.commit = (batch, options) => post("/commit", batch, options.signal).then(response => response.json()).then(result => {
    if (result && typeof result.revision === "string" && result.revision !== batch.revision) asked.add(result.revision);
    return result;
  });
  document.addEventListener("canopyx:commit", event => {
    const grid = event.target && event.target.canopyx, revision = event.detail && event.detail.revision;
    if (!grid || grid.view.id !== settings.view || !asked.delete(revision)) return;
    grid.reload();
  }, true);
}
const ids = settings.formats.map(format => {
  const id = format.exportId;
  CanopyX.registerExportFormat({ id, label: format.label, extension: format.id.replace(/[^a-z0-9]/g, "").slice(0, 16) || "dat",
    async write(capture, context) {
      const response = await post("/export/" + encodeURIComponent(format.id), capture.request, context.signal);
      return exportFile(response, context.fileName + "." + format.id);
    } });
  return id;
});
CanopyX.configure(settings.view, { source, exportFormats: ids,
  onExport: async event => {
    const format = settings.formats.find(item => item.id === event.format) || settings.formats[0];
    const response = await post("/export/" + encodeURIComponent(format.id), event.request, event.signal);
    const blob = await exportFile(response, (event.request.fileName || settings.view) + "." + format.id), link = document.createElement("a");
    link.href = URL.createObjectURL(blob); link.download = blob.name;
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(link.href), 0);
  } });
""";
}
