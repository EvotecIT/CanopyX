using System;
using System.Text.RegularExpressions;

namespace CanopyX.Html;

/// <summary>
/// Checks Content Security Policy nonces and writes the <c>nonce</c> attribute of the elements CanopyX emits. See
/// <c>docs/security.md</c>.
/// </summary>
internal static class CanopyContentSecurity {
    // The nonce-source grammar of CSP Level 3: base64 or base64url characters with up to two trailing '='.
    private static readonly Regex NonceValue = new Regex("\\A[A-Za-z0-9+/_-]+={0,2}\\z", RegexOptions.CultureInvariant);

    /// <summary>Returns the nonce when it is a valid CSP nonce value, and throws otherwise.</summary>
    internal static string Validate(string value, string parameterName) {
        if (value == null) throw new ArgumentNullException(parameterName);
        if (!NonceValue.IsMatch(value)) {
            throw new ArgumentException("A Content Security Policy nonce is one or more base64 or base64url characters, optionally followed by up to two '='.", parameterName);
        }

        return value;
    }

    /// <summary>The <c> nonce="…"</c> attribute for a nonce, or an empty string without one.</summary>
    internal static string Attribute(string? nonce) => nonce == null ? string.Empty : " nonce=\"" + Validate(nonce, nameof(nonce)) + "\"";
}
