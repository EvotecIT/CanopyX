  // ---------- calendar: a recurrence rule as a sentence ("Every week, on Monday and Wednesday, at 09:00, 10 times") ----------
  // C# CanopyRecurrence.Describe writes the same sentences from the same labels; tests/fixtures/recurrence-descriptions.json
  // holds the vectors both check. Weekday and month names and dates come from Intl in the page language, the words around them
  // from the calendarRecurrence… labels. A rule the sentences cannot say exactly is described as null, and callers show its text.
  // The …Day and …Weekday labels hold one phrase, or seven (Monday to Sunday) separated by |, so a language can inflect each
  // weekday ("w pierwszą środę", "la prima domenica"); {day} in a phrase is the culture's weekday name.
  const CAL_RECURRENCE_LABELS = {
    calendarRecurrenceDaily: "every day", calendarRecurrenceDailyInterval: "every {count} days", calendarRecurrenceWeekly: "every week",
    calendarRecurrenceWeeklyInterval: "every {count} weeks", calendarRecurrenceMonthly: "every month", calendarRecurrenceMonthlyInterval: "every {count} months",
    calendarRecurrenceYearly: "every year", calendarRecurrenceYearlyInterval: "every {count} years", calendarRecurrenceOn: "on {days}", calendarRecurrenceOnDay: "{day}",
    calendarRecurrenceEvery: "every {days}", calendarRecurrenceEveryDay: "{day}", calendarRecurrenceWeekdays: "on weekdays", calendarRecurrenceWeekends: "on weekends",
    calendarRecurrenceDayRange: "{first} through {last}", calendarRecurrenceRangeDay: "{day}", calendarRecurrenceList: "{items} and {last}",
    calendarRecurrenceMonthDays: "[one]on day {days}[other]on days {days}", calendarRecurrenceLastDay: "on the last day of the month",
    calendarRecurrenceFirstWeekday: "the first {day}", calendarRecurrenceSecondWeekday: "the second {day}", calendarRecurrenceThirdWeekday: "the third {day}",
    calendarRecurrenceFourthWeekday: "the fourth {day}", calendarRecurrenceFifthWeekday: "the fifth {day}", calendarRecurrenceLastWeekday: "the last {day}",
    calendarRecurrenceInMonths: "in {months}", calendarRecurrenceOnDate: "on {date}",
    calendarRecurrenceAt: "at {time}", calendarRecurrenceTimes: "[one]{count} time[other]{count} times", calendarRecurrenceUntil: "until {date}",
    calendarRecurrenceExcept: "[one]except {count} date[other]except {count} dates"
  };
  const CAL_FREQ_WORDS = { DAILY: "Daily", WEEKLY: "Weekly", MONTHLY: "Monthly", YEARLY: "Yearly" }, CAL_NAMES = new Map();
  const CAL_ORDINALS = ["First", "Second", "Third", "Fourth", "Fifth", "Last"];
  /** Weekday and month names, a day and month, and a long date, in a language (English when the browser does not know it). */
  function calNames(lang) {
    let names = CAL_NAMES.get(lang);
    if (names) return names;
    const format = options => { try { return new Intl.DateTimeFormat(lang, { ...options, timeZone: "UTC" }); } catch (_) { return new Intl.DateTimeFormat("en", { ...options, timeZone: "UTC" }); } };
    const weekday = format({ weekday: "long" }), month = format({ month: "long" });
    names = { days: CAL_WEEKDAYS.map((_, dow) => weekday.format(Date.UTC(2023, 0, 1 + dow))), months: Array.from({ length: 12 }, (_, m) => month.format(Date.UTC(2023, m, 1))),
      monthDay: format({ day: "numeric", month: "long" }), date: format({ dateStyle: "long" }) };
    if (CAL_NAMES.size > 32) CAL_NAMES.clear();
    CAL_NAMES.set(lang, names);
    return names;
  }

  /**
   * A rule as a sentence, or null when the sentences cannot say it exactly. at is the series start's wall time ({ y, m, d, dow,
   * minutes }, as zone.parts gives it). options: lang, labels (any calendarRecurrence… labels; English fills the rest), allDay
   * (no time), time (the start's time as text; HH:mm by default) and exceptions (how many dates the series leaves out).
   */
  function calDescribe(rule, at, options = {}) {
    const lang = options.lang || "en", given = options.labels || {}, names = calNames(lang), grid = { lang };
    // calCount fills placeholders; the words without a count are never plural texts.
    const text = name => Object.hasOwn(given, name) ? given[name] : CAL_RECURRENCE_LABELS[name], say = (name, values) => calCount(grid, text(name), 1, values);
    const list = items => items.length < 2 ? items[0] : say("calendarRecurrenceList", { items: items.slice(0, -1).join(", "), last: items[items.length - 1] });
    let freq = rule.freq, dows = (rule.byDay || []).filter(item => !item.n).map(item => item.dow), nth = (rule.byDay || []).filter(item => item.n);
    if (rule.bySetPos) {
      if (rule.bySetPos.length !== 1 || dows.length !== 1 || nth.length) return null;
      nth = [{ n: rule.bySetPos[0], dow: dows[0] }]; dows = [];
    }
    const monthly = freq === "MONTHLY" || freq === "YEARLY" && !!rule.byMonth, monthDays = rule.byMonthDay;
    if (nth.some(item => item.n < -1 || item.n > 5) || nth.length && !monthly) return null;
    if (dows.length && (freq === "MONTHLY" || freq === "YEARLY")) return null;
    if (monthDays && (rule.byDay || !monthly || (monthDays.length > 1 ? monthDays.some(day => day < 0) : monthDays[0] < -1))) return null;
    if (freq === "DAILY" && dows.length) { if (rule.interval > 1) return null; freq = "WEEKLY"; }
    // A weekday label with neither one phrase nor seven cannot say the rule.
    let days = "", saysRepeat = false, malformed = false;
    const day = (name, dow) => {
      const phrases = text(name).split("|");
      if (phrases.length !== 1 && phrases.length !== 7) malformed = true;
      return phrases[phrases.length === 7 ? (dow + 6) % 7 : 0].replaceAll("{day}", names.days[dow]);
    };
    if (freq === "WEEKLY") {
      const order = dow => (dow + 6) % 7, set = [...new Set(dows.length ? dows : [at.dow])].sort((a, b) => order(a) - order(b)), key = set.join(), last = set[set.length - 1];
      saysRepeat = rule.interval === 1;
      if (key === "1,2,3,4,5") days = text("calendarRecurrenceWeekdays");
      else if (key === "6,0") days = text("calendarRecurrenceWeekends");
      else if (set.length > 2 && order(last) - order(set[0]) === set.length - 1)
        days = say("calendarRecurrenceDayRange", { first: day("calendarRecurrenceRangeDay", set[0]), last: day("calendarRecurrenceRangeDay", last) });
      // Every week reads as the weekdays it repeats on ("every Monday", "w poniedziałki"); a longer interval names them.
      else if (saysRepeat) days = say("calendarRecurrenceEvery", { days: list(set.map(dow => day("calendarRecurrenceEveryDay", dow))) });
      else days = say("calendarRecurrenceOn", { days: list(set.map(dow => day("calendarRecurrenceOnDay", dow))) });
    } else if (freq !== "DAILY") {
      if (nth.length) days = say("calendarRecurrenceOn", { days: list(nth.map(item => day("calendarRecurrence" + CAL_ORDINALS[item.n < 0 ? 5 : item.n - 1] + "Weekday", item.dow))) });
      else if (monthDays && monthDays.length === 1 && monthDays[0] === -1) days = text("calendarRecurrenceLastDay");
      else if (monthDays || monthly) {
        const picked = monthDays ? [...new Set(monthDays)].sort((a, b) => a - b) : [at.d];
        days = calCount(grid, text("calendarRecurrenceMonthDays"), picked.length, { days: list(picked.map(String)) });
      } else days = say("calendarRecurrenceOnDate", { date: names.monthDay.format(Date.UTC(2000, at.m - 1, at.d)) });
    }
    if (malformed) return null;
    const parts = [], word = CAL_FREQ_WORDS[freq], pad = value => String(value).padStart(2, "0");
    if (!saysRepeat) parts.push(rule.interval === 1 ? text("calendarRecurrence" + word) : calCount(grid, text("calendarRecurrence" + word + "Interval"), rule.interval));
    if (rule.byMonth) parts.push(say("calendarRecurrenceInMonths", { months: list([...new Set(rule.byMonth)].sort((a, b) => a - b).map(m => names.months[m - 1])) }));
    if (days) parts.push(days);
    if (!options.allDay) parts.push(say("calendarRecurrenceAt", { time: options.time ?? pad(Math.floor(at.minutes / 60)) + ":" + pad(at.minutes % 60) }));
    if (rule.count !== null) parts.push(calCount(grid, text("calendarRecurrenceTimes"), rule.count));
    if (rule.until) parts.push(say("calendarRecurrenceUntil", { date: names.date.format(rule.until.time ?? rule.until.day * CAL_DAY) }));
    if (options.exceptions > 0) parts.push(calCount(grid, text("calendarRecurrenceExcept"), options.exceptions));
    const sentence = parts.join(", ");
    return sentence.charAt(0).toLocaleUpperCase(lang) + sentence.slice(1);
  }

  const { calEventName, calDetailsContent } = DataGrid.prototype;
  Object.assign(DataGrid.prototype, {
    /**
     * A rule as the calendar's sentence, in the grid's language and labels: start is the series start (a Date, an ISO date-time
     * with Z or an offset, or a yyyy-MM-dd date when allDay), read in the calendar's series zone; exceptions is EXDATE text. The
     * rule text when the sentences cannot say it; rejects a rule outside the subset.
     */
    async describeCalendarRecurrence(rule, start, options = {}) {
      const parsed = calRule(rule), allDay = !!options.allDay, zone = allDay ? calZone("utc") : this.calSeriesZone;
      // An all-day Date names the reader's own date, as createCalendar reads it.
      const time = start instanceof Date ? (allDay ? Date.UTC(start.getFullYear(), start.getMonth(), start.getDate()) : start.getTime()) : allDay ? calParseDay(String(start).slice(0, 10)) * CAL_DAY : calInstant(start);
      if (!Number.isFinite(time)) throw new Error("CanopyX: a recurrence's start is a Date or an ISO date-time with a zone.");
      const { excluded, excludedDays } = calExceptions(options.exceptions, zone);
      return calDescribe(parsed, zone.parts(time), { lang: this.lang, labels: this.labels, allDay, time: allDay ? "" : this.calFmt.time(time),
        exceptions: excluded.size + excludedDays.size }) ?? parsed.text;
    },
    /** The sentence of an event's series, kept with the series; null when it has no rule or the sentences cannot say it. */
    calSeriesText(base) {
      if (!base?.rule || base.ruleError) return null;
      if (base.description === undefined)
        base.description = calDescribe(base.rule, base.seriesZone.parts(base.start), { lang: this.lang, labels: this.labels, allDay: base.allDay,
          time: base.allDay ? "" : this.calFmt.time(base.start), exceptions: base.excluded.size + base.excludedDays.size });
      return base.description;
    },
    // The core names a series' event "…, Repeats"; with this part in, the name ends with the series' sentence instead, so the
    // repeat marker's meaning is read out. The details (popover and hover card) gain a line after the time: the sentence, or
    // the rule text when the sentences cannot say it.
    calEventName(event) {
      const name = calEventName.call(this, event), sentence = event.recurring && this.calSeriesText(event.base), repeats = this.calLabels.calendarRepeats;
      return sentence && name.endsWith(repeats) ? name.slice(0, -repeats.length) + sentence : name;
    },
    calDetailsContent(event, titleId) {
      const parts = calDetailsContent.call(this, event, titleId);
      if (!event.recurring) return parts;
      const line = document.createElement("p"), rule = event.base?.rule?.text, repeats = this.calLabels.calendarRepeats;
      line.className = "cx-cal-det-when cx-cal-det-repeat";
      line.textContent = this.calSeriesText(event.base) || (rule ? repeats + ": " + rule : repeats);
      parts.splice(2, 0, line);
      return parts;
    }
  });
