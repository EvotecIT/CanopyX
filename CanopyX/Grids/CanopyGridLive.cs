using System;
using CanopyX.Json;

namespace CanopyX;

/// <summary>
/// Live data for a flat grid: rows that are added, changed and removed in place, without reloading, while the reader's sort,
/// filters, search, selection, focus, scroll position, open record drawer and pending edits stay as they are.
/// </summary>
/// <remarks>
/// <para>Set it on <see cref="CanopyDataGridView.Live"/>. The browser API (<c>applyTransaction</c>, <c>addRows</c>, <c>updateRows</c>,
/// <c>removeRows</c>, <c>setRows</c>, <c>refreshRows</c>, <c>poll</c>) works on every grid; this setting chooses the behaviour and
/// makes single-file pages carry the live part. <see cref="CanopyGridTransaction"/> writes the changes a host sends.</para>
/// <para>With <see cref="StableOrder"/> (the default) a row whose sort keys change keeps its place, and an "Order changed" prompt
/// offers to re-sort, so rows never move under the reader. A hosted grid refreshes by revision: an unchanged revision changes
/// nothing.</para>
/// </remarks>
public sealed class CanopyGridLive {
    private int? _flashMilliseconds;
    private int _batchMilliseconds;
    private int _pollMilliseconds;

    /// <summary>Gets or sets whether rows keep their places when their sort keys change, until the reader re-sorts. Defaults to true;
    /// false moves a changed row to its sorted place at once. New rows always go where the sort puts them, and rows that stop
    /// matching the search or filters always leave.</summary>
    public bool StableOrder { get; set; } = true;

    /// <summary>Gets or sets whether changed cells (and new rows) flash briefly. With reduced motion they show a still outline for
    /// the same time instead. Defaults to false.</summary>
    public bool Flash { get; set; }

    /// <summary>Gets or sets how long a flash lasts, 100 to 10,000 milliseconds; null keeps 1,200. Setting it turns <see cref="Flash"/> on.</summary>
    /// <exception cref="ArgumentOutOfRangeException">The value is outside 100 to 10,000.</exception>
    public int? FlashMilliseconds {
        get => _flashMilliseconds;
        set {
            if (value < 100 || value > 10000) throw new ArgumentOutOfRangeException(nameof(value), value, "A flash lasts 100 to 10,000 milliseconds.");
            _flashMilliseconds = value;
            if (value.HasValue) Flash = true;
        }
    }

    /// <summary>Gets or sets the batched update rate: changes arriving within this many milliseconds apply together, 0 to 60,000.
    /// Defaults to 0, which applies each change as it comes. A source that updates often (a stream) should batch.</summary>
    /// <exception cref="ArgumentOutOfRangeException">The value is outside 0 to 60,000.</exception>
    public int BatchMilliseconds {
        get => _batchMilliseconds;
        set => _batchMilliseconds = value < 0 || value > 60000 ? throw new ArgumentOutOfRangeException(nameof(value), value, "Batches span 0 to 60,000 milliseconds.") : value;
    }

    /// <summary>Gets or sets how often the grid polls its source, in milliseconds: 0 (the default) does not poll; otherwise 250 to
    /// 86,400,000. A hosted grid polls with its revision-aware refresh; an inline grid polls the page's <c>live.load</c> function.</summary>
    /// <exception cref="ArgumentOutOfRangeException">The value is neither 0 nor within 250 to 86,400,000.</exception>
    public int PollMilliseconds {
        get => _pollMilliseconds;
        set => _pollMilliseconds = value != 0 && (value < 250 || value > 86400000) ? throw new ArgumentOutOfRangeException(nameof(value), value, "Polling runs every 250 to 86,400,000 milliseconds, or 0 for none.") : value;
    }

    /// <summary>Gets or sets whether added and removed rows are announced to screen readers (politely, at most every two seconds).
    /// Defaults to true.</summary>
    public bool Announce { get; set; } = true;

    /// <summary>Gets or sets whether polling pauses while the page is hidden and catches up when it shows again. Defaults to true.</summary>
    public bool PauseWhenHidden { get; set; } = true;

    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject();
        if (!StableOrder) writer.Property("stableOrder", false);
        if (Flash && _flashMilliseconds.HasValue) writer.Name("flash").BeginObject().Property("durationMs", _flashMilliseconds.Value).EndObject();
        else if (Flash) writer.Property("flash", true);
        if (_batchMilliseconds != 0) writer.Property("batchMs", _batchMilliseconds);
        if (_pollMilliseconds != 0) writer.Property("pollMs", _pollMilliseconds);
        if (!Announce) writer.Property("announce", false);
        if (!PauseWhenHidden) writer.Property("pauseWhenHidden", false);
        writer.EndObject();
    }
}
