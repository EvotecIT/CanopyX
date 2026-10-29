using CanopyX.Released032;
using Xunit;

namespace CanopyX.Data.Tests;

/// <summary>Executes already-compiled released call sites against the current assemblies.</summary>
public sealed class ReleasedConstructorCompatibilityTests {
    [Theory]
    [InlineData("grid-group")]
    [InlineData("request")]
    [InlineData("facet")]
    [InlineData("filter")]
    [InlineData("summary")]
    public void Released032Host_ConstructorsBindAndRetainDefaults(string contract) {
        var value = ReleasedHost.Construct(contract);
        switch (contract) {
            case "grid-group":
                var group = Assert.IsType<CanopyGridGroupLevel>(value);
                Assert.Equal("name", group.Column); Assert.True(group.Descending);
                Assert.Null(group.Aggregate); Assert.Null(group.Bucket); break;
            case "request":
                var request = Assert.IsType<CanopyDataRequest>(value);
                Assert.Equal("alpha", request.Search); Assert.Equal(2, request.Offset); Assert.Equal(7, request.Limit);
                Assert.Equal("r1", request.Revision); Assert.Equal(CanopyGridSearchMode.Substring, request.SearchMode);
                Assert.Empty(request.Levels); Assert.Empty(request.TupleFilters); break;
            case "facet":
                var facet = Assert.IsType<CanopyFacetRequest>(value);
                Assert.Equal("name", facet.Column.Id); Assert.Equal("alpha", facet.Search); Assert.Equal(3, facet.Limit);
                Assert.False(facet.IncludeCurrentFilter); Assert.Null(facet.Bucket); Assert.Equal(100, facet.Query.Limit); break;
            case "filter":
                var filter = Assert.IsType<CanopyFilterCondition>(value);
                Assert.Equal(CanopyGridFilterOperator.Equal, filter.Operator); Assert.Equal("alpha", Assert.Single(filter.Values));
                Assert.Null(filter.Bucket); break;
            case "summary":
                var summary = Assert.IsType<CanopySummaryLevel>(value);
                Assert.Equal("name", summary.Column.Id); Assert.True(summary.Descending);
                Assert.Null(summary.Aggregate); Assert.Null(summary.Bucket); break;
        }
    }
}
