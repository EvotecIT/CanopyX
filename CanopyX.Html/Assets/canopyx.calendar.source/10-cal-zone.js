  // ---------- calendar: time zones, days and wall-clock arithmetic (docs/calendar.md#time-zones) ----------
  // Instants are milliseconds since the epoch. A day is a day number: the days since 1970-01-01 of a wall date, so day
  // arithmetic is integer arithmetic and never meets a DST transition. A zone turns an instant into its wall time and a wall
  // time back into an instant: "utc", "local" (the reader's own zone, as the grid's timeZone says) or an IANA name read through
  // Intl. A wall time that a DST change skips is read with the offset before the gap (02:30 becomes 03:30), and one that
  // repeats means its first occurrence, as RFC 5545 reads local times.
  const CAL_DAY = 86400000, CAL_MINUTE = 60000, CAL_HOUR = 3600000;
  const calZones = new Map();

  /** The day number of a wall date (month 1–12). */
  function calDayNumber(y, m, d) { return Math.floor(Date.UTC(y, m - 1, d) / CAL_DAY); }
  /** { y, m, d, dow } of a day number; dow 0 is Sunday. */
  function calDayParts(day) {
    const date = new Date(day * CAL_DAY);
    return { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate(), dow: date.getUTCDay() };
  }
  function calDow(day) { return ((day + 4) % 7 + 7) % 7; }
  /** The day number of an ISO date "yyyy-MM-dd", or NaN. */
  function calParseDay(text) {
    const match = typeof text === "string" && /^(\d{4})-(\d\d)-(\d\d)$/.exec(text);
    if (!match) return NaN;
    const day = calDayNumber(+match[1], +match[2], +match[3]), parts = calDayParts(day);
    return parts.m === +match[2] && parts.d === +match[3] ? day : NaN;
  }
  function calDayText(day) {
    const parts = calDayParts(day);
    return String(parts.y).padStart(4, "0") + "-" + String(parts.m).padStart(2, "0") + "-" + String(parts.d).padStart(2, "0");
  }
  /** The first day of the month containing a day, and the day a whole number of months later (clamped to the month's end). */
  function calMonthStart(day) { const parts = calDayParts(day); return calDayNumber(parts.y, parts.m, 1); }
  function calAddMonths(day, months) {
    const parts = calDayParts(day), index = parts.y * 12 + parts.m - 1 + months, y = Math.floor(index / 12), m = index - y * 12 + 1;
    return calDayNumber(y, m, Math.min(parts.d, calMonthDays(y, m)));
  }
  function calMonthDays(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
  /** The first day of the week holding a day, for a first weekday 0–6. */
  function calWeekStart(day, firstDay) { return day - (calDow(day) - firstDay + 7) % 7; }
  /** Minutes of "HH:mm" (24:00 allowed), or NaN. */
  function calMinutes(text) {
    const match = typeof text === "string" && /^(\d\d):(\d\d)$/.exec(text);
    return match && +match[1] <= 24 && +match[2] < 60 && +match[1] * 60 + +match[2] <= 1440 ? +match[1] * 60 + +match[2] : NaN;
  }

  /** A zone by name: "utc", "local" or an IANA zone the browser knows; null for an unknown name. */
  function calZone(name) {
    if (calZones.has(name)) return calZones.get(name);
    let offset;
    if (name === "utc") offset = () => 0;
    else if (name === "local") offset = time => -new Date(time).getTimezoneOffset() * CAL_MINUTE;
    else {
      let format;
      try { format = new Intl.DateTimeFormat("en-US", { timeZone: name, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" }); }
      catch (_) { return null; }
      const cache = new Map();
      // Keep minute precision for transitions such as St John's historical 00:01 changes; reuse a bounded cache of minute offsets.
      offset = time => {
        const bucket = Math.floor(time / CAL_MINUTE);
        let value = cache.get(bucket);
        if (value === undefined) {
          const parts = {};
          for (const part of format.formatToParts(new Date(bucket * CAL_MINUTE))) parts[part.type] = part.value;
          value = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second) - bucket * CAL_MINUTE;
          if (cache.size > 4096) cache.clear();
          cache.set(bucket, value);
        }
        return value;
      };
    }
    const zone = {
      name, offset,
      /** The wall time of an instant: { y, m, d, h, mi, day, dow, minutes } (minutes since the wall midnight). */
      parts(time) {
        const date = new Date(time + offset(time)), h = date.getUTCHours(), mi = date.getUTCMinutes();
        const y = date.getUTCFullYear(), m = date.getUTCMonth() + 1, d = date.getUTCDate();
        return { y, m, d, h, mi, day: calDayNumber(y, m, d), dow: date.getUTCDay(), minutes: h * 60 + mi };
      },
      /** The day number an instant falls on in this zone. */
      day(time) { return Math.floor((time + offset(time)) / CAL_DAY); },
      /** The instant of a wall time; minutes may run past 24:00 into the next days. */
      instant(day, minutes) {
        const wall = day * CAL_DAY + minutes * CAL_MINUTE, before = offset(wall - 12 * CAL_HOUR), after = offset(wall + 12 * CAL_HOUR);
        if (before === after) return wall - before;
        const early = wall - before, late = wall - after, earlyValid = offset(early) === before, lateValid = offset(late) === after;
        if (earlyValid && lateValid) return Math.min(early, late);
        return lateValid && !earlyValid ? late : early;
      },
      /** The instant a day starts. */
      start(day) { return zone.instant(day, 0); }
    };
    calZones.set(name, zone);
    return zone;
  }

  /** An ISO instant with an explicit zone as milliseconds, or NaN. */
  function calInstant(value) {
    if (typeof value !== "string") return NaN;
    // The common shape, yyyy-MM-ddTHH:mm:ssZ, is read from its digits: a hosted range or an inline grid has thousands of them.
    if (value.length === 20 && value.charCodeAt(19) === 90 && value.charCodeAt(10) === 84) {
      const digit = at => { const code = value.charCodeAt(at) - 48; return code >= 0 && code <= 9 ? code : NaN; }, two = at => digit(at) * 10 + digit(at + 1);
      const year = two(0) * 100 + two(2), month = two(5), day = two(8), hour = two(11), minute = two(14), second = two(17);
      if (year >= 1000 && month >= 1 && month <= 12 && day >= 1 && day <= 28 && hour < 24 && minute < 60 && second < 60 &&
          value.charCodeAt(4) === 45 && value.charCodeAt(7) === 45 && value.charCodeAt(13) === 58 && value.charCodeAt(16) === 58)
        return Date.UTC(year, month - 1, day, hour, minute, second);
    }
    return /^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(value) ? Date.parse(value) : NaN;
  }
  /** An instant as ISO 8601 UTC with seconds ("2026-10-16T08:30:00Z"); milliseconds only when they are not zero. */
  function calIso(time) {
    const text = new Date(time).toISOString();
    return text.endsWith(".000Z") ? text.slice(0, -5) + "Z" : text;
  }
