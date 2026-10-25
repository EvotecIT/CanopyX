# Snapshot time slider

A matrix or propagation view can carry a sequence of complete snapshots supplied
by its host. The reader can select a frame, step backward or forward, and start
or pause timed playback. CanopyX replays the supplied evidence; the host captures
the snapshots and decides what each state means. Replay makes no network requests.

## C# model

Set `TimeSlider` on a `CanopyMatrix` or `CanopyPropagation`. Its generic argument
is the containing view's type. For example, a host can attach two captured
matrices with the same `id`:

```csharp
using System;
using CanopyX;
using CanopyX.Html;

CanopyMatrix Capture(string state) {
    var view = new CanopyMatrix("services", "Service health");
    view.State("waiting", "Waiting", CanopyTone.Warning, CanopyMatrixSymbol.Clock, attention: true)
        .State("ready", "Ready", CanopyTone.Success, CanopyMatrixSymbol.Check);
    view.Rows.Item("search", "Search");
    view.Columns.Item("east", "East");
    view.Set("search", "east", state);
    return view;
}

var at = new DateTimeOffset(2026, 10, 25, 10, 0, 0, TimeSpan.Zero);
var matrix = Capture("ready");
matrix.TimeSlider = new CanopyTimeSlider<CanopyMatrix> {
    IntervalMilliseconds = 1500,
    InitialIndex = 0
};
matrix.TimeSlider.Snapshots.Add(new CanopyTimeSnapshot<CanopyMatrix>(at, Capture("waiting"), "Waiting for update"));
matrix.TimeSlider.Snapshots.Add(new CanopyTimeSnapshot<CanopyMatrix>(at.AddMinutes(1), Capture("ready"), "Update received"));
matrix.SaveHtmlPage("service-history.html");
```

Use `CanopyTimeSlider<CanopyPropagation>` and
`CanopyTimeSnapshot<CanopyPropagation>` the same way for a propagation view.
Each snapshot preserves its full view, including the host's labels and evidence.
`At` and `View` are read-only properties; `Label` is optional and mutable. The
view is held by reference, so a host should capture a separate view for each
historical frame rather than changing one object repeatedly.

The containing view's `Validate()`, `ToJson()` and `FromJson()` enforce these rules:

- There are 1 to 500 snapshots, in strictly ascending order of distinct instants
  at millisecond precision, matching the browser's `Date.parse`. Different ticks
  in the same millisecond are rejected. Offsets do not make two representations
  of the same instant distinct.
- `IntervalMilliseconds` is 100 to 60,000; its default is 1,000.
- `InitialIndex` is zero-based and must name an existing frame. Null selects the
  latest snapshot, regardless of the containing view's current data.
- Each frame is a complete valid view of the same type and with the same id as
  its parent. Axis items, witnesses and states may change between frames.
- No frame contains a `TimeSlider`, including a reference back to its parent.
  The entire collection is checked for nesting before any frame is validated.
- A supplied frame label is visible text of at most 200 characters.

The parent remains a valid ordinary view as well. Leaving `TimeSlider` null keeps
its usual rendering behavior. Snapshots add no runtime package dependency.

## Wire format

`timeSlider` is optional in a `canopyx/2` matrix or propagation document:

```json
{
  "timeSlider": {
    "interval": 1500,
    "initial": 0,
    "snapshots": [
      {
        "at": "2026-10-25T10:00:00Z",
        "label": "Waiting for update",
        "view": {
          "protocol": "canopyx/2",
          "type": "matrix",
          "id": "services",
          "label": "Service health",
          "rows": { "items": [{ "id": "search", "label": "Search" }] },
          "columns": { "items": [{ "id": "east", "label": "East" }] },
          "states": [{ "id": "waiting", "label": "Waiting", "symbol": "clock", "attention": true }],
          "cells": ["0"]
        }
      }
    ]
  }
}
```

This is the `timeSlider` member to attach to a complete parent document, not a
standalone view document. Omitting `interval` means 1,000 milliseconds; omitting
`initial` means the last snapshot. Each `view` carries its full protocol envelope
and has no `timeSlider` member, even a null one. Timestamps contain a date and
time with seconds and an explicit `Z` or numeric offset; fractional seconds are
optional. C# writes them in UTC and preserves their tick precision. Unknown
properties and malformed or incomplete frame views are rejected by the readers.
The existing reader limits still apply to the whole parent document: 4 MiB of
JSON and at most 64 levels of nesting.

The TypeScript declarations in `time-slider.d.ts` provide `TimeSlider<T>`,
`TimeSnapshot<T>`, `TimePlaybackApi` and `TimePlaybackState` and extend
`MatrixDocument` and `PropagationDocument` with the optional member. Hosts use
the grid entry point's declarations:

```typescript
import type { TimeSlider, MatrixDocument } from "@evotecit/canopyx/grid";

declare const capturedMatrix: Omit<MatrixDocument, "timeSlider">;
const snapshots: TimeSlider<MatrixDocument> = {
  snapshots: [{ at: "2026-10-25T10:00:00Z", view: capturedMatrix }]
};
```

Here `capturedMatrix` is a complete matrix document without a slider.

## Playback and reduced motion

Playback starts paused. There is no root `autoPlay` setting. Play and pause
control timed replay; previous, next and position selection are manual actions.
When `prefers-reduced-motion: reduce` is active, timed play is unavailable and
manual selection remains available. The interval does not override that preference.

After `api.ready` resolves, `api.playback` exposes synchronous `play()`, `pause()`,
`step(delta = 1)`, `seek(index)` and `getState()` methods. `getState()` returns
`{ index, count, at, playing, reducedMotion }`. The ready promise includes
application of the initial snapshot. Updating an ordinary view without history
remains synchronous; replacing a view with history returns a `Promise<void>`.
Printing pauses replay, and destroying a view releases its timer and media listener.

## Static output and examples

`CanopyStaticHtml.RenderMatrix` and `RenderPropagation` validate the whole view
before selecting its initial frame. They render that frame's data and labels
using the existing script-free table and inline styles. A frame without its own
labels inherits the parent's labels. The caption includes the optional frame
label and a UTC timestamp in a `time` element. A custom caption is preserved;
setting the caption to an empty string still leaves the frame's timestamp visible.
The selected view's label is the default caption.

`CanopyStaticHtmlOptions.MaxRows` still limits the selected frame. Matrices above
`MaxStaticMatrixCells` still use the attention-cell list. Static output contains
one frame and no playback controls or scripts.

`TimeSliderExample.Write(output)` writes three generic service snapshots as
`time-matrix.html`, `time-matrix-dark.html`, `time-matrix-static.html`,
`time-propagation.html`, `time-propagation-dark.html`, and
`time-propagation-static.html`. These examples explicitly start at frame zero;
ordinary sliders with no initial index start at the latest frame.
