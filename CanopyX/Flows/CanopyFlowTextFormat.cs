namespace CanopyX;

/// <summary>The shape a text field's answer must have (<see cref="CanopyFlowField.TextFormat"/>). The browser and the server check it alike.</summary>
public enum CanopyFlowTextFormat {
    /// <summary>Any text.</summary>
    None,
    /// <summary>An email address, such as name@example.com.</summary>
    Email,
    /// <summary>A host name, such as mail.example.com.</summary>
    Host,
    /// <summary>An IPv4 or IPv6 address.</summary>
    IpAddress,
    /// <summary>An IPv4 address, such as 192.168.1.10.</summary>
    IPv4,
    /// <summary>An IPv6 address, such as 2001:db8::1.</summary>
    IPv6,
    /// <summary>A network range in CIDR notation, such as 10.0.0.0/24.</summary>
    Cidr,
    /// <summary>An http or https address.</summary>
    Url,
    /// <summary>A MAC address: six pairs of hex digits separated by colons or hyphens, or three groups of four separated by dots.</summary>
    Mac,
    /// <summary>A GUID, with or without braces.</summary>
    Guid,
    /// <summary>A phone number: digits, spaces, dashes, dots and parentheses with an optional leading +, 6 to 15 digits.</summary>
    Phone,
    /// <summary>A date written yyyy-MM-dd.</summary>
    Date,
    /// <summary>A time written HH:mm or HH:mm:ss.</summary>
    Time,
    /// <summary>A date and time written yyyy-MM-dd HH:mm (or with T between them), seconds optional.</summary>
    DateTime
}
