namespace CanopyX;

/// <summary>The check every row of a list field passes (<see cref="CanopyFlowField.ItemRule"/>).</summary>
public enum CanopyFlowItemRule {
    /// <summary>No built-in check. The default.</summary>
    None,

    /// <summary>An email address.</summary>
    Email,

    /// <summary>A host name.</summary>
    Host,

    /// <summary>An IPv4 or IPv6 address.</summary>
    IpAddress,

    /// <summary>An IPv4 or IPv6 network in CIDR notation.</summary>
    Cidr,

    /// <summary>An absolute <c>http</c> or <c>https</c> address.</summary>
    Url
}