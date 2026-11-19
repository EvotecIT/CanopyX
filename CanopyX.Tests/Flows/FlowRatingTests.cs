using System.Text.Json;

namespace CanopyX.Tests.Flows;

/// <summary>Rating fields: the contract they write and read, and the values that fit them.</summary>
public sealed class FlowRatingTests {
    private static CanopyFlow Survey(Action<CanopyFlowField>? configure = null) =>
        new CanopyFlow("survey", "Service survey").Step("answers", "How did it go?", step => step.Rating("quality", "Service quality", configure));

    [Fact]
    public void Rating_WritesItsTypeAndScaleAndReadsBack() {
        var json = Survey(f => f.Scale(4).Default(3).Required()).ToContract();
        using var document = JsonDocument.Parse(json);
        var field = document.RootElement.GetProperty("steps")[0].GetProperty("fields")[0];
        Assert.Equal("rating", field.GetProperty("type").GetString());
        Assert.Equal(4, field.GetProperty("scale").GetInt32());
        Assert.Equal(3, field.GetProperty("default").GetDouble());
        var read = CanopyFlow.FromContract(json).Steps[0].Fields[0];
        Assert.Equal(CanopyFlowFieldKind.Rating, read.Kind);
        Assert.Equal(4, read.RatingScale);
        Assert.Equal(json, CanopyFlow.FromContract(json).ToContract());
        Assert.DoesNotContain("scale", Survey().ToContract());
    }

    [Theory]
    [InlineData(0d)]
    [InlineData(6d)]
    [InlineData(2.5d)]
    [InlineData("4")]
    public void Rating_RefusesValuesOutsideItsStars(object value) {
        var error = Assert.Throws<InvalidOperationException>(() => Survey(f => f.Default(value)).ToContract());
        Assert.Contains("whole number of stars from 1 to 5", error.Message);
    }

    [Fact]
    public void Scale_AppliesOnlyToRatingsAndStaysInRange() {
        var text = new CanopyFlow("f", "F").Step("s", "S", step => step.Text("t", "T", f => f.RatingScale = 4));
        Assert.Contains("scale applies to rating fields", Assert.Throws<InvalidOperationException>(() => text.ToContract()).Message);
        Assert.Throws<ArgumentOutOfRangeException>(() => Survey(f => f.Scale(1)));
        Assert.Throws<ArgumentOutOfRangeException>(() => Survey(f => f.Scale(11)));
        Assert.Throws<InvalidOperationException>(() => CanopyFlow.FromContract(Survey().ToContract().Replace("\"type\":\"rating\"", "\"type\":\"rating\",\"scale\":12")));
    }
}
