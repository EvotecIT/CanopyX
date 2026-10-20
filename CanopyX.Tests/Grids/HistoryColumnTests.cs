using System;
using System.Collections.Generic;
using System.Linq;
using Xunit;

namespace CanopyX.Tests.Grids;

/// <summary>History cells and columns: status strips and sparklines written from a member that holds periods.</summary>
public sealed class HistoryColumnTests {
    private sealed class LazyTarget {
        public IEnumerable<CanopyCellPeriod>? Periods { get; set; }
    }

    [Theory]
    [InlineData("status")]
    [InlineData("value")]
    [InlineData("typed status")]
    [InlineData("typed value")]
    public void Histories_StopOversizedIteratorsBeforeCallingHostSummaries(string path) {
        var read = 0;
        IEnumerable<CanopyCellPeriod> Periods() {
            while (true) {
                if (++read > 4097) throw new InvalidOperationException("Read beyond the declared history bound.");
                yield return new CanopyCellPeriod("p" + read, read, "Up");
            }
        }

        var summaryCalled = false;
        if (path == "status") Assert.Throws<ArgumentException>(() => CanopyCell.StatusHistory(Periods()));
        else if (path == "value") Assert.Throws<ArgumentException>(() => CanopyCell.ValueHistory(Periods()));
        else {
            var grid = new CanopyDataGridView<LazyTarget>("lazy", "Lazy history", _ => "row");
            if (path == "typed status") grid.StatusStrip(x => x.Periods, state: periods => { summaryCalled = true; return "summary"; });
            else grid.Sparkline(x => x.Periods, value: periods => { summaryCalled = true; return 1; });
            Assert.Throws<ArgumentException>(() => grid.Row(new LazyTarget { Periods = Periods() }));
        }
        Assert.Equal(4097, read);
        Assert.False(summaryCalled);
    }

    public sealed class Target {
        public string Name { get; set; } = "";
        public List<CanopyCellPeriod>? Hours { get; set; }
        public CanopyCellPeriod[]? Latency { get; set; }
    }

    private static List<CanopyCellPeriod> Hours(params string[] states) =>
        states.Select((state, index) => new CanopyCellPeriod("h" + index, state: state, tone: state == "Down" ? CanopyTone.Danger : CanopyTone.Success)).ToList();

    [Fact]
    public void StatusHistory_TakesTheLatestStateAsItsRawValue() {
        var cell = CanopyCell.StatusHistory(Hours("Up", "Down", "Up"));
        Assert.Equal("Up", cell.Value);
        Assert.Equal(3, cell.Series.Count);
        Assert.Equal("3 of 24 down", CanopyCell.StatusHistory(Hours("Up"), "3 of 24 down").Value);
        Assert.Null(CanopyCell.StatusHistory(Array.Empty<CanopyCellPeriod>()).Value);
    }

    [Fact]
    public void ValueHistory_TakesTheLatestSampleAsItsRawValue() {
        var periods = new[] { new CanopyCellPeriod("a", 4), new CanopyCellPeriod("b", 7.5), new CanopyCellPeriod("c") };
        Assert.Equal(7.5, CanopyCell.ValueHistory(periods).Value);
        Assert.Equal(5.0, CanopyCell.ValueHistory(periods, 5).Value);
        Assert.Null(CanopyCell.ValueHistory(new[] { new CanopyCellPeriod("a") }).Value);
        Assert.Equal(3, CanopyCell.ValueHistory(periods).Series.Count);
    }

    [Fact]
    public void Histories_RejectNullPeriodsAndMoreThan4096() {
        Assert.Throws<ArgumentNullException>(() => CanopyCell.StatusHistory(null!));
        Assert.Throws<ArgumentException>(() => CanopyCell.StatusHistory(new CanopyCellPeriod[] { null! }));
        Assert.Throws<ArgumentException>(() => CanopyCell.ValueHistory(Enumerable.Range(0, 4097).Select(index => new CanopyCellPeriod("p" + index, index))));
    }

    [Fact]
    public void TypedStatusStrip_WritesATextColumnWithThePresenterAndTheSeries() {
        var grid = new CanopyDataGridView<Target>("targets", "Targets", target => target.Name);
        grid.Column(x => x.Name);
        var column = grid.StatusStrip(x => x.Hours, "Last 3 hours");
        grid.AddRows(new[] { new Target { Name = "dc01", Hours = Hours("Up", "Down") }, new Target { Name = "dc02" } });
        Assert.Equal("hours", column.Id);
        Assert.Equal(CanopyColumnKind.Text, column.Kind);
        Assert.Equal(CanopyGridPresenterKind.StatusStrip, column.Presenter!.Kind);
        Assert.Equal("Down", grid.View.Rows[0].Cells["hours"].Value);
        Assert.False(grid.View.Rows[1].Cells.ContainsKey("hours"));
        var json = grid.ToJson();
        Assert.Contains("\"presenter\":{\"kind\":\"statusStrip\"}", json);
        Assert.Contains("\"series\":[{\"period\":\"h0\",\"state\":\"Up\",\"tone\":\"success\"},{\"period\":\"h1\",\"state\":\"Down\",\"tone\":\"danger\"}]", json);
    }

    [Fact]
    public void TypedStatusStrip_TakesAHostSummaryAsTheRawValue() {
        var grid = new CanopyDataGridView<Target>("targets", "Targets", target => target.Name);
        grid.StatusStrip(x => x.Hours, state: periods => periods.Count(period => period.State == "Down") + " of " + periods.Count + " down");
        grid.AddRows(new[] { new Target { Name = "dc01", Hours = Hours("Up", "Down", "Down") } });
        Assert.Equal("2 of 3 down", grid.View.Rows[0].Cells["hours"].Value);
    }

    [Fact]
    public void TypedSparkline_WritesANumberColumnAndChecksThePresenter() {
        var grid = new CanopyDataGridView<Target>("targets", "Targets", target => target.Name);
        var bars = grid.Sparkline(x => x.Latency, "Latency");
        var target = new Target { Name = "dc01", Latency = new[] { new CanopyCellPeriod("h0", 12), new CanopyCellPeriod("h1", 30) } };
        grid.AddRows(new[] { target });
        Assert.Equal(CanopyColumnKind.Number, bars.Kind);
        Assert.Equal(CanopyGridPresenterKind.SparklineBars, bars.Presenter!.Kind);
        Assert.Equal(30.0, grid.View.Rows[0].Cells["latency"].Value);
        Assert.Contains("\"kind\":\"sparklineBars\"", grid.ToJson());

        var line = new CanopyDataGridView<Target>("line", "Line", item => item.Name);
        Assert.Equal(CanopyGridPresenterKind.SparklineLine, line.Sparkline(x => x.Latency, presenter: CanopyGridPresenter.SparklineLine(), value: periods => periods.Average(period => period.Value ?? 0)).Presenter!.Kind);
        line.AddRows(new[] { target });
        Assert.Equal(21.0, line.View.Rows[0].Cells["latency"].Value);
        Assert.Throws<ArgumentException>(() => new CanopyDataGridView<Target>("bad", "Bad", item => item.Name).Sparkline(x => x.Latency, presenter: CanopyGridPresenter.StatusStrip()));
    }
}
