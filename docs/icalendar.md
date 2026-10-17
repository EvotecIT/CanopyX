# iCalendar import

CanopyX reads the events of iCalendar text (RFC 5545) for a calendar: in the browser, a calendar source with an `ics` URL
([calendar.md](calendar.md)); in .NET, `CanopyICalendar.Parse`. Both read the same subset within the same limits. The text is
untrusted: a limit that is exceeded fails the whole import, and nothing the text holds is run or treated as markup.

## .NET

```csharp
var result = CanopyICalendar.Parse(File.ReadAllText("holidays.ics"));
foreach (var note in result.Notes) logger.LogInformation("{Note}", note);   // "Event 4: its time zone is unknown here, ..."

var calendar = new CanopyCalendar(result.ToCalendarEvents(source: "holidays")) { TimeZone = result.TimeZone };
calendar.Sources.Add(new CanopyCalendarSource("holidays", "Public holidays") { Tone = CanopyTone.Info });
calendar.SaveHtmlPage("holidays.html");
```

`Parse(string text)` returns a `CanopyICalendarResult`:

| Member | Meaning |
| --- | --- |
| `Events` | The `CanopyICalendarEvent`s, in the order of the text. |
| `Skipped` | How many events were skipped because they were malformed or had no readable start. |
| `TimeZone` | A browser-compatible IANA zone for the first active timed series with a supported zone, or null. A supported Windows name uses an equivalent alias from the reader's existing mapping. Set it as the calendar's `TimeZone` so series keep their wall time across daylight saving changes. Without it, series repeat in UTC. |
| `Notes` | At most 100 notes about events read differently (an unknown time zone read as UTC, a repeat rule outside the supported subset). They name events by position and never repeat the text. |
| `ToCalendarEvents(source)` | The events as `CanopyCalendarEvent`s for a basic calendar, each with the optional source id. |

A `CanopyICalendarEvent` has:

| Member | From | Meaning |
| --- | --- | --- |
| `Uid` | `UID` | The identity, at most 1,000 characters, or null. |
| `Summary`, `Description`, `Location` | `SUMMARY`, `DESCRIPTION`, `LOCATION` | Plain text, unescaped. |
| `Start`, `End`, `AllDay` | `DTSTART`, `DTEND`, `DURATION` | UTC times. A `DATE` start is an all-day event: `Start` is the UTC midnight of its date and `End` is exclusive (one day when there is no end). A time start without an end or duration has no `End`. An end at or before the start is ignored. `DTEND` wins over `DURATION`, whose weeks and days keep the wall time in the start's zone across a daylight saving change while hours, minutes and seconds are exact; an all-day end is rounded up to a midnight. Durations are written with ASCII digits. |
| `TimeZone` | `DTSTART;TZID=` | The start's zone name when a system zone has it, else null. |
| `Recurrence` | `RRULE` | `CanopyRecurrence` rule text, or null: a rule outside the supported subset makes the event single, with a note. |
| `Exceptions` | `EXDATE` | The excluded occurrences of a repeating event in the calendar's exceptions grammar: UTC instants (`2026-10-12T07:00:00Z`) or dates (`2026-10-03`), comma-separated. |
| `RecurrenceId`, `RecurrenceIdIsDate` | `RECURRENCE-ID` | The original start (UTC) of the occurrence this event replaces. |
| `Status` | `STATUS` | Upper case (`TENTATIVE`, `CONFIRMED`, `CANCELLED`), at most 64 characters, or null. |
| `Categories` | `CATEGORIES` | Every category of every `CATEGORIES` line, in order. |

`ToCalendarEvents` gives each event its title (`SUMMARY`, or an empty title), its description with the location on a line of
its own, its times, and its repeat rule with its exceptions. An event that replaces one occurrence of a series (the same `UID`
with a `RECURRENCE-ID`) becomes an exception of the series and an event of its own; cancelled events are left out. A series
keeps at most 1,000 exceptions (moved occurrences past that show twice), and an event that replaces an occurrence of a series
whose rule fell back to a single event shows beside it.

A basic calendar has one recurrence time zone. `ToCalendarEvents` accepts timed series whose zones have the same system
rules, including equivalent IANA and Windows aliases. It throws `InvalidOperationException` when active timed series use
incompatible zones (for example UTC and `Europe/Warsaw`), or a known Windows zone has no equivalent browser alias in the
reader's mapping. This prevents an import from silently shifting later occurrences across a daylight saving change.
Cancelled series, moved occurrences, all-day series and single events do not need a common recurrence zone. For a mixed-zone
file, read `Events` and place timed series in separate calendars with their corresponding zones; parsing and the raw events
remain available even when conversion is refused.

## In the browser

A calendar source with `ics` reads a file on the page's own site ([Sources and iCalendar](calendar.md#sources-and-icalendar)):

```js
CanopyX.createCalendar(host, { events, sources: [{ id: "team", label: "Team" }, { id: "holidays", label: "Public holidays", tone: "success", ics: "holidays.ics" }] });
```

The `calendar-ics` part fetches it once with the page's credentials, refuses a response from another origin or larger than
8 MB, and reads it with the rules and limits below. Its events join the calendar read-only under the source's id; a cancelled
occurrence of a series becomes an exception of it. A failure shows "Could not read Public holidays: ..." in the calendar's
notice and raises the grid's `error` event; `canopyx:calendarImport` reports `{ source, events, skipped, notes }`. Time zones
are the browser's own IANA zones; Windows zone names are not read there.

Each imported timed series keeps its own IANA or UTC recurrence zone, including when a file mixes zones. Changing the
calendar's display zone changes how its times are shown; recurrence, excluded dates and iCalendar export keep the imported
series' wall time across daylight saving changes. Imported all-day events keep their dates.

Because a calendar expands series on every paint, the browser also bounds imported repeat rules: at most 1,000 repeating
events a file (later ones show once), a rule must repeat within its first thousand periods (a rule that never matches shows
once), and a `COUNT` becomes the `UNTIL` of its last occurrence, at most the 1,000th (a note says when a count was cut). Each
case adds a note. An identity or status longer than its limit is dropped, as in .NET; an empty `EXDATE` value is ignored.

## What is read

- `VCALENDAR` > `VEVENT`: only events directly inside the calendar. Other components (`VTODO`, `VJOURNAL`, `VALARM`, ...) are ignored, and the properties of a
  component inside an event (an alarm's `DESCRIPTION`) never count as the event's. Events outside a `VCALENDAR` are ignored.
- `VTIMEZONE` is skipped. A `TZID` names a system time zone: an IANA name (`Europe/Warsaw`; .NET Framework maps about fifty
  common IANA names to Windows zones), or a Windows zone name on Windows. A name that is not found, or is not shaped like a
  zone name (1 to 64 letters, digits, spaces and `/ _ + - . ( )`, without `..`), is read as UTC with one note per event. At most
  100 distinct names are looked up per import. Times without a zone (floating times) are read as UTC.
- Daylight saving: a wall time the clocks skip moves forward by the gap, a repeated wall time is its first occurrence.
- Text values are unescaped: `\n` and `\N` become a line feed, `\\`, `\;` and `\,` their character; any other backslash stays.
- Control characters other than tab and line feed are dropped, and unpaired surrogates become U+FFFD. Other invisible format
  characters (such as bidirectional overrides) are kept: show the text as text.
- Lines end with CR LF, LF or CR and are unfolded (a line starting with a space or tab continues the previous one). Empty
  lines are skipped. Property and parameter names are case-insensitive; quoted parameter values may hold `;`, `:` and `,`.
- A property that appears more than once in an event keeps its first value, except `EXDATE` and `CATEGORIES`, which add up.

## Limits

Every limit fails the whole import with a `FormatException` whose message names the limit and never repeats the text.

| Limit | Value |
| --- | --- |
| Characters of text (`CanopyICalendar.MaxTextLength`) | 2,000,000 |
| `VEVENT` components (`MaxEvents`) | 5,000 |
| Content lines after unfolding (`MaxLines`) | 75,000 |
| Characters of one unfolded line (`MaxLineLength`) | 10,000 |
| Characters of `SUMMARY`, `LOCATION`, and all `CATEGORIES` lines of an event together, after unescaping (`MaxShortText`) | 1,000 |
| Characters of `DESCRIPTION` (`MaxDescription`) | 10,000 |
| `EXDATE` values of one event (`MaxExceptions`) | 1,000 |
| Nesting of components (`MaxDepth`) | 16 |

Text without a `VCALENDAR` fails too. A malformed event (a line without a colon, an unterminated quote, a start that is not a
date or a date-time, an event left open) is skipped and counted in `Skipped`; the rest of the import continues.
