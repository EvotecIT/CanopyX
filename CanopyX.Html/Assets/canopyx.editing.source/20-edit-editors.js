  // ---------- editing: the built-in typed editors ----------
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
  function editParseNumber(text, locale) {
    let parts;
    try { parts = new Intl.NumberFormat(locale || undefined).formatToParts(-12345.6); } catch (error) { parts = []; }
    const group = parts.find(part => part.type === "group")?.value ?? ",", decimal = parts.find(part => part.type === "decimal")?.value ?? ".";
    let source = text.trim().replace(/\u2212/g, "-");
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
    return { date: editPad(get("FullYear"), 4) + "-" + editPad(get("Month") + 1) + "-" + editPad(get("Date")), time: editPad(get("Hours")) + ":" + editPad(get("Minutes")) };
  }
  function editFromParts(date, time, local) {
    const [year, month, day] = date.split("-").map(Number), [hours, minutes] = time.split(":").map(Number);
    const moment = local ? new Date(year, month - 1, day, hours, minutes) : new Date(Date.UTC(year, month - 1, day, hours, minutes));
    return Number.isNaN(moment.getTime()) ? null : moment.toISOString().replace(".000Z", "Z");
  }

  // Date, time and date-and-time. On a datetime column the input shows the moment in the grid's time zone (local or UTC)
  // and writes it back as ISO with Z: a date keeps the time of day, a time keeps the date. On a text column the value is
  // the input's own text (yyyy-MM-dd, HH:mm or yyyy-MM-ddTHH:mm).
  function editDateEditor(context, withDate, withTime) {
    const local = context.timeZone === "local", moment = context.column.kind === "datetime";
    const input = editInput(context, withDate && withTime ? "datetime-local" : withDate ? "date" : "time");
    const parts = moment ? editMoment(context.value, local) : null;
    const start = !moment ? typeof context.value === "string" ? context.value : "" : !parts ? "" :
      withDate && withTime ? parts.date + "T" + parts.time : withDate ? parts.date : parts.time;
    input.value = start;
    return { element: input,
      error: () => input.validity?.badInput ? fill(context.labels.gridEditDate, { column: context.column.title }) : null,
      getValue() {
        if (input.value === start) return context.value ?? null;
        if (!input.value) return null;
        if (!moment) return input.value;
        const [date, time] = withDate && withTime ? input.value.split("T") : withDate ? [input.value, parts ? parts.time : "00:00"] :
          [(parts || editMoment(new Date().toISOString(), local)).date, input.value];
        return editFromParts(date, time, local);
      } };
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
      let plain;
      try { plain = new Intl.NumberFormat(context.locale || undefined, { useGrouping: false, maximumFractionDigits: 20 }); }
      catch (error) { plain = new Intl.NumberFormat(undefined, { useGrouping: false, maximumFractionDigits: 20 }); }
      input.inputMode = "decimal";
      input.value = context.initial ?? (typeof context.value === "number" ? plain.format(context.value) : "");
      const read = () => input.value.trim() === "" ? null : editParseNumber(input.value, context.locale);
      input.addEventListener("keydown", event => {
        if (event.key !== "ArrowUp" && event.key !== "ArrowDown" || event.altKey) return;
        const value = read(), decimals = (String(step).split(".")[1] || "").length;
        if (!Number.isNaN(value)) {
          let next = (value ?? 0) + (event.key === "ArrowUp" ? step : -step);
          if (typeof rules.min === "number") next = Math.max(rules.min, next);
          if (typeof rules.max === "number") next = Math.min(rules.max, next);
          input.value = plain.format(Number(next.toFixed(decimals)));
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
      options.forEach((option, index) => select.appendChild(new Option(option.label, String(index))));
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
