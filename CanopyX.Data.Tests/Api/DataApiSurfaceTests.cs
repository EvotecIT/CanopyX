#if NET
using CanopyX.AspNetCore;
using CanopyX.Data;
using CanopyX.Tests.Api;
using Xunit;

namespace CanopyX.Data.Tests.Api;

/// <summary>The public API of CanopyX.Data and CanopyX.AspNetCore against the baselines under api/ (docs/versioning.md), as built for .NET 10.</summary>
public sealed class DataApiSurfaceTests {
    [Fact]
    public void CanopyXData_PublicApi_MatchesTheBaseline() => ApiSurface.AssertMatches(typeof(CanopyRemoteHandler).Assembly, "CanopyX.Data.txt");

    [Fact]
    public void CanopyXAspNetCore_PublicApi_MatchesTheBaseline() => ApiSurface.AssertMatches(typeof(CanopyRemoteEndpointOptions).Assembly, "CanopyX.AspNetCore.txt");
}
#endif
