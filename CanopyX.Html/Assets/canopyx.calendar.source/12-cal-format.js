  // ---------- calendar: dates and times in the page language through Intl ----------
  // Day formats read a day number as a UTC date, so a day never shifts with the zone; times read instants in the display
  // zone. Month and weekday names, the order of day and month and the hour cycle all come from Intl for the page language,
  // so no English name appears in another language. A browser without Intl.DateTimeFormat#formatRange joins the two ends.
  const CAL_SUNDAY_REGIONS = /^(?:US|CA|MX|BR|JP|KR|TW|HK|IL|PH|IN|ZA|SA|AR|CO|PE|VE|GT|HN|SV|NI|PA|DO|PR|KE|TH|ID|PK|BD)$/;

  /** The page language's first weekday (0 Sunday … 6 Saturday). */
  function calFirstDay(lang) {
    try {
      const locale = new Intl.Locale(lang || "en-US"), info = typeof locale.getWeekInfo === "function" ? locale.getWeekInfo() : locale.weekInfo;
      if (info && Number.isInteger(info.firstDay)) return info.firstDay % 7;
      const region = locale.maximize().region;
      return CAL_SUNDAY_REGIONS.test(region || "") ? 0 : region ? 1 : 0;
    } catch (_) { return 1; }
  }

  /** The formatters of one calendar: its language, and the zone its times show in. */
  function calFormats(lang, zone) {
    const cache = new Map(), timeZone = zone.name === "utc" ? "UTC" : zone.name === "local" ? undefined : zone.name;
    const make = (options, dayFormat) => {
      const key = JSON.stringify(options) + (dayFormat ? "d" : "t");
      let format = cache.get(key);
      if (!format) {
        const settings = { ...options, timeZone: dayFormat ? "UTC" : timeZone };
        try { format = new Intl.DateTimeFormat(lang || undefined, settings); } catch (_) { format = new Intl.DateTimeFormat(undefined, settings); }
        cache.set(key, format);
      }
      return format;
    };
    const day = (options, value) => make(options, true).format(new Date(value * CAL_DAY));
    const range = (options, from, to) => {
      if (from === to) return day(options, from);
      const format = make(options, true);
      try { return format.formatRange(new Date(from * CAL_DAY), new Date(to * CAL_DAY)); } catch (_) { return format.format(new Date(from * CAL_DAY)) + " – " + format.format(new Date(to * CAL_DAY)); }
    };
    return {
      lang,
      day, range,
      monthTitle: value => day({ month: "long", year: "numeric" }, value),
      monthName: value => day({ month: "long" }, value),
      monthShort: value => day({ month: "short" }, value),
      weekday: (value, width) => day({ weekday: width || "short" }, value),
      dayNumber: value => day({ day: "numeric" }, value),
      dayHeader: value => day({ weekday: "short", day: "numeric" }, value),
      longDay: value => day({ weekday: "long", day: "numeric", month: "long", year: "numeric" }, value),
      shortDay: value => day({ day: "numeric", month: "short" }, value),
      year: value => day({ year: "numeric" }, value),
      dayRange: (from, to) => range({ day: "numeric", month: "short", year: "numeric" }, from, to),
      monthRange: (from, to) => range({ month: "short", year: "numeric" }, from, to),
      time: value => make({ hour: "numeric", minute: "2-digit" }).format(new Date(value)),
      hour: minutes => make({ hour: "numeric" }, true).format(new Date(minutes * CAL_MINUTE)),
      clock: minutes => make({ hour: "numeric", minute: "2-digit" }, true).format(new Date(minutes * CAL_MINUTE)),
      number: value => numberFormat(lang).format(value)
    };
  }
