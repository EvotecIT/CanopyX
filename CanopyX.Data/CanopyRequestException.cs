using System;

namespace CanopyX.Data;

/// <summary>A rejected remote grid request. The message is safe to return to the client; it never contains server internals.</summary>
/// <remarks>
/// Hosts map this exception to an HTTP client error (<see cref="StatusCode"/>) with the body
/// <c>{ "error": Code, "message": Message }</c>. Any other exception is a server failure and must not be echoed.
/// </remarks>
public sealed class CanopyRequestException : Exception {
    /// <summary>Creates a rejection.</summary>
    /// <param name="error">The rejection reason.</param>
    /// <param name="message">A client-safe description.</param>
    public CanopyRequestException(CanopyRequestError error, string message) : base(message) {
        Error = error;
    }

    /// <summary>Gets the rejection reason.</summary>
    public CanopyRequestError Error { get; }

    /// <summary>Gets the stable camel-case wire code, for example <c>limitExceeded</c>.</summary>
    public string Code {
        get {
            var name = Error.ToString();
            return char.ToLowerInvariant(name[0]) + name.Substring(1);
        }
    }

    /// <summary>Gets the HTTP status code: 409 for a stale revision or changed export count, 400 otherwise.</summary>
    public int StatusCode => Error == CanopyRequestError.StaleRevision ? 409 : 400;

    internal static CanopyRequestException Limit(string message) => new CanopyRequestException(CanopyRequestError.LimitExceeded, message);

    internal static CanopyRequestException Document(string message) => new CanopyRequestException(CanopyRequestError.InvalidDocument, message);

    internal static CanopyRequestException Operand(string message) => new CanopyRequestException(CanopyRequestError.InvalidOperand, message);
}
