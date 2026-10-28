using System;
using System.IO;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace CanopyX.Data;

public sealed partial class CanopyRemoteHandler {
    /// <summary>Answers a bounded <c>gridPivotQuery</c> over the complete accepted query.</summary>
    /// <param name="json">The query and axis definition.</param>
    /// <param name="cancellationToken">Cancels validation and store reads.</param>
    /// <returns>A revisioned <c>gridPivot</c> document.</returns>
    public Task<string> PivotAsync(string json, CancellationToken cancellationToken = default) => PivotAsync(CanopyRequestParser.ParsePivot(json, Schema, Options.Limits), cancellationToken);

    /// <summary>Answers an allow-listed pivot request without reading or grouping cached pages.</summary>
    /// <param name="request">The accepted full query and axes.</param>
    /// <param name="cancellationToken">Cancels store reads.</param>
    /// <returns>The pivot data, echoed query and revision.</returns>
    public async Task<string> PivotAsync(CanopyPivotRequest request, CancellationToken cancellationToken = default) {
        if (request == null) throw new ArgumentNullException(nameof(request));
        Own(request.Query); RequireSummaryWireQuery(request.Query);
        if (!(Provider is ICanopyPivotProvider provider)) throw new CanopyRequestException(CanopyRequestError.Unsupported, "This endpoint does not compute pivots.");
        var revision = await RevisionAsync(request.Query.Revision, cancellationToken).ConfigureAwait(false);
        var result = await provider.PivotAsync(request, cancellationToken).ConfigureAwait(false);
        if (result.View != Schema.ViewId) throw new InvalidOperationException("The pivot provider returned another view's result.");
        await RevisionAsync(revision, cancellationToken).ConfigureAwait(false);
        using var document = JsonDocument.Parse(result.ToJson());
        using var stream = new MemoryStream();
        using (var writer = new Utf8JsonWriter(stream)) {
            writer.WriteStartObject(); foreach (var field in document.RootElement.EnumerateObject()) field.WriteTo(writer);
            writer.WriteString("revision", revision); writer.WritePropertyName("query"); WriteQueryEcho(writer, request.Query, revision); writer.WriteEndObject();
        }
        var json = Encoding.UTF8.GetString(stream.ToArray());
        if (json.Length > 4194304) throw CanopyRequestException.Limit("The pivot exceeds its response limit. Narrow the query or axes.");
        return json;
    }
}
