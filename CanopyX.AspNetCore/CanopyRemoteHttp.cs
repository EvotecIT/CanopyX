using System;
using System.IO;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using CanopyX.Data;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Net.Http.Headers;

namespace CanopyX.AspNetCore;

/// <summary>HTTP plumbing shared by the remote grid endpoints: bounded JSON bodies, typed errors and streamed files.</summary>
internal static class CanopyRemoteHttp {
    private static readonly UTF8Encoding Utf8 = new UTF8Encoding(false, true);

    internal static Task RunJsonAsync(HttpContext context, CanopyRemoteLimits limits, Func<HttpContext, CanopyRemoteHandler> handler,
        Func<CanopyRemoteHandler, string, CancellationToken, Task<string>> answer) =>
        RunAsync(context, async token => {
            var body = await ReadJsonBodyAsync(context, limits, token).ConfigureAwait(false);
            if (body == null) return;
            await WriteJsonAsync(context, await answer(handler(context), body, token).ConfigureAwait(false), token).ConfigureAwait(false);
        });

    internal static async Task RunAsync(HttpContext context, Func<CancellationToken, Task> run) {
        var token = context.RequestAborted;
        try {
            await run(token).ConfigureAwait(false);
        } catch (CanopyRequestException error) {
            await WriteErrorAsync(context, error.StatusCode, error.Code, error.Message).ConfigureAwait(false);
        } catch (OperationCanceledException) when (token.IsCancellationRequested) {
            // The client went away; there is nobody to answer.
        } catch (Exception error) {
            var logger = context.RequestServices?.GetService<ILoggerFactory>()?.CreateLogger("CanopyX.AspNetCore");
            logger?.LogError(error, "A CanopyX remote grid request failed.");
            await WriteErrorAsync(context, StatusCodes.Status500InternalServerError, "serverError", "The request could not be completed.").ConfigureAwait(false);
        }
    }

    /// <summary>Reads a JSON body within the size limit; writes the error and returns null when the body is rejected.</summary>
    internal static async Task<string?> ReadJsonBodyAsync(HttpContext context, CanopyRemoteLimits limits, CancellationToken token) {
        var request = context.Request;
        if (!MediaTypeHeaderValue.TryParse(request.ContentType, out var type) ||
            !(type.MediaType.Equals("application/json", StringComparison.OrdinalIgnoreCase) || type.MediaType.Value?.EndsWith("+json", StringComparison.OrdinalIgnoreCase) == true)) {
            await WriteErrorAsync(context, StatusCodes.Status415UnsupportedMediaType, "invalidDocument", "Send the request as application/json.").ConfigureAwait(false);
            return null;
        }
        if (request.ContentLength > limits.MaxRequestBytes) {
            await WriteErrorAsync(context, StatusCodes.Status413PayloadTooLarge, "limitExceeded", "The request is too large.").ConfigureAwait(false);
            return null;
        }
        var buffer = new MemoryStream();
        var chunk = new byte[16384];
        int read;
        while ((read = await request.Body.ReadAsync(chunk, 0, chunk.Length, token).ConfigureAwait(false)) > 0) {
            if (buffer.Length + read > limits.MaxRequestBytes) {
                await WriteErrorAsync(context, StatusCodes.Status413PayloadTooLarge, "limitExceeded", "The request is too large.").ConfigureAwait(false);
                return null;
            }
            buffer.Write(chunk, 0, read);
        }
        try {
            return Utf8.GetString(buffer.GetBuffer(), 0, (int)buffer.Length);
        } catch (DecoderFallbackException) {
            throw new CanopyRequestException(CanopyRequestError.InvalidJson, "The request is not valid UTF-8.");
        }
    }

    internal static async Task WriteJsonAsync(HttpContext context, string json, CancellationToken token) {
        var response = context.Response;
        response.StatusCode = StatusCodes.Status200OK;
        response.ContentType = "application/json; charset=utf-8";
        response.Headers.CacheControl = "no-store";
        response.Headers["X-Content-Type-Options"] = "nosniff";
        var bytes = Utf8.GetBytes(json);
        response.ContentLength = bytes.Length;
        await response.Body.WriteAsync(bytes, 0, bytes.Length, token).ConfigureAwait(false);
    }

    internal static async Task WriteExportAsync(HttpContext context, CanopyExportJob job, CancellationToken token) {
        var response = context.Response;
        response.StatusCode = StatusCodes.Status200OK;
        response.ContentType = job.ContentType;
        response.Headers.CacheControl = "no-store";
        response.Headers["X-Content-Type-Options"] = "nosniff";
        var disposition = new ContentDispositionHeaderValue("attachment");
        disposition.SetHttpFileName(job.FileName);
        response.Headers.ContentDisposition = disposition.ToString();
        response.Headers["X-CanopyX-Record-Count"] = job.RecordCount.ToString(System.Globalization.CultureInfo.InvariantCulture);
        await job.WriteAsync(response.Body, token).ConfigureAwait(false);
    }

    internal static async Task WriteErrorAsync(HttpContext context, int status, string code, string message) {
        var response = context.Response;
        if (response.HasStarted) {
            // The file was already streaming; aborting tells the client it is incomplete.
            context.Abort();
            return;
        }
        response.Clear();
        response.StatusCode = status;
        response.ContentType = "application/json; charset=utf-8";
        response.Headers.CacheControl = "no-store";
        using var stream = new MemoryStream();
        using (var writer = new Utf8JsonWriter(stream)) {
            writer.WriteStartObject();
            writer.WriteString("error", code);
            writer.WriteString("message", message);
            writer.WriteEndObject();
        }
        await response.Body.WriteAsync(stream.GetBuffer(), 0, (int)stream.Length, CancellationToken.None).ConfigureAwait(false);
    }
}
