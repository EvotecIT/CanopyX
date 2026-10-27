using System;

namespace CanopyX;

/// <summary>A host-provided view captured at one instant, for replay without fetching or computing history.</summary>
/// <typeparam name="T">The view type, such as <see cref="CanopyMatrix"/> or <see cref="CanopyPropagation"/>.</typeparam>
public sealed class CanopyTimeSnapshot<T> where T : class {
    /// <summary>Creates a frame from a complete view. The view remains the host's mutable object; it is not copied.</summary>
    /// <param name="at">The instant the snapshot describes.</param>
    /// <param name="view">The complete frame view, with the parent's id and without its own time slider.</param>
    /// <param name="label">Optional visible text of at most 200 characters describing this frame.</param>
    /// <exception cref="ArgumentNullException"><paramref name="view"/> is null.</exception>
    public CanopyTimeSnapshot(DateTimeOffset at, T view, string? label = null) {
        At = at;
        View = view ?? throw new ArgumentNullException(nameof(view));
        Label = label;
    }

    /// <summary>Gets the instant the snapshot describes. Ordering compares instants at millisecond precision, regardless of their offsets.</summary>
    public DateTimeOffset At { get; }

    /// <summary>Gets the complete view for this frame. It must not contain another time slider.</summary>
    public T View { get; }

    /// <summary>Gets or sets optional visible text of at most 200 characters describing the frame.</summary>
    public string? Label { get; set; }
}
