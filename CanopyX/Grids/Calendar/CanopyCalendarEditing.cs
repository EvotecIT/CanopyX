using System;
using CanopyX.Json;

namespace CanopyX;

/// <summary>
/// How a <see cref="CanopyCalendar"/>'s events are moved and resized: by pointer, touch and keyboard, changing the start, end and
/// resource cells of their records. A calendar without it is read-only.
/// </summary>
/// <remarks>Changes travel as ordinary grid edits (a <c>gridCommit</c> for a hosted grid), so the host's write policy decides
/// what is saved. A new instance allows everything and writes <c>"editable": true</c>.</remarks>
public sealed class CanopyCalendarEditing {
    private string? _allowedResources;
    private int? _snapMinutes;

    /// <summary>Gets or sets whether events can be moved to another time. Defaults to true.</summary>
    public bool Move { get; set; } = true;

    /// <summary>Gets or sets whether events can be resized, which changes their end. Defaults to true.</summary>
    public bool Resize { get; set; } = true;

    /// <summary>Gets or sets whether events can be dragged to another resource of the timeline. Defaults to true.</summary>
    public bool Resources { get; set; } = true;

    /// <summary>Gets or sets whether an event may overlap another event of the same resource. Defaults to true.</summary>
    public bool Overlap { get; set; } = true;

    /// <summary>Gets or sets whether events can only be placed within working hours and business hours. Defaults to false.</summary>
    public bool WorkingHoursOnly { get; set; }

    /// <summary>Gets or sets a text column whose comma-separated resource ids are the only resources an event may move to; null allows every resource.</summary>
    /// <exception cref="ArgumentException">The id is empty.</exception>
    public string? AllowedResources {
        get => _allowedResources;
        set { CanopyIdentifiers.Require(value, nameof(value), allowNull: true); _allowedResources = value; }
    }

    /// <summary>Gets or sets the step, in minutes, that moved and resized times snap to: 1, 5, 10, 15, 20, 30 or 60; null uses the calendar's slot size.</summary>
    /// <exception cref="ArgumentOutOfRangeException">The value is not one of the supported steps.</exception>
    public int? SnapMinutes {
        get => _snapMinutes;
        set => _snapMinutes = value.HasValue && Array.IndexOf(SnapSteps, value.Value) < 0 ? throw new ArgumentOutOfRangeException(nameof(value), value, "Events snap to 1, 5, 10, 15, 20, 30 or 60 minutes.") : value;
    }

    /// <summary>Gets or sets when changes are saved. Defaults to <see cref="CanopyCalendarCommit.Auto"/>.</summary>
    public CanopyCalendarCommit Commit { get; set; }

    private static readonly int[] SnapSteps = { 1, 5, 10, 15, 20, 30, 60 };

    internal bool IsDefault => Move && Resize && Resources && Overlap && !WorkingHoursOnly && _allowedResources == null && !_snapMinutes.HasValue && Commit == CanopyCalendarCommit.Auto;

    internal void WriteJson(CanopyJsonWriter writer) {
        if (IsDefault) { writer.Boolean(true); return; }
        writer.BeginObject();
        if (!Move) writer.Property("move", false);
        if (!Resize) writer.Property("resize", false);
        if (!Resources) writer.Property("resources", false);
        if (!Overlap) writer.Property("overlap", false);
        if (WorkingHoursOnly) writer.Property("workingHours", true);
        writer.OptionalProperty("allowedResources", _allowedResources).OptionalProperty("snapMinutes", _snapMinutes);
        if (Commit == CanopyCalendarCommit.Manual) writer.Property("commit", "manual");
        writer.EndObject();
    }
}
