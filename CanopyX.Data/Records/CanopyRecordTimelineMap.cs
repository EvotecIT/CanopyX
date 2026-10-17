using System;
using System.Collections.Generic;
using System.Linq.Expressions;

namespace CanopyX.Data;

/// <summary>Maps the child rows of a record timeline (<see cref="CanopyRecordMap{T}.Timeline"/>) to events: when, what, who,
/// what kind, and their order.</summary>
/// <typeparam name="TChild">The event row type.</typeparam>
/// <remarks>
/// Events come newest first (<see cref="OldestFirst"/> turns it around), events without a time last, then by the child key
/// ascending; a whole record carries the first <see cref="Limit"/> of them (capped by <see cref="CanopyRemoteLimits.MaxRecordItems"/>).
/// Blank summaries show an em dash; summaries and actors are clipped to 4,096 characters and kinds to 256.
/// </remarks>
public sealed class CanopyRecordTimelineMap<TChild> {
    private LambdaExpression? _key, _time, _summary, _actor, _kind;
    private Func<string?, CanopyTone>? _tone;
    private bool _oldestFirst;
    private int _limit = 50;

    internal CanopyRecordTimelineMap() { }

    /// <summary>Maps the event key: unique among the record's events and the final order key.</summary>
    /// <typeparam name="TKey">The key type: text, a GUID or an integer.</typeparam>
    /// <param name="key">The key expression.</param>
    /// <returns>This map.</returns>
    public CanopyRecordTimelineMap<TChild> Key<TKey>(Expression<Func<TChild, TKey>> key) {
        if (!RecordKeys.Supported(typeof(TKey))) throw new ArgumentException("An event key is text, a GUID or an integer.", nameof(key));
        _key = key ?? throw new ArgumentNullException(nameof(key));
        return this;
    }

    /// <summary>Maps when the event happened: a <see cref="DateTime"/> (stored as UTC), <see cref="DateTimeOffset"/> or date-only value.</summary>
    /// <typeparam name="TValue">The time type.</typeparam>
    /// <param name="time">The time expression.</param>
    /// <returns>This map.</returns>
    public CanopyRecordTimelineMap<TChild> Time<TValue>(Expression<Func<TChild, TValue>> time) {
        var shape = ValueShapes.Of(typeof(TValue), "time");
        if (!ValueShapes.Fits(shape, CanopyColumnKind.DateTime)) throw new ArgumentException("An event time is a date and time.", nameof(time));
        _time = time ?? throw new ArgumentNullException(nameof(time));
        return this;
    }

    /// <summary>Maps the plain-text summary of the event.</summary>
    /// <param name="summary">The summary expression.</param>
    /// <returns>This map.</returns>
    public CanopyRecordTimelineMap<TChild> Summary(Expression<Func<TChild, string?>> summary) {
        _summary = summary ?? throw new ArgumentNullException(nameof(summary));
        return this;
    }

    /// <summary>Maps who caused the event.</summary>
    /// <param name="actor">The actor expression.</param>
    /// <returns>This map.</returns>
    public CanopyRecordTimelineMap<TChild> Actor(Expression<Func<TChild, string?>> actor) {
        _actor = actor ?? throw new ArgumentNullException(nameof(actor));
        return this;
    }

    /// <summary>Maps the kind of the event, shown as a chip.</summary>
    /// <param name="kind">The kind expression.</param>
    /// <param name="tone">Chooses the tone of the event's marker from its kind; null uses no tone.</param>
    /// <returns>This map.</returns>
    public CanopyRecordTimelineMap<TChild> Kind(Expression<Func<TChild, string?>> kind, Func<string?, CanopyTone>? tone = null) {
        _kind = kind ?? throw new ArgumentNullException(nameof(kind));
        _tone = tone;
        return this;
    }

    /// <summary>Orders the events oldest first instead of newest first.</summary>
    /// <returns>This map.</returns>
    public CanopyRecordTimelineMap<TChild> OldestFirst() {
        _oldestFirst = true;
        return this;
    }

    /// <summary>Sets how many events a record carries, 1 to 10,000. Default 50.</summary>
    /// <param name="events">The event limit.</param>
    /// <returns>This map.</returns>
    public CanopyRecordTimelineMap<TChild> Limit(int events) {
        if (events < 1 || events > 10000) throw new ArgumentOutOfRangeException(nameof(events), events, "A timeline holds 1 to 10,000 events.");
        _limit = events;
        return this;
    }

    internal ChildSpec<TChild> Build(string field) {
        var key = _key ?? throw new InvalidOperationException("Timeline '" + field + "' needs an event key (Key).");
        var summary = _summary ?? throw new InvalidOperationException("Timeline '" + field + "' needs a summary (Summary).");
        var orders = new List<(LambdaExpression, bool)>();
        if (_time != null) orders.Add((_time, !_oldestFirst));
        var values = new List<LambdaExpression> { summary };
        int time = -1, actor = -1, kind = -1;
        if (_time != null) { time = values.Count + 1; values.Add(_time); }
        if (_actor != null) { actor = values.Count + 1; values.Add(_actor); }
        if (_kind != null) { kind = values.Count + 1; values.Add(_kind); }
        var tone = _tone;
        return new ChildSpec<TChild>(key, orders, values, false, _limit, (rows, _, _) => {
            var events = new List<CanopyRecordEvent>(rows.Count);
            foreach (var row in rows) {
                var item = new CanopyRecordEvent(DateTime.MinValue, ChildSpec<TChild>.Text(row[1], 4096, true)) {
                    Time = time > 0 ? CanopyDataValues.Normalize(row[time]) as DateTime? : null
                };
                if (actor > 0) { var text = ChildSpec<TChild>.Text(row[actor], 4096, false); if (text.Length > 0) item.Actor = text; }
                if (kind > 0) {
                    var text = ChildSpec<TChild>.Text(row[kind], 256, false);
                    if (text.Length > 0) item.Kind = text;
                    if (tone != null) item.Tone = tone(item.Kind);
                }
                events.Add(item);
            }
            return CanopyCell.Timeline(events);
        });
    }
}
