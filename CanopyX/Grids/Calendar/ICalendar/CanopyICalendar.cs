using System;
using System.Collections.Generic;
using System.Text;

namespace CanopyX;

/// <summary>
/// Reads the events of iCalendar text (RFC 5545) for a <see cref="CanopyCalendar"/>: <c>VEVENT</c> components with their title,
/// times, repeat rule and exceptions. The text is untrusted: every limit below fails the whole import, and nothing it holds
/// is ever run or treated as markup.
/// </summary>
/// <remarks>
/// <para>Read: <c>VCALENDAR</c> &gt; <c>VEVENT</c> with <c>UID</c>, <c>SUMMARY</c>, <c>DESCRIPTION</c>, <c>LOCATION</c>,
/// <c>DTSTART</c>, <c>DTEND</c>, <c>DURATION</c>, <c>RRULE</c>, <c>EXDATE</c>, <c>RECURRENCE-ID</c>, <c>STATUS</c> and
/// <c>CATEGORIES</c>. Other components (<c>VTODO</c>, <c>VALARM</c>, ...) are ignored and <c>VTIMEZONE</c> is skipped: a
/// <c>TZID</c> names a system time zone (an IANA name, or a Windows name on Windows), and an unknown one is read as UTC with a
/// note. Times without a zone (floating times) are read as UTC. A <c>DATE</c> start makes an all-day event whose end is
/// exclusive. A repeat rule outside the subset <see cref="CanopyRecurrence"/> reads makes the event single, with a note.</para>
/// <para>Lines are unfolded and text is unescaped (<c>\n</c>, <c>\\</c>, <c>\;</c>, <c>\,</c>); control characters other than
/// tab and line feed are dropped and unpaired surrogates become U+FFFD. An event without a readable start is skipped and
/// counted. Error messages never repeat the text.</para>
/// </remarks>
public static partial class CanopyICalendar {
    /// <summary>The most characters of iCalendar text: 2,000,000.</summary>
    public const int MaxTextLength = 2000000;

    /// <summary>The most <c>VEVENT</c> components: 5,000.</summary>
    public const int MaxEvents = 5000;

    /// <summary>The most content lines, after unfolding: 75,000.</summary>
    public const int MaxLines = 75000;

    /// <summary>The most characters of one unfolded content line: 10,000.</summary>
    public const int MaxLineLength = 10000;

    /// <summary>The most characters of a <c>SUMMARY</c> or <c>LOCATION</c>, and of all <c>CATEGORIES</c> of an event together: 1,000.</summary>
    public const int MaxShortText = 1000;

    /// <summary>The most characters of a <c>DESCRIPTION</c> value: 10,000.</summary>
    public const int MaxDescription = 10000;

    /// <summary>The most <c>EXDATE</c> values of one event: 1,000.</summary>
    public const int MaxExceptions = 1000;

    /// <summary>The deepest nesting of components (<c>BEGIN</c> inside <c>BEGIN</c>): 16.</summary>
    public const int MaxDepth = 16;

    private const int MaxNotes = 100;

    /// <summary>Reads the events of iCalendar text.</summary>
    /// <param name="text">The text, untrusted.</param>
    /// <returns>The events, the number of events skipped, and notes about what was read differently.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="text"/> is null.</exception>
    /// <exception cref="FormatException">The text has no <c>VCALENDAR</c>, or exceeds a limit of this class. The message names
    /// the problem and never repeats the text.</exception>
    public static CanopyICalendarResult Parse(string text) {
        if (text == null) throw new ArgumentNullException(nameof(text));
        if (text.Length > MaxTextLength) throw new FormatException("The iCalendar text is longer than 2,000,000 characters.");
        var reader = new Reader();
        foreach (var line in Unfold(text)) reader.Read(line);
        return reader.Finish();
    }

    /// <summary>The content lines: physical lines split at CR LF, LF or CR, continued by a leading space or tab; empty lines are skipped.</summary>
    private static IEnumerable<string> Unfold(string text) {
        var line = new StringBuilder();
        var lines = 0;
        var position = 0;
        while (position <= text.Length) {
            var end = position;
            while (end < text.Length && text[end] != '\r' && text[end] != '\n') end++;
            var start = position;
            var continued = end > start && (text[start] == ' ' || text[start] == '\t');
            if (continued && line.Length > 0) start++;
            else if (end > start) {
                if (line.Length > 0) { yield return line.ToString(); line.Clear(); }
                if (++lines > MaxLines) throw new FormatException("The iCalendar text has more than 75,000 lines.");
            }
            if (end - start + line.Length > MaxLineLength) throw new FormatException("An iCalendar line is longer than 10,000 characters.");
            line.Append(text, start, end - start);
            position = end + (end + 1 < text.Length && text[end] == '\r' && text[end + 1] == '\n' ? 2 : 1);
        }
        if (line.Length > 0) yield return line.ToString();
    }

    /// <summary>A content line split into its name, parameters and value; null when it has no colon.</summary>
    private static ContentLine? Split(string line) {
        var index = 0;
        while (index < line.Length && line[index] != ';' && line[index] != ':') index++;
        if (index == line.Length || index == 0) return null;
        var name = line.Substring(0, index).ToUpperInvariant();
        var parameters = new Dictionary<string, string>(StringComparer.Ordinal);
        while (index < line.Length && line[index] == ';') {
            var nameStart = ++index;
            while (index < line.Length && line[index] != '=' && line[index] != ';' && line[index] != ':') index++;
            if (index == line.Length) return null;
            var parameter = line.Substring(nameStart, index - nameStart).ToUpperInvariant();
            var value = new StringBuilder();
            if (line[index] == '=') {
                index++;
                // A parameter value is quoted (and may then hold ; : ,) or runs to the next ; or :.
                while (index < line.Length && line[index] != ';' && line[index] != ':') {
                    if (line[index] == '"') {
                        var close = line.IndexOf('"', index + 1);
                        if (close < 0) return null;
                        value.Append(line, index + 1, close - index - 1);
                        index = close + 1;
                    } else value.Append(line[index++]);
                }
            }
            if (!parameters.ContainsKey(parameter)) parameters[parameter] = value.ToString();
        }
        if (index >= line.Length || line[index] != ':') return null;
        return new ContentLine(name, parameters, line.Substring(index + 1));
    }

    private sealed class ContentLine {
        internal ContentLine(string name, Dictionary<string, string> parameters, string value) { Name = name; Parameters = parameters; Value = value; }
        internal string Name { get; }
        internal Dictionary<string, string> Parameters { get; }
        internal string Value { get; }
        internal string? Parameter(string name) => Parameters.TryGetValue(name, out var value) ? value : null;
    }

    /// <summary>Follows the components and collects the events.</summary>
    private sealed class Reader {
        private readonly List<string> _stack = new List<string>();
        private readonly List<CanopyICalendarEvent> _events = new List<CanopyICalendarEvent>();
        private readonly List<string> _notes = new List<string>();
        private readonly Zones _zones;
        private EventBuilder? _event;
        private int _eventDepth = -1;
        private bool _calendar;
        private int _count, _skipped, _moreNotes;

        internal Reader() => _zones = new Zones();

        internal void Read(string text) {
            var line = Split(text);
            if (line == null) { if (_event != null) _event.Bad = true; return; }
            if (line.Name == "BEGIN") { Begin(line.Value.Trim().ToUpperInvariant()); return; }
            if (line.Name == "END") { End(line.Value.Trim().ToUpperInvariant()); return; }
            // Only the event's own properties count, not those of components inside it (an alarm's DESCRIPTION).
            if (_event != null && _stack.Count - 1 == _eventDepth) _event.Add(line);
        }

        private void Begin(string component) {
            if (_stack.Count >= MaxDepth) throw new FormatException("The iCalendar components are nested more than 16 deep.");
            if (component == "VCALENDAR") _calendar = true;
            // Only an event directly inside the calendar counts (VCALENDAR > VEVENT).
            if (component == "VEVENT" && _event == null && _stack.Count > 0 && _stack[_stack.Count - 1] == "VCALENDAR") {
                if (++_count > MaxEvents) throw new FormatException("The iCalendar text has more than 5,000 events.");
                _event = new EventBuilder(_count, _zones, Note);
                _eventDepth = _stack.Count;
            }
            _stack.Add(component);
        }

        /// <summary>Closes the innermost open component of that name and every component inside it; an END without one is ignored.</summary>
        private void End(string component) {
            var index = _stack.LastIndexOf(component);
            if (index < 0) return;
            for (var i = _stack.Count - 1; i >= index; i--) {
                if (i == _eventDepth) {
                    // An event closed by an outer END was not finished properly.
                    if (i != index) _event!.Bad = true;
                    Close();
                }
                _stack.RemoveAt(i);
            }
        }
        private void Close() {
            var built = _event!.Build();
            if (built == null) _skipped++;
            else _events.Add(built);
            _event = null;
            _eventDepth = -1;
        }

        internal CanopyICalendarResult Finish() {
            if (_event != null) { _event.Bad = true; Close(); }
            if (!_calendar) throw new FormatException("The text is not iCalendar: it has no VCALENDAR.");
            if (_moreNotes > 0) _notes.Add("More notes were left out.");
            return new CanopyICalendarResult(_events, _skipped, _notes);
        }

        private void Note(string note) {
            if (_notes.Count < MaxNotes) _notes.Add(note);
            else _moreNotes++;
        }
    }

    /// <summary>Drops control characters other than tab and line feed and replaces unpaired surrogates.</summary>
    internal static string Clean(string text) {
        StringBuilder? builder = null;
        for (var i = 0; i < text.Length; i++) {
            var character = text[i];
            string? replacement = null;
            if (char.IsHighSurrogate(character) && i + 1 < text.Length && char.IsLowSurrogate(text[i + 1])) {
                builder?.Append(character).Append(text[i + 1]);
                i++;
                continue;
            }
            if (char.IsSurrogate(character)) replacement = "�";
            else if (char.IsControl(character) && character != '\t' && character != '\n') replacement = string.Empty;
            if (replacement != null && builder == null) builder = new StringBuilder(text.Length).Append(text, 0, i);
            if (builder != null) { if (replacement != null) builder.Append(replacement); else builder.Append(character); }
        }
        return builder?.ToString() ?? text;
    }
}
