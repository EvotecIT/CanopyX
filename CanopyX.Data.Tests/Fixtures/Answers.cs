using Xunit;

namespace CanopyX.Data.Tests;

/// <summary>Counts random queries that produced documents with rows, so an oracle test cannot pass on rejections and empty pages alone.</summary>
public sealed class Answers {
    private int _rows;

    public string Note(string answer) {
        if (!answer.StartsWith("rejected:", StringComparison.Ordinal) && !answer.Contains("\"items\":[]")) _rows++;
        return answer;
    }

    public void AssertMostlyAnswered(int total) => Assert.True(_rows >= total / 3, "Only " + _rows + " of " + total + " random queries returned rows.");
}
