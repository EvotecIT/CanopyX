using System.Globalization;
using Xunit;

namespace CanopyX.Tests;

public sealed class BucketTests {
    [Fact]
    public void WeekBoundariesHonorTheFirstWeekdayAndExplicitNativeZone() {
        var saturday = new DateTime(2026, 1, 3, 12, 0, 0, DateTimeKind.Utc);
        var sunday = saturday.AddDays(1);
        var mondayFirst = CanopyBucket.Calendar(CanopyBucketKind.Week);
        var sundayFirst = CanopyBucket.Calendar(CanopyBucketKind.Week, firstWeekday: DayOfWeek.Sunday);
        Assert.Equal(mondayFirst.Key(saturday), mondayFirst.Key(sunday));
        Assert.Equal(sundayFirst.Key(saturday) + 1, sundayFirst.Key(sunday));
        var zone = TimeZoneInfo.CreateCustomTimeZone("native-fixture", TimeSpan.FromHours(2), "Fixture", "Fixture");
        var hour = CanopyBucket.Calendar(CanopyBucketKind.Hour, zone, "Etc/GMT-2");
        Assert.Equal(14, hour.Key(saturday));
        Assert.Equal("Etc/GMT-2", hour.TimeZone);
    }

    [Theory]
    [InlineData("2020-12-31T23:59:59Z", "2020-W53")]
    [InlineData("2021-01-01T00:00:00Z", "2020-W53")]
    [InlineData("2021-01-04T00:00:00Z", "2021-W01")]
    [InlineData("2024-12-30T00:00:00Z", "2025-W01")]
    public void IsoWeeksUseTheWeekYear(string instant, string label) {
        var bucket = CanopyBucket.Calendar(CanopyBucketKind.Week);
        Assert.Equal(label, bucket.Label(bucket.Key(DateTimeOffset.Parse(instant, CultureInfo.InvariantCulture))!.Value));
    }

    [Theory]
    [InlineData("2026-03-08T06:59:59Z", 1)]
    [InlineData("2026-03-08T07:00:00Z", 3)]
    [InlineData("2026-11-01T05:30:00Z", 1)]
    [InlineData("2026-11-01T06:30:00Z", 1)]
    public void HoursFollowTheInstantAcrossDst(string instant, double hour) {
        var bucket = CanopyBucket.Calendar(CanopyBucketKind.Hour, "America/New_York");
        Assert.Equal(hour, bucket.Key(DateTimeOffset.Parse(instant, CultureInfo.InvariantCulture)));
    }

    [Fact]
    public void DaysUseTheChosenZoneAndWeekdayStartsAtTheConfiguredDay() {
        var date = new DateTimeOffset(2026, 3, 8, 4, 30, 0, TimeSpan.Zero);
        var day = CanopyBucket.Calendar(CanopyBucketKind.Day, "America/New_York");
        Assert.Equal("2026-03-07", day.Label(day.Key(date)!.Value));
        Assert.Equal(0, CanopyBucket.Calendar(CanopyBucketKind.Weekday, firstWeekday: DayOfWeek.Sunday).Key(date));
        Assert.Equal(6, CanopyBucket.Calendar(CanopyBucketKind.Weekday).Key(date));
    }

    [Fact]
    public void NumericRangesAreHalfOpenWithNegativeAndMissingValues() {
        var width = CanopyBucket.FixedWidth(10, 5);
        Assert.Equal(-1, width.Key(-5d)); Assert.Equal(0, width.Key(5d)); Assert.Equal(1, width.Key(15d));
        var edges = CanopyBucket.ExplicitEdges(-10, 0, 100);
        Assert.Equal(0, edges.Key(-11d)); Assert.Equal(1, edges.Key(-10d)); Assert.Equal(2, edges.Key(0d)); Assert.Equal(3, edges.Key(100d));
        Assert.Equal("[0, 100)", edges.Label(2)); Assert.Null(edges.Key(null)); Assert.Null(edges.Key(double.NaN));
        Assert.Throws<ArgumentException>(() => CanopyBucket.ExplicitEdges(1, 1));
        Assert.Throws<ArgumentOutOfRangeException>(() => CanopyBucket.FixedWidth(0));
    }
}
