using System.Text.Json.Nodes;
using CanopyX.Tests.Protocol;
using Xunit;
using static CanopyX.Tests.Playback.TimeSliderFixtures;

namespace CanopyX.Tests.Playback;

public sealed class TimeSliderJsonTests {
    [Fact]
    public void MatrixRoundTrip_PreservesCompleteFramesLabelsSettingsAndInstants() {
        var view = MatrixSlider();
        view.TimeSlider!.IntervalMilliseconds = 250;
        view.TimeSlider.InitialIndex = 0;
        var frame = view.TimeSlider.Snapshots[0].View;
        frame.Labels = new CanopyLabels { MatrixRows = "Applications", MatrixNoData = "Not observed" };
        frame.Cells[0].Text = "Host text";
        frame.Cells[0].Detail("Evidence", "Supplied by host");
        view.TimeSlider.Snapshots[0] = new(At.AddTicks(1234567).ToOffset(TimeSpan.FromHours(2)), frame, "<script> & first");
        var json = view.ToJson();
        ProtocolSchema.AssertValid(json, "Matrix snapshot replay");
        var copy = CanopyMatrix.FromJson(json);
        Assert.Equal(json, copy.ToJson());
        Assert.Equal(250, copy.TimeSlider!.IntervalMilliseconds);
        Assert.Equal(0, copy.TimeSlider.InitialIndex);
        Assert.Equal(At.AddTicks(1234567), copy.TimeSlider.Snapshots[0].At);
        Assert.Equal("<script> & first", copy.TimeSlider.Snapshots[0].Label);
        Assert.Equal("Earlier matrix", copy.TimeSlider.Snapshots[0].View.Label);
        Assert.Equal("Applications", copy.TimeSlider.Snapshots[0].View.Labels!.MatrixRows);
        Assert.Equal("Host text", copy.TimeSlider.Snapshots[0].View.Cells[0].Text);
        Assert.Equal("Supplied by host", copy.TimeSlider.Snapshots[0].View.Cells[0].Details[0].Value);
        Assert.Null(copy.TimeSlider.Snapshots[0].View.TimeSlider);
        Assert.DoesNotContain("<script>", json);
    }

    [Fact]
    public void PropagationRoundTrip_PreservesFrameEvidenceAndDefaultSettings() {
        var view = PropagationSlider();
        var frame = view.TimeSlider!.Snapshots[1].View;
        frame.Labels = new CanopyLabels { ChangeReplica = "Service", ChangeConverged = "Received" };
        frame.Witnesses[0].Note = "Host evidence";
        frame.Witnesses[0].Source = true;
        frame.Summary = "One service received the update";
        var json = view.ToJson();
        ProtocolSchema.AssertValid(json, "Propagation snapshot replay");
        var copy = CanopyPropagation.FromJson(json);
        Assert.Equal(json, copy.ToJson());
        Assert.Equal(1000, copy.TimeSlider!.IntervalMilliseconds);
        Assert.Null(copy.TimeSlider.InitialIndex);
        Assert.Equal(2, copy.TimeSlider.Snapshots.Count);
        var readFrame = copy.TimeSlider.Snapshots[1].View;
        Assert.Equal(frame.AsOf, readFrame.AsOf);
        Assert.Equal(frame.Start, readFrame.Start);
        Assert.Equal("Service", readFrame.Labels!.ChangeReplica);
        Assert.Equal("Received", readFrame.Labels.ChangeConverged);
        Assert.Equal(frame.Summary, readFrame.Summary);
        Assert.Equal("Host evidence", readFrame.Witnesses[0].Note);
        Assert.True(readFrame.Witnesses[0].Source);
        Assert.Equal(CanopyPropagationState.Propagating, readFrame.Witnesses[1].State);
        var sliderNode = JsonNode.Parse(json)!["timeSlider"]!;
        Assert.Null(sliderNode["interval"]);
        Assert.Null(sliderNode["initial"]);
    }

    [Theory]
    [InlineData("unknown-slider")]
    [InlineData("unknown-snapshot")]
    [InlineData("unknown-view")]
    [InlineData("nested")]
    [InlineData("wrong-type")]
    [InlineData("wrong-id")]
    [InlineData("no-zone")]
    [InlineData("null-slider")]
    [InlineData("null-view")]
    [InlineData("fractional-interval")]
    [InlineData("same-millisecond")]
    [InlineData("empty-fraction")]
    public void FromJson_RejectsMalformedFramesForBothOwners(string scenario) {
        foreach (var matrix in new[] { true, false }) {
            var root = JsonNode.Parse(matrix ? MatrixSlider().ToJson() : PropagationSlider().ToJson())!;
            var slider = root["timeSlider"]!;
            var snapshot = slider["snapshots"]![0]!;
            var frame = snapshot["view"]!;
            switch (scenario) {
                case "unknown-slider": slider["extra"] = true; break;
                case "unknown-snapshot": snapshot["extra"] = true; break;
                case "unknown-view": frame["extra"] = true; break;
                case "nested": frame["timeSlider"] = null; break;
                case "wrong-type": frame["type"] = matrix ? "propagation" : "matrix"; break;
                case "wrong-id": frame["id"] = "another-view"; break;
                case "no-zone": snapshot["at"] = "2026-10-25T10:00:00"; break;
                case "null-slider": root["timeSlider"] = null; break;
                case "null-view": snapshot["view"] = null; break;
                case "fractional-interval": slider["interval"] = 100.5; break;
                case "same-millisecond": slider["snapshots"]![1]!["at"] = "2026-10-25T10:00:00.0000001Z"; break;
                case "empty-fraction": snapshot["at"] = "2026-10-25T10:00:00.Z"; break;
            }

            var json = root.ToJsonString();
            Assert.Throws<InvalidOperationException>(() => {
                if (matrix) CanopyMatrix.FromJson(json); else CanopyPropagation.FromJson(json);
            });
        }
    }

    [Theory]
    [InlineData("2026-10-25T12:00:00+02:00")]
    [InlineData("2026-10-25T10:00:00.0000000Z")]
    public void FromJson_AcceptsExplicitOffsetsAndUtc(string at) {
        var root = JsonNode.Parse(MatrixSlider().ToJson())!;
        root["timeSlider"]!["snapshots"]![0]!["at"] = at;
        Assert.Equal(At, CanopyMatrix.FromJson(root.ToJsonString()).TimeSlider!.Snapshots[0].At);
    }
}
