using Xunit;
using static CanopyX.Tests.Playback.TimeSliderFixtures;

namespace CanopyX.Tests.Playback;

public sealed class TimeSliderValidationTests {
    [Theory]
    [InlineData(1, 100)]
    [InlineData(500, 60000)]
    public void Validate_AcceptsFrameAndIntervalBounds(int count, int interval) {
        var view = MakeMatrix();
        view.TimeSlider = new CanopyTimeSlider<CanopyMatrix> { IntervalMilliseconds = interval, InitialIndex = count - 1 };
        for (var i = 0; i < count; i++) view.TimeSlider.Snapshots.Add(new(At.AddSeconds(i), MakeMatrix()));
        view.Validate();
        Assert.Equal(count, CanopyMatrix.FromJson(view.ToJson()).TimeSlider!.Snapshots.Count);
    }

    [Theory]
    [InlineData(99)]
    [InlineData(60001)]
    public void Validate_RejectsIntervalsOutsideBounds(int interval) {
        var view = MatrixSlider();
        view.TimeSlider!.IntervalMilliseconds = interval;
        Assert.Contains("interval", Assert.Throws<InvalidOperationException>(view.Validate).Message);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(501)]
    public void Validate_RejectsFrameCountsOutsideBounds(int count) {
        var view = Propagation();
        view.TimeSlider = new CanopyTimeSlider<CanopyPropagation>();
        for (var i = 0; i < count; i++) view.TimeSlider.Snapshots.Add(new(At.AddSeconds(i), Propagation()));
        Assert.Contains("1 to 500", Assert.Throws<InvalidOperationException>(view.Validate).Message);
    }

    [Theory]
    [InlineData(-1)]
    [InlineData(2)]
    public void Validate_RejectsInitialIndexOutsideFrames(int initial) {
        var view = PropagationSlider();
        view.TimeSlider!.InitialIndex = initial;
        Assert.Contains("initial index", Assert.Throws<InvalidOperationException>(view.Validate).Message);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void Validate_RejectsReversedOrDuplicateInstantsAcrossOffsets(bool duplicate) {
        var view = MatrixSlider();
        view.TimeSlider!.Snapshots[1] = new(duplicate ? At.ToOffset(TimeSpan.FromHours(2)) : At.AddSeconds(-1), MakeMatrix());
        Assert.Contains("distinct instants", Assert.Throws<InvalidOperationException>(view.Validate).Message);
    }

    [Theory]
    [InlineData(1)]
    [InlineData(9999)]
    public void Validate_RejectsDistinctTicksWithinTheSameBrowserMillisecond(int ticks) {
        var view = MatrixSlider();
        view.TimeSlider!.Snapshots[1] = new(At.AddTicks(ticks), MakeMatrix());
        Assert.Contains("millisecond precision", Assert.Throws<InvalidOperationException>(view.Validate).Message);
    }

    [Fact]
    public void Validate_AcceptsAdjacentBrowserMillisecondsWithoutRounding() {
        var view = MatrixSlider();
        view.TimeSlider!.Snapshots[0] = new(At.AddTicks(9999), MakeMatrix());
        view.TimeSlider.Snapshots[1] = new(At.AddMilliseconds(1), MakeMatrix());
        var copy = CanopyMatrix.FromJson(view.ToJson());
        Assert.Equal(At.AddTicks(9999), copy.TimeSlider!.Snapshots[0].At);
        Assert.Equal(At.AddMilliseconds(1), copy.TimeSlider.Snapshots[1].At);
    }

    [Fact]
    public void Validate_RejectsDifferentParentIdentityForBothViews() {
        var matrix = MatrixSlider();
        matrix.TimeSlider!.Snapshots[0] = new(At, MakeMatrix(id: "other"));
        Assert.Contains("same id", Assert.Throws<InvalidOperationException>(matrix.Validate).Message);
        var propagation = PropagationSlider();
        propagation.TimeSlider!.Snapshots[0] = new(At, Propagation(id: "other"));
        Assert.Contains("same id", Assert.Throws<InvalidOperationException>(propagation.Validate).Message);
    }

    [Fact]
    public void Validate_RejectsNestingBeforeValidatingAnyFrame() {
        var view = MatrixSlider();
        // The first frame is invalid, but the later cycle must be rejected before entering any frame validator.
        view.TimeSlider!.Snapshots[0].View.States.Clear();
        view.TimeSlider.Snapshots[1] = new(At.AddMinutes(1), view);
        Assert.Contains("nested time slider", Assert.Throws<InvalidOperationException>(view.Validate).Message);
        var propagation = PropagationSlider();
        propagation.TimeSlider!.Snapshots[0].View.TimeSlider = propagation.TimeSlider;
        Assert.Contains("nested time slider", Assert.Throws<InvalidOperationException>(propagation.Validate).Message);
    }

    [Fact]
    public void Validate_ValidatesUnselectedFramesThroughTheirOwners() {
        var matrix = MatrixSlider();
        matrix.TimeSlider!.Snapshots[0].View.Cells[0].State = "missing";
        Assert.Contains("undeclared state", Assert.Throws<InvalidOperationException>(matrix.Validate).Message);
        var propagation = PropagationSlider();
        propagation.TimeSlider!.Snapshots[0].View.Witnesses.Clear();
        Assert.Contains("replicas", Assert.Throws<InvalidOperationException>(propagation.Validate).Message);
    }

    [Fact]
    public void Validate_RejectsNullFramesAndInvalidLabels() {
        var view = MatrixSlider();
        view.TimeSlider!.Snapshots[0] = null!;
        Assert.Contains("null snapshots", Assert.Throws<InvalidOperationException>(view.Validate).Message);
        view.TimeSlider.Snapshots[0] = new(At, MakeMatrix(), new string('x', 201));
        Assert.Contains("snapshot label", Assert.Throws<InvalidOperationException>(view.Validate).Message);
        view.TimeSlider.Snapshots[0].Label = "   ";
        Assert.Throws<InvalidOperationException>(view.Validate);
        Assert.Throws<ArgumentNullException>(() => new CanopyTimeSnapshot<CanopyMatrix>(At, null!));
    }
}
