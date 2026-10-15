using Xunit;

namespace CanopyX.Data.Tests;

public sealed class RecordParserTests {
    private static readonly CanopyRecordSchema Schema = Assets.Records(Assets.Columns(Assets.View())).Schema;

    [Fact]
    public void ParseRecord_WholeRecord_ServesEveryMappedFieldAndDrawerValue() {
        var request = CanopyRequestParser.ParseRecord(Assets.Query("12", ",\"revision\":\"r1\",\"row\":true"), Schema);
        Assert.Equal("12", request.Id);
        Assert.Equal("r1", request.Revision);
        Assert.True(request.Row);
        Assert.False(request.IsPage);
        Assert.Equal(new[] { "serial", "purchased", "weight", "notes", "secret", "replaces", "parts", "peers", "events", "changes" }, request.Fields.Select(field => field.Id));
        Assert.Equal(new[] { "site" }, request.Cells);
        Assert.Equal(10, request.FirstRows(request.Fields.Single(field => field.Id == "parts")));
    }

    [Fact]
    public void ParseRecord_CollectionPage_DefaultsToTheFieldsPageSizeWithinTheLimit() {
        var limits = new CanopyRemoteLimits { MaxRecordPageSize = 8 };
        var request = CanopyRequestParser.ParseRecord(Assets.Query("12", ",\"field\":\"parts\",\"offset\":10"), Schema, limits);
        Assert.True(request.IsPage);
        Assert.Equal("parts", request.Field!.Id);
        Assert.Equal(10, request.Offset);
        Assert.Equal(8, request.Limit);
        Assert.Empty(request.Fields);
        Assert.Empty(request.Cells);
        Assert.Equal(10, CanopyRequestParser.ParseRecord(Assets.Query("12", ",\"field\":\"parts\""), Schema).Limit);
    }

    [Fact]
    public void ParseRecord_ReadCheck_LeavesOutHiddenFieldsAndCells() {
        var request = CanopyRequestParser.ParseRecord(Assets.Query("12"), Schema, null, id => id != "secret" && id != "site" && id != "parts");
        Assert.DoesNotContain(request.Fields, field => field.Id == "secret" || field.Id == "parts");
        Assert.Empty(request.Cells);
    }

    [Fact]
    public void ParseRecord_HiddenAndUnknownFields_AnswerAlike() {
        var hidden = Assert.Throws<CanopyRequestException>(() => CanopyRequestParser.ParseRecord(Assets.Query("12", ",\"field\":\"parts\""), Schema, null, id => id != "parts"));
        var unknown = Assert.Throws<CanopyRequestException>(() => CanopyRequestParser.ParseRecord(Assets.Query("12", ",\"field\":\"nothing\""), Schema));
        var unmapped = Assert.Throws<CanopyRequestException>(() => CanopyRequestParser.ParseRecord(Assets.Query("12", ",\"field\":\"unmapped\""), Schema));
        foreach (var error in new[] { hidden, unknown, unmapped }) {
            Assert.Equal(CanopyRequestError.UnknownField, error.Error);
            Assert.Equal(hidden.Message, error.Message);
        }
        // A hidden value field answers as unknown too, before its kind is looked at.
        Assert.Equal(CanopyRequestError.UnknownField, Assert.Throws<CanopyRequestException>(() =>
            CanopyRequestParser.ParseRecord(Assets.Query("12", ",\"field\":\"serial\""), Schema, null, id => id != "serial")).Error);
    }

    [Theory]
    [InlineData("{oops", CanopyRequestError.InvalidJson)]
    [InlineData("[]", CanopyRequestError.InvalidDocument)]
    [InlineData("{\"id\":\"1\"}", CanopyRequestError.InvalidDocument)]
    [InlineData("{\"view\":\"assets\"}", CanopyRequestError.InvalidDocument)]
    [InlineData("{\"view\":\"other\",\"id\":\"1\"}", CanopyRequestError.InvalidDocument)]
    [InlineData("{\"view\":\"assets\",\"id\":\"\"}", CanopyRequestError.InvalidDocument)]
    [InlineData("{\"view\":\"assets\",\"id\":7}", CanopyRequestError.InvalidJson)]
    [InlineData("{\"view\":\"assets\",\"id\":\"\\ud800\"}", CanopyRequestError.InvalidJson)]
    [InlineData("{\"protocol\":\"canopyx/1\",\"view\":\"assets\",\"id\":\"1\"}", CanopyRequestError.InvalidDocument)]
    [InlineData("{\"type\":\"gridQuery\",\"view\":\"assets\",\"id\":\"1\"}", CanopyRequestError.InvalidDocument)]
    [InlineData("{\"view\":\"assets\",\"id\":\"1\",\"revision\":\"\"}", CanopyRequestError.InvalidDocument)]
    [InlineData("{\"view\":\"assets\",\"id\":\"1\",\"row\":\"yes\"}", CanopyRequestError.InvalidJson)]
    [InlineData("{\"view\":\"assets\",\"id\":\"1\",\"offset\":0}", CanopyRequestError.InvalidDocument)]
    [InlineData("{\"view\":\"assets\",\"id\":\"1\",\"limit\":5}", CanopyRequestError.InvalidDocument)]
    [InlineData("{\"view\":\"assets\",\"id\":\"1\",\"field\":\"serial\"}", CanopyRequestError.NotCollection)]
    [InlineData("{\"view\":\"assets\",\"id\":\"1\",\"field\":\"events\"}", CanopyRequestError.NotCollection)]
    [InlineData("{\"view\":\"assets\",\"id\":\"1\",\"field\":\"name\"}", CanopyRequestError.UnknownField)]
    [InlineData("{\"view\":\"assets\",\"id\":\"1\",\"field\":\"parts\",\"row\":true}", CanopyRequestError.InvalidDocument)]
    [InlineData("{\"view\":\"assets\",\"id\":\"1\",\"field\":\"parts\",\"offset\":-1}", CanopyRequestError.InvalidDocument)]
    [InlineData("{\"view\":\"assets\",\"id\":\"1\",\"field\":\"parts\",\"offset\":1.5}", CanopyRequestError.InvalidJson)]
    [InlineData("{\"view\":\"assets\",\"id\":\"1\",\"field\":\"parts\",\"limit\":0}", CanopyRequestError.InvalidDocument)]
    [InlineData("{\"view\":\"assets\",\"id\":\"1\",\"field\":\"parts\",\"limit\":10001}", CanopyRequestError.InvalidDocument)]
    [InlineData("{\"view\":\"assets\",\"id\":\"1\",\"field\":\"parts\",\"limit\":201}", CanopyRequestError.LimitExceeded)]
    [InlineData("{\"view\":\"assets\",\"id\":\"1\",\"field\":7}", CanopyRequestError.InvalidJson)]
    [InlineData("{\"view\":\"assets\",\"id\":\"1\",\"field\":\"parts\",\"offset\":10001}", CanopyRequestError.LimitExceeded)]
    public void ParseRecord_InvalidShapes_AreRejectedWithTypedErrors(string json, CanopyRequestError error) {
        var exception = Assert.Throws<CanopyRequestException>(() => CanopyRequestParser.ParseRecord(json, Schema));
        Assert.Equal(error, exception.Error);
        // Messages never echo request text.
        Assert.DoesNotContain("assets", exception.Message);
        Assert.DoesNotContain("canopyx/1", exception.Message);
    }

    [Fact]
    public void ParseRecord_BoundedIdentityAndBody() {
        Assert.Equal(4096, CanopyRequestParser.ParseRecord(Assets.Query(new string('7', 4096)), Schema).Id.Length);
        Assert.Equal(CanopyRequestError.InvalidDocument, Assert.Throws<CanopyRequestException>(() => CanopyRequestParser.ParseRecord(Assets.Query(new string('7', 4097)), Schema)).Error);
        var limits = new CanopyRemoteLimits { MaxRequestBytes = 1024 };
        Assert.Equal(CanopyRequestError.LimitExceeded, Assert.Throws<CanopyRequestException>(() => CanopyRequestParser.ParseRecord(Assets.Query(new string('7', 2000)), Schema, limits)).Error);
        // A record request has its own, smaller bound (16 KiB by default), counted in UTF-8 bytes.
        var padded = Assets.Query("1", ",\"padding\":\"" + new string('x', 17000) + "\"");
        Assert.Equal(CanopyRequestError.LimitExceeded, Assert.Throws<CanopyRequestException>(() => CanopyRequestParser.ParseRecord(padded, Schema)).Error);
        var wide = Assets.Query("1", ",\"padding\":\"" + new string('é', 9000) + "\"");
        Assert.Equal(CanopyRequestError.LimitExceeded, Assert.Throws<CanopyRequestException>(() => CanopyRequestParser.ParseRecord(wide, Schema)).Error);
        Assert.Equal("1", CanopyRequestParser.ParseRecord(padded, Schema, new CanopyRemoteLimits { MaxRecordRequestBytes = 32768 }).Id);
    }

    [Fact]
    public void ParseRecord_HostileIdentities_StayText() {
        foreach (var id in new[] { "1 OR 1=1", "1; DROP TABLE Assets; --", "x' || '", "../../etc/passwd", "<script>alert(1)</script>", "\u0000", "1\n2" }) {
            var request = CanopyRequestParser.ParseRecord(Assets.Query(id), Schema);
            Assert.Equal(id, request.Id);
        }
    }

    [Fact]
    public void FromRecordQuery_ValidatesTypedRequests() {
        var query = new CanopyGridRecordQuery("assets", "5") { Field = "parts", Offset = 3, Limit = 4, Revision = "r1" };
        var request = CanopyRequestParser.FromRecordQuery(query, Schema);
        Assert.Equal((3, 4, "r1"), (request.Offset, request.Limit, request.Revision));
        Assert.Equal(CanopyRequestError.InvalidDocument, Assert.Throws<CanopyRequestException>(() =>
            CanopyRequestParser.FromRecordQuery(new CanopyGridRecordQuery("other", "5"), Schema)).Error);
    }

    [Fact]
    public void Limits_RejectValuesOutsideTheirRange() {
        Assert.Throws<ArgumentOutOfRangeException>(() => new CanopyRemoteLimits { MaxRecordPageSize = 0 });
        Assert.Throws<ArgumentOutOfRangeException>(() => new CanopyRemoteLimits { MaxRecordPageSize = 10001 });
        Assert.Throws<ArgumentOutOfRangeException>(() => new CanopyRemoteLimits { MaxRecordItems = 0 });
        Assert.Throws<ArgumentOutOfRangeException>(() => new CanopyRemoteLimits { MaxRecordBytes = 1023 });
        Assert.Throws<ArgumentOutOfRangeException>(() => new CanopyRemoteLimits { MaxRecordBytes = 67108865 });
        Assert.Throws<ArgumentOutOfRangeException>(() => new CanopyRemoteLimits { MaxRecordTextLength = 15 });
        Assert.Throws<ArgumentOutOfRangeException>(() => new CanopyRemoteLimits { MaxRecordOffset = -1 });
        Assert.Throws<ArgumentOutOfRangeException>(() => new CanopyRemoteLimits { MaxRecordRequestBytes = 1023 });
        var defaults = new CanopyRemoteLimits();
        Assert.Equal((200, 200, 1048576), (defaults.MaxRecordPageSize, defaults.MaxRecordItems, defaults.MaxRecordBytes));
        Assert.Equal((65536, 10000, 16384), (defaults.MaxRecordTextLength, defaults.MaxRecordOffset, defaults.MaxRecordRequestBytes));
    }
}
