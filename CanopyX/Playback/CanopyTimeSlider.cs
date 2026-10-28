using System;
using System.Collections.Generic;

namespace CanopyX;

/// <summary>Replay settings and ordered, host-provided snapshots for a view. Playback starts only at the reader's request.</summary>
/// <typeparam name="T">The view type, such as <see cref="CanopyMatrix"/> or <see cref="CanopyPropagation"/>.</typeparam>
/// <remarks>
/// The containing view validates all frames before writing or rendering. Frames are complete views with the same id as
/// their parent and no nested slider. This model performs no networking, captures no history, and computes no domain facts.
/// </remarks>
public sealed partial class CanopyTimeSlider<T> where T : class {
    /// <summary>Gets the snapshots: 1 to 500 frames in strictly ascending order of their distinct instants at millisecond precision.</summary>
    public IList<CanopyTimeSnapshot<T>> Snapshots { get; } = new List<CanopyTimeSnapshot<T>>();

    /// <summary>Gets or sets the interval of timed playback, 100 to 60,000 milliseconds. The default is 1,000.</summary>
    /// <remarks>The browser disables timed playback when reduced motion is requested; manual stepping remains available.</remarks>
    public int IntervalMilliseconds { get; set; } = 1000;

    /// <summary>Gets or sets the zero-based initial frame index. Null selects the latest snapshot.</summary>
    public int? InitialIndex { get; set; }

    /// <summary>The initial frame, used only after the containing view has validated the entire slider.</summary>
    internal CanopyTimeSnapshot<T> SelectedSnapshot => Snapshots[InitialIndex ?? Snapshots.Count - 1];

    /// <summary>Checks every frame's shape before calling any view validator, so nested sliders and object cycles cannot recurse.</summary>
    internal void Validate(string parentId, Func<T, string> id, Func<T, bool> hasSlider, Action<T> validate) {
        if (IntervalMilliseconds < 100 || IntervalMilliseconds > 60000)
            throw new InvalidOperationException("A time slider interval is 100 to 60,000 milliseconds.");
        if (Snapshots.Count < 1 || Snapshots.Count > 500)
            throw new InvalidOperationException("A time slider holds 1 to 500 snapshots.");
        if (InitialIndex.HasValue && (InitialIndex.Value < 0 || InitialIndex.Value >= Snapshots.Count))
            throw new InvalidOperationException("A time slider initial index must name one of its snapshots.");
        long? previous = null;
        foreach (var snapshot in Snapshots) {
            if (snapshot == null) throw new InvalidOperationException("A time slider has no null snapshots.");
            if (hasSlider(snapshot.View)) throw new InvalidOperationException("A time slider snapshot view must not contain a nested time slider.");
            if (!string.Equals(id(snapshot.View), parentId, StringComparison.Ordinal))
                throw new InvalidOperationException("A time slider snapshot view must have the same id as its parent.");
            var milliseconds = snapshot.At.ToUnixTimeMilliseconds();
            if (previous.HasValue && milliseconds <= previous.Value)
                throw new InvalidOperationException("Time slider snapshots must have strictly ascending, distinct instants at millisecond precision.");
            if (snapshot.Label != null && (snapshot.Label.Length > 200 || !CanopyFlowValues.HasVisibleText(snapshot.Label)))
                throw new InvalidOperationException("A snapshot label is visible text of at most 200 characters.");
            previous = milliseconds;
        }

        foreach (var snapshot in Snapshots) validate(snapshot.View);
    }
}
