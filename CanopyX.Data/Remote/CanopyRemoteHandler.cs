using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.IO;
using System.Linq;
using System.Runtime.CompilerServices;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace CanopyX.Data;

/// <summary>Serves the remote grid protocol over a data provider: parses requests, enforces limits and revisions,
/// and writes the documents the browser runtime accepts.</summary>
/// <remarks>
/// The handler is transport-neutral: hosts pass request bodies in and write the returned documents out (the
/// <c>CanopyX.AspNetCore</c> package maps it to minimal-API endpoints). Methods throw
/// <see cref="CanopyRequestException"/> for client errors; any other exception is a server failure and must not be echoed.
/// Instances are thread-safe when the provider is.
/// </remarks>
public sealed partial class CanopyRemoteHandler {
    private readonly Dictionary<string, ICanopyExportFormat> _formats = new Dictionary<string, ICanopyExportFormat>(StringComparer.Ordinal);

    /// <summary>Creates a handler.</summary>
    /// <param name="schema">The column allow-list.</param>
    /// <param name="provider">The data provider.</param>
    /// <param name="options">Limits and export formats; null uses the defaults.</param>
    /// <param name="writer">Saves commits; null serves reads only, and commits answer <see cref="CanopyRequestError.Unsupported"/>.</param>
    public CanopyRemoteHandler(CanopyDataSchema schema, ICanopyDataProvider provider, CanopyRemoteOptions? options = null, ICanopyDataWriter? writer = null) {
        Schema = schema ?? throw new ArgumentNullException(nameof(schema));
        Provider = provider ?? throw new ArgumentNullException(nameof(provider));
        Options = options ?? new CanopyRemoteOptions();
        Writer = writer;
        foreach (var format in Options.ExportFormats) {
            if (format == null || !ValidFormatId(format.Id)) throw new ArgumentException("Export format identities are 1 to 32 lowercase ASCII letters, digits and hyphens.", nameof(options));
            _formats[format.Id] = format;
        }
    }

    /// <summary>Gets the column allow-list.</summary>
    public CanopyDataSchema Schema { get; }

    /// <summary>Gets the data provider.</summary>
    public ICanopyDataProvider Provider { get; }

    /// <summary>Gets the writer that saves commits, or null for a read-only endpoint.</summary>
    public ICanopyDataWriter? Writer { get; }

    /// <summary>Gets the options.</summary>
    public CanopyRemoteOptions Options { get; }

    /// <summary>Gets the registered export format identities.</summary>
    public IReadOnlyCollection<string> ExportFormats => new ReadOnlyCollection<string>(_formats.Keys.ToList());

    /// <summary>Answers a <c>gridQuery</c> document with a <c>gridPage</c> document.</summary>
    /// <param name="json">The request body.</param>
    /// <param name="cancellationToken">Cancels the request.</param>
    /// <returns>The page document.</returns>
    public Task<string> QueryAsync(string json, CancellationToken cancellationToken = default) =>
        QueryAsync(CanopyRequestParser.ParseQuery(json, Schema, Options.Limits), cancellationToken);

    /// <summary>Answers a query given as query-string parameters with a <c>gridPage</c> document.</summary>
    /// <param name="parameters">The decoded parameters (see <see cref="CanopyRequestParser.ParseQuery(IEnumerable{KeyValuePair{string, string}}, CanopyDataSchema, CanopyRemoteLimits)"/>).</param>
    /// <param name="cancellationToken">Cancels the request.</param>
    /// <returns>The page document.</returns>
    public Task<string> QueryAsync(IEnumerable<KeyValuePair<string, string?>> parameters, CancellationToken cancellationToken = default) =>
        QueryAsync(CanopyRequestParser.ParseQuery(parameters, Schema, Options.Limits), cancellationToken);

    /// <summary>Answers a validated request with a <c>gridPage</c> document.</summary>
    /// <param name="request">The validated request.</param>
    /// <param name="cancellationToken">Cancels the request.</param>
    /// <returns>The page document.</returns>
    public async Task<string> QueryAsync(CanopyDataRequest request, CancellationToken cancellationToken = default) {
        if (request == null) throw new ArgumentNullException(nameof(request));
        Own(request);
        var revision = await RevisionAsync(request.Revision, cancellationToken).ConfigureAwait(false);
        var result = await Provider.QueryAsync(request, cancellationToken).ConfigureAwait(false);
        await RevisionAsync(revision, cancellationToken).ConfigureAwait(false);
        if (request.Offset > result.Matched) throw new CanopyRequestException(CanopyRequestError.OffsetOutOfRange, "The page starts beyond the matching rows.");
        var expected = Math.Min(request.Limit, result.Matched - request.Offset);
        // Records written between the count and the read change the window; the client reloads instead of mixing snapshots.
        if (result.Rows.Count != expected) throw new CanopyRequestException(CanopyRequestError.StaleRevision, "The data changed; reload the grid.");
        var page = new CanopyGridPage(Schema.ViewId, revision, request.Offset, result.Total, result.Matched);
        foreach (var row in result.Rows) page.Rows.Add(row);
        return page.ToJson(Schema.ProtocolView);
    }

    /// <summary>Answers a <c>gridFacetQuery</c> document with a <c>gridFacetPage</c> document.</summary>
    /// <param name="json">The request body.</param>
    /// <param name="cancellationToken">Cancels the request.</param>
    /// <returns>The value-list document.</returns>
    public Task<string> FacetAsync(string json, CancellationToken cancellationToken = default) =>
        FacetAsync(CanopyRequestParser.ParseFacet(json, Schema, Options.Limits), cancellationToken);

    /// <summary>Answers a validated value-list request with a <c>gridFacetPage</c> document.</summary>
    /// <param name="request">The validated request.</param>
    /// <param name="cancellationToken">Cancels the request.</param>
    /// <returns>The value-list document.</returns>
    public async Task<string> FacetAsync(CanopyFacetRequest request, CancellationToken cancellationToken = default) {
        if (request == null) throw new ArgumentNullException(nameof(request));
        Own(request.Query);
        var revision = await RevisionAsync(request.Query.Revision, cancellationToken).ConfigureAwait(false);
        var result = await Provider.FacetAsync(request, cancellationToken).ConfigureAwait(false);
        await RevisionAsync(revision, cancellationToken).ConfigureAwait(false);
        var page = new CanopyGridFacetPage(Schema.ViewId, revision, request.Column.Id, result.Matched, result.TotalValues) {
            Search = request.Search, IncludeCurrentFilter = request.IncludeCurrentFilter
        };
        foreach (var item in result.Items.Take(request.Limit)) page.Items.Add(new CanopyGridFacetValue(CanopyDataValues.ToCell(item.Value), item.Count));
        return page.ToJson(Schema.ProtocolView);
    }

    /// <summary>Answers a summary request (a <c>gridQuery</c> document with its revision) with a <c>gridSummary</c> document.</summary>
    /// <param name="json">The request body.</param>
    /// <param name="cancellationToken">Cancels the request.</param>
    /// <returns>The summary document.</returns>
    public Task<string> SummaryAsync(string json, CancellationToken cancellationToken = default) =>
        SummaryAsync(CanopyRequestParser.ParseSummary(json, Schema, Options.Limits), cancellationToken);

    /// <summary>Validates and counts an export, returning a job that streams the file.</summary>
    /// <param name="json">The export request body.</param>
    /// <param name="format">The export format identity, for example <c>csv</c>.</param>
    /// <param name="cancellationToken">Cancels the validation.</param>
    /// <returns>The export job.</returns>
    public Task<CanopyExportJob> PrepareExportAsync(string json, string format, CancellationToken cancellationToken = default) =>
        PrepareExportAsync(CanopyRequestParser.ParseExport(json, Schema, Options.Limits), format, cancellationToken);

    /// <summary>Validates and counts a parsed export, returning a job that streams the file.</summary>
    /// <param name="request">The validated export request.</param>
    /// <param name="format">The export format identity.</param>
    /// <param name="cancellationToken">Cancels the validation.</param>
    /// <returns>The export job.</returns>
    public async Task<CanopyExportJob> PrepareExportAsync(CanopyExportRequest request, string format, CancellationToken cancellationToken = default) {
        if (request == null) throw new ArgumentNullException(nameof(request));
        Own(request.Query);
        if (format == null || !_formats.TryGetValue(format, out var writer)) throw new CanopyRequestException(CanopyRequestError.UnknownFormat, "The export format is not available.");
        var revision = await RevisionAsync(request.Revision, cancellationToken).ConfigureAwait(false);
        var count = await Provider.CountAsync(request.Query, cancellationToken).ConfigureAwait(false);
        await RevisionAsync(revision, cancellationToken).ConfigureAwait(false);
        if (count > Options.Limits.MaxExportRows) throw CanopyRequestException.Limit("The export has more rows than this endpoint allows.");
        if (request.Query.Ids != null && count != request.Query.Ids.Count)
            throw new CanopyRequestException(CanopyRequestError.InvalidExport, "Some selected records are not in the dataset.");
        if (request.RecordCount != null && request.RecordCount != count)
            throw new CanopyRequestException(CanopyRequestError.StaleRevision, "The records changed since the export was captured.");
        var query = request.Query.WithWindow(0, count);
        var bound = request.WithQuery(query);
        return new CanopyExportJob(bound, writer, count, async (output, token) => {
            // A prepared job may be written later, after its captured revision has already changed.
            await RevisionAsync(revision, token).ConfigureAwait(false);
            var read = new int[1];
            await writer.WriteAsync(new CanopyExportContext(bound, Counted(Provider.ReadAsync(query, token), read, token), count), output, token).ConfigureAwait(false);
            // Changes can retain the same count. Fail an already streaming file rather than report it as complete.
            await RevisionAsync(revision, token).ConfigureAwait(false);
            if (read[0] != count) throw new CanopyRequestException(CanopyRequestError.StaleRevision, "The records changed while the export was written.");
        });
    }

    private static async IAsyncEnumerable<CanopyGridRow> Counted(IAsyncEnumerable<CanopyGridRow> rows, int[] read, [EnumeratorCancellation] CancellationToken cancellationToken) {
        await foreach (var row in rows.WithCancellation(cancellationToken).ConfigureAwait(false)) {
            cancellationToken.ThrowIfCancellationRequested();
            read[0]++;
            yield return row;
        }
    }

    private void Own(CanopyDataRequest request) {
        if (!ReferenceEquals(request.Schema, Schema)) throw new ArgumentException("The request belongs to another schema.", nameof(request));
    }

    private async Task<string> RevisionAsync(string? expected, CancellationToken cancellationToken) {
        cancellationToken.ThrowIfCancellationRequested();
        var revision = await Provider.GetRevisionAsync(cancellationToken).ConfigureAwait(false);
        cancellationToken.ThrowIfCancellationRequested();
        if (string.IsNullOrEmpty(revision)) throw new InvalidOperationException("The data provider returned an empty revision.");
        if (expected != null && expected != revision) throw new CanopyRequestException(CanopyRequestError.StaleRevision, "The data changed; reload the grid.");
        return revision;
    }

    private static bool ValidFormatId(string? id) {
        if (string.IsNullOrEmpty(id) || id!.Length > 32 || id[0] < 'a' || id[0] > 'z') return false;
        foreach (var unit in id) if (!(unit >= 'a' && unit <= 'z' || unit >= '0' && unit <= '9' || unit == '-')) return false;
        return true;
    }
}
