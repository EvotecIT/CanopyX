using System;
using System.Globalization;
using System.Net;
using System.Net.Sockets;
using System.Text.RegularExpressions;

namespace CanopyX;

// The text formats of flow fields: wire names, the example a message shows, and the checks, as 55-flow-validate.js runs them
// (FLOW_FORMATS). The shared cases in tests/fixtures/flow-formats.json prove that both agree.
internal static class CanopyFlowTextFormats {
    internal static readonly (string Wire, CanopyFlowTextFormat Value)[] Names = {
        ("email", CanopyFlowTextFormat.Email), ("host", CanopyFlowTextFormat.Host), ("ip", CanopyFlowTextFormat.IpAddress), ("ipv4", CanopyFlowTextFormat.IPv4),
        ("ipv6", CanopyFlowTextFormat.IPv6), ("cidr", CanopyFlowTextFormat.Cidr), ("url", CanopyFlowTextFormat.Url), ("mac", CanopyFlowTextFormat.Mac),
        ("guid", CanopyFlowTextFormat.Guid), ("phone", CanopyFlowTextFormat.Phone), ("date", CanopyFlowTextFormat.Date), ("time", CanopyFlowTextFormat.Time),
        ("dateTime", CanopyFlowTextFormat.DateTime)
    };

    private static readonly Regex Email = new Regex(@"^[^\s@]+@[^\s@]+\.[^\s@.]+$", RegexOptions.CultureInvariant);
    private static readonly Regex HostName = new Regex(@"^(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)*[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.?$", RegexOptions.CultureInvariant);
    private static readonly Regex IPv4 = new Regex(@"^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$", RegexOptions.CultureInvariant);
    private static readonly Regex IPv6Shape = new Regex(@"^[0-9A-Fa-f:.]{2,45}$", RegexOptions.CultureInvariant);
    private static readonly Regex Prefix = new Regex(@"^[0-9]{1,3}$", RegexOptions.CultureInvariant);
    private static readonly Regex Mac = new Regex(@"^(?:[0-9A-Fa-f]{2}(?::[0-9A-Fa-f]{2}){5}|[0-9A-Fa-f]{2}(?:-[0-9A-Fa-f]{2}){5}|[0-9A-Fa-f]{4}\.[0-9A-Fa-f]{4}\.[0-9A-Fa-f]{4})$", RegexOptions.CultureInvariant);
    private static readonly Regex Guid = new Regex(@"^(?:\{[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}\}|[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12})$", RegexOptions.CultureInvariant);
    private static readonly Regex Phone = new Regex(@"^\+?[0-9 ().-]{6,32}$", RegexOptions.CultureInvariant);
    private static readonly Regex Time = new Regex(@"^(?:[01][0-9]|2[0-3]):[0-5][0-9](?::[0-5][0-9])?$", RegexOptions.CultureInvariant);
    private static readonly Regex DateTimeShape = new Regex(@"^([0-9]{4}-[0-9]{2}-[0-9]{2})[T ]((?:[01][0-9]|2[0-3]):[0-5][0-9](?::[0-5][0-9])?)$", RegexOptions.CultureInvariant);

    internal static string Wire(CanopyFlowTextFormat format) {
        foreach (var name in Names) if (name.Value == format) return name.Wire;
        throw new InvalidOperationException("Unknown text format '" + format + "'.");
    }

    /// <summary>The sample answer the hint and the message show.</summary>
    internal static string Example(CanopyFlowTextFormat format) => format switch {
        CanopyFlowTextFormat.Email => "name@example.com", CanopyFlowTextFormat.Host => "mail.example.com", CanopyFlowTextFormat.IpAddress => "192.168.1.10",
        CanopyFlowTextFormat.IPv4 => "192.168.1.10", CanopyFlowTextFormat.IPv6 => "2001:db8::1", CanopyFlowTextFormat.Cidr => "10.0.0.0/24",
        CanopyFlowTextFormat.Url => "https://example.com", CanopyFlowTextFormat.Mac => "00:1A:2B:3C:4D:5E", CanopyFlowTextFormat.Guid => "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
        CanopyFlowTextFormat.Phone => "+1 555 0100", CanopyFlowTextFormat.Date => "2026-11-19", CanopyFlowTextFormat.Time => "14:30",
        CanopyFlowTextFormat.DateTime => "2026-11-19 14:30", _ => string.Empty
    };

    /// <summary>Whether a text answer has the format.</summary>
    internal static bool Fits(CanopyFlowTextFormat format, string value) {
        switch (format) {
            case CanopyFlowTextFormat.Email: return Email.IsMatch(value);
            case CanopyFlowTextFormat.Host: return value.Length <= 253 && HostName.IsMatch(value);
            case CanopyFlowTextFormat.IpAddress: return IsIPv4(value) || IsIPv6(value);
            case CanopyFlowTextFormat.IPv4: return IsIPv4(value);
            case CanopyFlowTextFormat.IPv6: return IsIPv6(value);
            case CanopyFlowTextFormat.Cidr: {
                var parts = value.Split('/');
                if (parts.Length != 2 || !Prefix.IsMatch(parts[1])) return false;
                var bits = int.Parse(parts[1], CultureInfo.InvariantCulture);
                return IsIPv4(parts[0]) && bits <= 32 || IsIPv6(parts[0]) && bits <= 128;
            }
            case CanopyFlowTextFormat.Url:
                return Uri.TryCreate(value, UriKind.Absolute, out var url) && (url.Scheme == Uri.UriSchemeHttp || url.Scheme == Uri.UriSchemeHttps) && url.Host.Length > 0;
            case CanopyFlowTextFormat.Mac: return Mac.IsMatch(value);
            case CanopyFlowTextFormat.Guid: return Guid.IsMatch(value);
            case CanopyFlowTextFormat.Phone: {
                if (!Phone.IsMatch(value)) return false;
                var digits = 0;
                foreach (var c in value) if (c >= '0' && c <= '9') digits++;
                return digits >= 6 && digits <= 15;
            }
            case CanopyFlowTextFormat.Date: return IsDate(value);
            case CanopyFlowTextFormat.Time: return Time.IsMatch(value);
            case CanopyFlowTextFormat.DateTime: {
                var match = DateTimeShape.Match(value);
                return match.Success && IsDate(match.Groups[1].Value);
            }
            default: return true;
        }
    }

    private static bool IsDate(string value) =>
        value.Length == 10 && DateTime.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _);

    private static bool IsIPv4(string value) => IPv4.IsMatch(value);

    private static bool IsIPv6(string value) =>
        IPv6Shape.IsMatch(value) && value.IndexOf(':') >= 0 && IPAddress.TryParse(value, out var address) && address.AddressFamily == AddressFamily.InterNetworkV6;
}
