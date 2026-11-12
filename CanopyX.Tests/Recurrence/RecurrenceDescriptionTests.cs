using System.Globalization;
using Xunit;

namespace CanopyX.Tests.Recurrence;

/// <summary>
/// Every case of tests/fixtures/recurrence-descriptions.json: CanopyRecurrence.Describe writes the sentence the browser's calendar
/// shows for the same rule, start, culture and label pack, or the rule text for a rule the sentences cannot say.
/// </summary>
/// <remarks>This file compiles into CanopyX.Tests (net10.0) and CanopyX.Tests.NetFramework (net472).</remarks>
public sealed class RecurrenceDescriptionTests {
    public static IEnumerable<object[]> CaseNames() => RecurrenceFixture.Descriptions.Select(item => new object[] { (string)item["name"]! });

    [Theory]
    [MemberData(nameof(CaseNames))]
    public void Describe_MatchesTheSharedCase(string name) {
        var item = RecurrenceFixture.Descriptions.Single(entry => (string)entry["name"]! == name);
        var culture = new CultureInfo(RecurrenceFixture.Text(item, "culture")!);
        var rule = CanopyRecurrence.Parse(RecurrenceFixture.Text(item, "rule")!);
        var exceptions = string.Join(",", RecurrenceFixture.Texts(item, "exceptions"));
        var allDay = item.TryGetValue("allDay", out var value) && value is true;

        var actual = rule.Describe(RecurrenceFixture.Wall(RecurrenceFixture.Text(item, "start")!), culture, Labels(culture), allDay, exceptions);

        Assert.Equal(RecurrenceFixture.Text(item, "expected"), actual);
    }

    private static CanopyLabels Labels(CultureInfo culture) => culture.TwoLetterISOLanguageName switch {
        "pl" => CanopyLabels.Polish(),
        "de" => CanopyLabels.German(),
        "es" => CanopyLabels.Spanish(),
        "fr" => CanopyLabels.French(),
        "it" => CanopyLabels.Italian(),
        _ => new CanopyLabels()
    };
}
