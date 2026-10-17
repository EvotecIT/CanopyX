using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace CanopyX;

public static partial class CanopyICalendar {
    private static readonly Regex DurationPattern = new Regex(@"^([+-])?P(?:([0-9]{1,7})W|(?:([0-9]{1,7})D)?(?:T(?:([0-9]{1,7})H)?(?:([0-9]{1,7})M)?(?:([0-9]{1,7})S)?)?)$",
        RegexOptions.CultureInvariant | RegexOptions.IgnoreCase, TimeSpan.FromSeconds(1));
    private static readonly DateTime Earliest = new DateTime(1, 1, 2, 0, 0, 0, DateTimeKind.Utc), Latest = new DateTime(9999, 12, 30, 0, 0, 0, DateTimeKind.Utc);

    /// <summary>A moment or a date of a DTSTART, DTEND, EXDATE or RECURRENCE-ID value.</summary>
    private readonly struct Moment {
        internal Moment(DateTime utc, bool date) { Utc = utc; IsDate = date; }
        /// <summary>The UTC moment, or the UTC midnight of a date.</summary>
        internal DateTime Utc { get; }
        internal bool IsDate { get; }
        /// <summary>The exceptions-grammar form: <c>yyyy-MM-dd</c> for a date, an ISO UTC instant otherwise.</summary>
        internal string Text => IsDate ? Utc.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) : Utc.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", CultureInfo.InvariantCulture);
    }

    /// <summary>Collects one VEVENT's properties and builds the event.</summary>
    private sealed class EventBuilder {
        private readonly int _number;
        private readonly Zones _zones;
        private readonly Action<string> _note;
        private readonly List<string> _categories = new List<string>();
        private readonly List<string> _exceptions = new List<string>();
        private readonly HashSet<string> _seen = new HashSet<string>(StringComparer.Ordinal);
        private string? _uid, _summary, _description, _location, _status, _rule, _zone, _duration;
        private int _categoryLength;
        private Moment? _start, _end, _recurrenceId;
        private bool _zoneNoted;

        internal EventBuilder(int number, Zones zones, Action<string> note) { _number = number; _zones = zones; _note = note; }

        /// <summary>Gets or sets whether the event is malformed and is skipped.</summary>
        internal bool Bad { get; set; }

        internal void Add(ContentLine line) {
            // A property that may appear once keeps its first value; EXDATE and CATEGORIES add up.
            if (line.Name != "EXDATE" && line.Name != "CATEGORIES" && !_seen.Add(line.Name)) return;
            switch (line.Name) {
                case "UID": _uid = Clean(Unescape(line.Value)).Trim(); if (_uid.Length == 0 || _uid.Length > MaxShortText) _uid = null; break;
                case "SUMMARY": _summary = Text(line.Value, MaxShortText, "SUMMARY"); break;
                case "DESCRIPTION": _description = Text(line.Value, MaxDescription, "DESCRIPTION"); break;
                case "LOCATION": _location = Text(line.Value, MaxShortText, "LOCATION"); break;
                case "STATUS": _status = Clean(Unescape(line.Value)).Trim().ToUpperInvariant(); if (_status.Length == 0 || _status.Length > 64) _status = null; break;
                case "CATEGORIES":
                    // The limit holds for all of an event's CATEGORIES lines together.
                    _categoryLength += Clean(Unescape(line.Value)).Length;
                    if (_categoryLength > MaxShortText) throw TooLong("CATEGORIES");
                    foreach (var category in SplitList(line.Value)) {
                        var text = Clean(Unescape(category)).Trim();
                        if (text.Length > 0) _categories.Add(text);
                    }
                    break;
                case "DTSTART": _start = Read(line, true); if (_start == null) Bad = true; break;
                case "DTEND": _end = Read(line, false); break;
                case "DURATION": _duration = line.Value.Trim(); break;
                case "RRULE": _rule = Clean(line.Value).Trim(); break;
                case "RECURRENCE-ID": _recurrenceId = Read(line, false); break;
                case "EXDATE":
                    foreach (var value in line.Value.Split(',')) {
                        if (value.Trim().Length == 0) continue;
                        if (_exceptions.Count >= MaxExceptions) throw new FormatException("An iCalendar event has more than 1,000 EXDATE values.");
                        var moment = Moment(value.Trim(), line);
                        if (moment.HasValue) _exceptions.Add(moment.Value.Text);
                    }
                    break;
            }
        }

        private Moment? Read(ContentLine line, bool start) {
            var moment = Moment(line.Value.Trim(), line);
            if (start && moment.HasValue && !moment.Value.IsDate) _zone = ZoneName(line);
            return moment;
        }

        /// <summary>A value as a moment: a date (VALUE=DATE or eight digits), a UTC time (Z), a time in its TZID zone, or a floating time read as UTC.</summary>
        private Moment? Moment(string value, ContentLine line) {
            var date = string.Equals(line.Parameter("VALUE"), "DATE", StringComparison.OrdinalIgnoreCase) || value.Length == 8;
            if (date) {
                if (value.Length != 8 || !DateTime.TryParseExact(value, "yyyyMMdd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var day)) return null;
                return InRange(DateTime.SpecifyKind(day, DateTimeKind.Utc), true);
            }
            var utc = value.EndsWith("Z", StringComparison.OrdinalIgnoreCase);
            var wallText = utc ? value.Substring(0, value.Length - 1) : value;
            // RFC 5545 permits a leap second. As the browser reader does, represent it by the preceding second;
            // DateTime has no second 60. Other malformed components still go through the ordinary exact parser.
            if (wallText.Length == 15 && wallText[13] == '6' && wallText[14] == '0') wallText = wallText.Substring(0, 13) + "59";
            if (wallText.Length != 15 || !DateTime.TryParseExact(wallText, "yyyyMMdd'T'HHmmss", CultureInfo.InvariantCulture, DateTimeStyles.None, out var wall)) return null;
            if (utc) return InRange(DateTime.SpecifyKind(wall, DateTimeKind.Utc), false);
            var name = ZoneName(line);
            var zone = name == null ? null : _zones.Find(name);
            if (name != null && zone == null && !_zoneNoted) {
                _zoneNoted = true;
                _note("Event " + _number + ": its time zone is unknown here, so its times are read as UTC.");
            }
            if (zone == null) return InRange(DateTime.SpecifyKind(wall, DateTimeKind.Utc), false);
            if (wall < Earliest.AddDays(2) || wall > Latest.AddDays(-2)) return null;
            return InRange(CanopyRecurrenceZone.Resolve(wall, zone).UtcDateTime, false);
        }

        private static Moment? InRange(DateTime utc, bool date) => utc < Earliest || utc > Latest ? null : new Moment(utc, date);

        private static string? ZoneName(ContentLine line) {
            var zone = line.Parameter("TZID");
            return string.IsNullOrWhiteSpace(zone) ? null : zone!.Trim();
        }

        /// <summary>The event, or null when it is malformed or has no readable start.</summary>
        internal CanopyICalendarEvent? Build() {
            if (Bad || !_start.HasValue) return null;
            var start = _start.Value;
            DateTime? end = null;
            var zone = _zone != null ? _zones.Find(_zone) : null;
            if (_end.HasValue && _end.Value.IsDate == start.IsDate) end = _end.Value.Utc;
            else if (_duration != null) end = Add(start.Utc, _duration, zone);
            // An all-day event ends at a midnight.
            if (start.IsDate && end.HasValue && end.Value.TimeOfDay != TimeSpan.Zero) end = end.Value.Date.AddDays(1);
            if (end.HasValue && end.Value <= start.Utc) end = null;
            // A date start without an end lasts one day (RFC 5545); a time start without one is a moment.
            if (start.IsDate && !end.HasValue) end = start.Utc.AddDays(1);
            string? rule = null;
            if (_rule != null) {
                if (CanopyRecurrence.TryParse(_rule, out var parsed)) rule = parsed!.ToString();
                else _note("Event " + _number + ": its repeat rule is outside the supported subset, so it shows once.");
            }
            if (zone == null) _zone = null;
            else if (_zone!.StartsWith("/", StringComparison.Ordinal)) _zone = _zone.Substring(1);
            return new CanopyICalendarEvent(_uid, _summary, _description, _location, start.Utc, end, start.IsDate, _zone, rule,
                rule != null && _exceptions.Count > 0 ? string.Join(",", _exceptions) : null, _recurrenceId?.Utc, _recurrenceId?.IsDate ?? false, _status, _categories);
        }

        /// <summary>
        /// The end a DURATION gives, or null when it is not a duration or runs past the calendar. Weeks and days are nominal: they keep
        /// the wall time in the start's zone across a daylight saving change; hours, minutes and seconds are exact (RFC 5545).
        /// </summary>
        private DateTime? Add(DateTime start, string text, TimeZoneInfo? zone) {
            // A duration is short; longer text is not one, and the pattern never sees it.
            if (text.Length > 64) return null;
            var match = DurationPattern.Match(text);
            if (!match.Success || match.Value == "P" || match.Value.EndsWith("T", StringComparison.OrdinalIgnoreCase)) return null;
            if (match.Groups[1].Value == "-") return null;
            double Part(int group) => match.Groups[group].Success ? double.Parse(match.Groups[group].Value, CultureInfo.InvariantCulture) : 0;
            var days = Part(2) * 7 + Part(3);
            var seconds = Part(4) * 3600 + Part(5) * 60 + Part(6);
            var span = days * 86400 + seconds;
            // A day more than the span allows for a daylight saving change; past the calendar's end is not an end.
            if (span <= 0 || start.AddSeconds(Math.Min(span + 86400, (Latest - start).TotalSeconds)) >= Latest) return null;
            var end = start;
            if (days > 0) {
                end = zone == null ? start.AddDays(days)
                    : CanopyRecurrenceZone.Resolve(TimeZoneInfo.ConvertTimeFromUtc(start, zone).AddDays(days), zone).UtcDateTime;
            }
            return end.AddSeconds(seconds);
        }

        private static string Text(string value, int limit, string name) {
            var text = Clean(Unescape(value));
            if (text.Length > limit) throw TooLong(name);
            return text;
        }

        private static FormatException TooLong(string name) => new FormatException("An iCalendar " + name + " is longer than " + (name == "DESCRIPTION" ? "10,000" : "1,000") + " characters.");
    }

    /// <summary>Unescapes text values: <c>\n</c> and <c>\N</c> become a line feed, <c>\\</c>, <c>\;</c> and <c>\,</c> their character.</summary>
    internal static string Unescape(string value) {
        if (value.IndexOf('\\') < 0) return value;
        var builder = new StringBuilder(value.Length);
        for (var i = 0; i < value.Length; i++) {
            var character = value[i];
            if (character == '\\' && i + 1 < value.Length) {
                var next = value[i + 1];
                if (next == 'n' || next == 'N') { builder.Append('\n'); i++; continue; }
                if (next == '\\' || next == ';' || next == ',') { builder.Append(next); i++; continue; }
            }
            builder.Append(character);
        }
        return builder.ToString();
    }

    /// <summary>Splits a list value at commas that are not escaped.</summary>
    private static IEnumerable<string> SplitList(string value) {
        var start = 0;
        for (var i = 0; i < value.Length; i++) {
            if (value[i] == '\\') { i++; continue; }
            if (value[i] == ',') { yield return value.Substring(start, i - start); start = i + 1; }
        }
        yield return value.Substring(start);
    }

    /// <summary>The browser-facing alias for a known import zone, reusing the reader's IANA-to-Windows aliases.</summary>
    internal static string? CalendarTimeZone(string name) => Zones.BrowserName(name);

    /// <summary>The system rules of an imported zone; unzoned and floating starts were read as UTC.</summary>
    internal static TimeZoneInfo? CalendarSystemZone(string? name) => name == null ? TimeZoneInfo.Utc : Zones.Lookup(name);

    /// <summary>Finds TZID zones once per import: system zones by IANA or Windows name, and a few common IANA names on .NET Framework.</summary>
    private sealed class Zones {
        private static readonly Dictionary<string, string> Windows = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase) {
            ["Etc/UTC"] = "UTC", ["Etc/GMT"] = "UTC", ["UTC"] = "UTC", ["GMT"] = "UTC",
            ["Europe/London"] = "GMT Standard Time", ["Europe/Dublin"] = "GMT Standard Time", ["Europe/Lisbon"] = "GMT Standard Time",
            ["Europe/Berlin"] = "W. Europe Standard Time", ["Europe/Amsterdam"] = "W. Europe Standard Time", ["Europe/Rome"] = "W. Europe Standard Time",
            ["Europe/Vienna"] = "W. Europe Standard Time", ["Europe/Zurich"] = "W. Europe Standard Time", ["Europe/Stockholm"] = "W. Europe Standard Time",
            ["Europe/Paris"] = "Romance Standard Time", ["Europe/Madrid"] = "Romance Standard Time", ["Europe/Brussels"] = "Romance Standard Time",
            ["Europe/Copenhagen"] = "Romance Standard Time", ["Europe/Warsaw"] = "Central European Standard Time", ["Europe/Prague"] = "Central Europe Standard Time",
            ["Europe/Budapest"] = "Central Europe Standard Time", ["Europe/Athens"] = "GTB Standard Time", ["Europe/Bucharest"] = "GTB Standard Time",
            ["Europe/Helsinki"] = "FLE Standard Time", ["Europe/Kiev"] = "FLE Standard Time", ["Europe/Kyiv"] = "FLE Standard Time", ["Europe/Istanbul"] = "Turkey Standard Time",
            ["Europe/Moscow"] = "Russian Standard Time", ["America/New_York"] = "Eastern Standard Time", ["America/Toronto"] = "Eastern Standard Time",
            ["America/Chicago"] = "Central Standard Time", ["America/Denver"] = "Mountain Standard Time", ["America/Phoenix"] = "US Mountain Standard Time",
            ["America/Los_Angeles"] = "Pacific Standard Time", ["America/Anchorage"] = "Alaskan Standard Time", ["Pacific/Honolulu"] = "Hawaiian Standard Time",
            ["America/Sao_Paulo"] = "E. South America Standard Time", ["America/Mexico_City"] = "Central Standard Time (Mexico)",
            ["Asia/Tokyo"] = "Tokyo Standard Time", ["Asia/Shanghai"] = "China Standard Time", ["Asia/Hong_Kong"] = "China Standard Time",
            ["Asia/Singapore"] = "Singapore Standard Time", ["Asia/Kolkata"] = "India Standard Time", ["Asia/Dubai"] = "Arabian Standard Time",
            ["Asia/Seoul"] = "Korea Standard Time", ["Australia/Sydney"] = "AUS Eastern Standard Time", ["Australia/Melbourne"] = "AUS Eastern Standard Time",
            ["Australia/Perth"] = "W. Australia Standard Time", ["Pacific/Auckland"] = "New Zealand Standard Time", ["Africa/Johannesburg"] = "South Africa Standard Time"
        };

        private readonly Dictionary<string, TimeZoneInfo?> _found = new Dictionary<string, TimeZoneInfo?>(StringComparer.Ordinal);
        /// <summary>The zone a TZID names, or null (read as UTC, with a note) when no system zone has that name.</summary>
        internal TimeZoneInfo? Find(string name) {
            name = name.Trim();
            if (name.StartsWith("/", StringComparison.Ordinal)) name = name.Substring(1);
            if (!_found.TryGetValue(name, out var zone)) {
                // At most 100 distinct names are looked up; the rest read as UTC.
                zone = _found.Count < 100 && Plausible(name) ? Lookup(name) : null;
                _found[name] = zone;
            }
            return zone;
        }

        /// <summary>Whether a name is shaped like a zone name: 1 to 64 letters, digits, spaces and <c>/ _ + - . ( )</c>, without <c>..</c>.</summary>
        private static bool Plausible(string name) {
            if (name.Length == 0 || name.Length > 64 || name.IndexOf("..", StringComparison.Ordinal) >= 0 || name.StartsWith("/", StringComparison.Ordinal)) return false;
            foreach (var character in name) {
                if (!(character >= 'A' && character <= 'Z' || character >= 'a' && character <= 'z' || character >= '0' && character <= '9' ||
                      character == '/' || character == '_' || character == '+' || character == '-' || character == '.' || character == ' ' || character == '(' || character == ')')) return false;
            }
            return true;
        }

        /// <summary>A name the calendar can send to browsers; a Windows alias is used only when its system rules agree.</summary>
        internal static string? BrowserName(string name) {
            var zone = Lookup(name);
            if (zone == null) return null;
            if (IsIanaName(name)) return name;
            string? best = null;
            foreach (var alias in Windows) {
                if (!string.Equals(alias.Value, name, StringComparison.OrdinalIgnoreCase)) continue;
                var candidate = Lookup(alias.Key);
                if (candidate != null && zone.HasSameRules(candidate) && (best == null || string.CompareOrdinal(alias.Key, best) < 0)) best = alias.Key;
            }
            return best;
        }

        /// <summary>Whether a known system name is shaped like a browser IANA name.</summary>
        private static bool IsIanaName(string name) {
            if (name.Length == 0 || name.Length > 64 || !(name[0] >= 'A' && name[0] <= 'Z' || name[0] >= 'a' && name[0] <= 'z') || name.EndsWith("/", StringComparison.Ordinal)) return false;
            var previous = '/';
            foreach (var character in name) {
                var allowed = character >= 'A' && character <= 'Z' || character >= 'a' && character <= 'z' || character >= '0' && character <= '9' || character == '_' || character == '-' || character == '+' || character == '/';
                if (!allowed || character == '/' && previous == '/') return false;
                previous = character;
            }
            return true;
        }

        internal static TimeZoneInfo? Lookup(string name) {
            var zone = System(name);
            if (zone == null && Windows.TryGetValue(name, out var windows)) zone = System(windows);
            return zone;
        }

        private static TimeZoneInfo? System(string id) {
            try {
                return TimeZoneInfo.FindSystemTimeZoneById(id);
            } catch (Exception error) when (error is TimeZoneNotFoundException || error is InvalidTimeZoneException || error is System.Security.SecurityException || error is ArgumentException) {
                return null;
            }
        }
    }
}
