using System;

namespace CanopyX.Html;

public static partial class CanopyHtmlAssets {
    /// <summary>The plain file name of the optional reporting script.</summary>
    public const string ReportingScriptFileName = "canopyx-reporting.js";

    /// <summary>The plain file name of the optional reporting stylesheet.</summary>
    public const string ReportingStyleFileName = "canopyx-reporting.css";

    private static readonly Lazy<string> ReportingScriptResource = new(() => CanopyHtmlResources.Read(ReportingScriptFileName));
    private static readonly Lazy<string> ReportingStyleResource = new(() => CanopyHtmlResources.Read(ReportingStyleFileName));
    private static readonly Lazy<string> ReportingScriptHash = new(() => Hash(ReportingScriptResource.Value));
    private static readonly Lazy<string> ReportingStyleHash = new(() => Hash(ReportingStyleResource.Value));
}
