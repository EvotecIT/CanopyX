namespace CanopyX.Data.Tests;

/// <summary>The ordinary query used to close returned calendar masters, using this fixture's rule/seriesEnd columns as
/// the series and recurrence-identity roles. Reader search/resources are absent; the source-owned scope still applies.</summary>
internal static class CalendarOverrideMetadataFixture {
    internal static List<Slot> Rows() {
        Slot Row(string id, string scope, string series, int identityDay, int currentMonth, string resource) => new Slot {
            Id = id, Kind = scope, Title = "Different title", Rule = series, Host = resource,
            Starts = new DateTime(2026, currentMonth, 17, 9, 0, 0, DateTimeKind.Utc),
            SeriesEnd = new DateTime(2026, 10, identityDay, 9, 0, 0, DateTimeKind.Utc)
        };
        return new List<Slot> {
            Row("moved-window", "public", "master", 10, 11, "visible"),
            Row("moved-resource", "public", "master", 17, 10, "offscreen"),
            Row("private-override", "private", "master", 10, 11, "visible"),
            Row("unrelated-override", "public", "another-master", 10, 11, "visible"),
            Row("ancient-override", "public", "master", 1, 11, "visible"),
            Row("future-override", "public", "master", 22, 11, "visible")
        };
    }

    internal static string Query(int offset = 0, int limit = 100) =>
        "{\"protocol\":\"canopyx/2\",\"type\":\"gridQuery\",\"view\":\"schedule\",\"revision\":\"r1\",\"offset\":" + offset + ",\"limit\":" + limit +
        ",\"search\":\"\",\"sort\":[],\"filters\":[" +
        "{\"column\":\"rule\",\"operator\":\"in\",\"values\":[\"master\"]}," +
        "{\"column\":\"seriesEnd\",\"operator\":\"ge\",\"values\":[\"2026-10-09T00:00:00Z\"]}," +
        "{\"column\":\"seriesEnd\",\"operator\":\"lt\",\"values\":[\"2026-10-19T00:00:00Z\"]}]}";
}
