  // ---------- forms: the built-in typed editors ----------
  // The forms part (Build/parts.json) is the one implementation of editors and field checks behind grid editing, the record
  // drawer's edit form, the calendar's event form and flows (docs/flow.md). It installs into FORMS_IMPL; the parts that
  // need it require it and read their helpers from there.
  // An editor is { create(context) } returning { element, getValue(), focus?(), error?(), destroy?() } (docs/editing.md).
  // getValue returns the raw cell value; error returns a message while the input is not a value yet (text in a number
  // field, half a date). The editor consumes the keys it needs by calling preventDefault (an open lookup list takes Enter
  // and Escape); the grid handles Enter, Tab and Escape otherwise.
  const editPad = (number, width = 2) => String(number).padStart(width, "0");

  function editInput(context, type = "text") {
    const input = h("input", "cx-editor");
    input.type = type; input.autocomplete = "off";
    if (typeof context.editor.placeholder === "string") input.placeholder = context.editor.placeholder;
    return input;
  }

  // The group and decimal separators of the page language; parsing reads numbers as people of that language type them.
  const EDIT_NUMBER_LOCALES = new Map();
  function editParseNumber(text, locale) {
    let format = EDIT_NUMBER_LOCALES.get(locale);
    if (!format) {
      let number;
      try { number = new Intl.NumberFormat(locale || undefined); } catch (error) { number = new Intl.NumberFormat(); }
      const digits = new Map();
      for (let digit = 0; digit < 10; digit++) digits.set(number.formatToParts(digit).find(part => part.type === "integer").value, String(digit));
      format = { parts: number.formatToParts(-12345.6), digits };
      if (EDIT_NUMBER_LOCALES.size >= 32) EDIT_NUMBER_LOCALES.delete(EDIT_NUMBER_LOCALES.keys().next().value);
      EDIT_NUMBER_LOCALES.set(locale, format);
    }
    const parts = format.parts;
    const group = parts.find(part => part.type === "group")?.value ?? ",", decimal = parts.find(part => part.type === "decimal")?.value ?? ".";
    let source = Array.from(text.trim(), digit => format.digits.get(digit) ?? digit).join("").replace(/[\u061c\u200e\u200f]/g, "").replace(/\u2212/g, "-");
    // Group separators count only in groups of three digits before the decimal separator ("1.5" is not 15 in German).
    const pieces = source.split(decimal), whole = pieces[0], spaced = !group.trim();
    if (pieces.length > 2) return NaN;
    const groups = whole.replace(/^[-+]/, "").split(spaced ? /[\s\u00a0\u202f]/ : group);
    if (groups.length > 1 && (!/^\d{1,3}$/.test(groups[0]) || groups.slice(1).some(digits => !/^\d{3}$/.test(digits)))) return NaN;
    source = (/^[-+]/.test(whole) ? whole[0] : "") + groups.join("") + (pieces.length > 1 ? "." + pieces[1] : "");
    return /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(source) ? Number(source) : NaN;
  }

  // A moment's date and time parts in the grid's time zone, and a moment back from such parts, as ISO with Z.
  function editMoment(value, local) {
    const date = typeof value === "string" ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return null;
    const get = name => date[(local ? "get" : "getUTC") + name]();
    const seconds = get("Seconds"), milliseconds = get("Milliseconds");
    const time = editPad(get("Hours")) + ":" + editPad(get("Minutes")) +
      (seconds || milliseconds ? ":" + editPad(seconds) + (milliseconds ? "." + editPad(milliseconds, 3) : "") : "");
    return { date: editPad(get("FullYear"), 4) + "-" + editPad(get("Month") + 1) + "-" + editPad(get("Date")), time };
  }
  function editFromParts(date, time, local) {
    const [clock, fraction = ""] = time.split("."), milliseconds = Number(fraction.padEnd(3, "0"));
    const [year, month, day] = date.split("-").map(Number), [hours, minutes, seconds = 0] = clock.split(":").map(Number);
    const moment = gridMomentFromParts(year, month, day, hours, minutes, seconds, local);
    if (!moment || !Number.isInteger(milliseconds) || milliseconds < 0 || milliseconds > 999) return null;
    moment.setUTCMilliseconds(milliseconds);
    return moment.toISOString().replace(".000Z", "Z");
  }

  // Date, time and date-and-time. On a datetime column the input shows the moment in the grid's time zone (local or UTC)
  // and writes it back as ISO with Z: a date keeps the time of day, a time keeps the date. On a text column the value is
  // the input's own text (yyyy-MM-dd, HH:mm or yyyy-MM-ddTHH:mm).
  function editDateEditor(context, withDate, withTime) {
    const local = context.timeZone === "local", moment = context.column.kind === "datetime";
    const input = editInput(context, withDate && withTime ? "datetime-local" : withDate ? "date" : "time");
    if (moment && withTime) input.step = "0.001";
    const parts = moment ? editMoment(context.value, local) : null;
    const start = !moment ? typeof context.value === "string" ? context.value : "" : !parts ? "" :
      withDate && withTime ? parts.date + "T" + parts.time : withDate ? parts.date : parts.time;
    input.value = start;
    // Native inputs sanitize legacy text they cannot represent. Opening such a value does not edit it.
    const displayed = input.value;
    let changed = false;
    input.addEventListener("input", () => { changed = true; });
    const read = () => {
      if (!changed && input.value === displayed || input.value === start) return context.value ?? null;
      if (!input.value) return null;
      if (!moment) return input.value;
      const [date, time] = withDate && withTime ? input.value.split("T") : withDate ? [input.value, parts ? parts.time : "00:00"] :
        [(parts || editMoment(new Date().toISOString(), local)).date, input.value];
      return editFromParts(date, time, local);
    };
    return { element: input, getValue: read,
      error: () => input.validity?.badInput || moment && input.value && read() === null ? fill(context.labels.gridEditDate, { column: context.column.title }) : null };
  }

  // A step's decimal places include its exponent; native toFixed accepts at most 100 places.
  function editNumberPlaces(value) {
    const [coefficient, exponent = "0"] = String(value).split("e");
    return Math.max(0, (coefficient.split(".")[1] || "").length - Number(exponent));
  }

  const EDIT_EDITORS = {
    text: { create(context) {
      const input = editInput(context);
      input.value = context.initial ?? (context.value == null ? "" : String(context.value));
      return { element: input, getValue: () => input.value === "" && context.value == null ? null : input.value };
    } },

    // Locale-aware text entry; Up and Down step by the editor's step within min and max.
    number: { create(context) {
      const input = editInput(context), step = context.editor.step || 1, rules = context.rules;
      const decimals = Math.max(editNumberPlaces(step), editNumberPlaces(rules.min ?? 0));
      let plain;
      try { plain = new Intl.NumberFormat(context.locale || undefined, { useGrouping: false, maximumSignificantDigits: 21 }); }
      catch (error) { plain = new Intl.NumberFormat(undefined, { useGrouping: false, maximumSignificantDigits: 21 }); }
      input.inputMode = "decimal";
      input.value = context.initial ?? (typeof context.value === "number" ? plain.format(context.value) : "");
      const read = () => input.value.trim() === "" ? null : editParseNumber(input.value, context.locale);
      input.addEventListener("keydown", event => {
        if (event.key !== "ArrowUp" && event.key !== "ArrowDown" || event.altKey) return;
        if (context.readOnly) { event.preventDefault(); return; }
        const value = read();
        if (!Number.isNaN(value)) {
          let next = (value ?? 0) + (event.key === "ArrowUp" ? step : -step);
          if (typeof rules.min === "number") next = Math.max(rules.min, next);
          if (typeof rules.max === "number") next = Math.min(rules.max, next);
          input.value = plain.format(decimals <= 100 ? Number(next.toFixed(decimals)) : next);
        }
        event.preventDefault();
      });
      return { element: input, getValue: read,
        error: () => Number.isNaN(read()) ? fill(context.labels.gridEditNumber, { column: context.column.title }) : null };
    } },

    datetime: { create: context => editDateEditor(context, true, true) },
    date: { create: context => editDateEditor(context, true, false) },
    time: { create: context => editDateEditor(context, false, true) },

    // A list of the editor's options. A value outside the list stays choosable, so opening the editor never loses it.
    select: { create(context) {
      const select = h("select", "cx-editor"), options = (context.options || []).slice();
      if (context.value != null && !options.some(option => option.value === context.value))
        options.unshift({ value: context.value, label: context.text || String(context.value) });
      if (!context.rules.required || context.value == null) select.appendChild(new Option(context.labels.gridEditNone, ""));
      options.forEach((option, index) => {
        const item = new Option(option.label, String(index));
        item.disabled = !!option.disabledReason;
        select.appendChild(item);
      });
      const at = options.findIndex(option => option.value === context.value);
      select.value = at < 0 ? "" : String(at);
      return { element: select, getValue: () => select.value === "" ? null : options[Number(select.value)].value };
    } },

    toggle: { create(context) {
      const box = h("input", "cx-editor cx-editor-toggle");
      box.type = "checkbox"; box.checked = context.value === true;
      return { element: box, getValue: () => box.checked };
    } },

    lookup: { create: context => editLookupEditor(context) }
  };
