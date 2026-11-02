  // ---------- calendar shared screens: the settings (docs/calendar.md#shared-screens) ----------
  // A week on a wall tablet, a dashboard section or a phone: faces (an avatar, initials or an icon) for sources and resources,
  // copies of one event across sources merged into one, finished events faded, notes in day headers, day counts that follow
  // the calendar's own width and a Reset button. The core calendar accepts these keys and loads this part for them; this part
  // checks them and keeps the results on the settings. Every hook below does nothing for a calendar that leaves them out.
  const CAL_SCREEN_LABELS = { calendarReset: "Reset", calendarSharedBy: "Shared by {names}" };
  const CAL_IMAGE = /^data:image\/(?:png|jpeg|gif|webp|svg\+xml);base64,[A-Za-z0-9+/]+=*$/;

  /** A face { avatar, initials, icon }, or null for an item without one. */
  function calFace(item, name) {
    const { avatar, initials, icon } = item;
    if (avatar === undefined && initials === undefined && icon === undefined) return null;
    const short = (text, most) => typeof text === "string" && !!text.trim() && [...text.trim()].length <= most;
    if (avatar !== undefined && !(typeof avatar === "string" && (avatar.length <= 100000 && CAL_IMAGE.test(avatar) || calSameOrigin(avatar))) ||
        initials !== undefined && !short(initials, 3) || icon !== undefined && !short(icon, 4))
      calInvalid(name + " has an avatar (a same-origin address or a base64 data:image URL), initials (1 to 3 characters) or an icon (1 to 4 characters).");
    return { avatar: avatar ?? null, initials: initials?.trim() ?? null, icon: icon?.trim() ?? null };
  }

  /** Checks the shared-screen settings and keeps them on the calendar's settings. */
  function calScreenSettings(input, settings) {
    const integer = (name, min, max) => {
      const value = input[name];
      if (value !== undefined && (!Number.isInteger(value) || value < min || value > max)) calInvalid("calendar " + name + " is an integer from " + min + " to " + max + ".");
      return value ?? null;
    };
    for (const source of settings.sources) source.face = calFace(source.face, "calendar source " + source.id);
    const faces = input.faces ?? [];
    if (!Array.isArray(faces) || faces.length > 1000) calInvalid("calendar faces are a list of at most 1000.");
    settings.faces = new Map();
    for (const item of faces) {
      if (!item || typeof item !== "object" || Array.isArray(item) || Object.keys(item).some(key => !["resource", "avatar", "initials", "icon"].includes(key)) ||
          typeof item.resource !== "string" || !item.resource || settings.faces.has(item.resource))
        calInvalid("a calendar face names a resource once and has an avatar, initials or an icon.");
      settings.faces.set(item.resource, calFace(item, "calendar face " + item.resource) || calInvalid("calendar face " + item.resource + " needs an avatar, initials or an icon."));
    }
    const merge = input.merge;
    if (merge !== undefined && typeof merge !== "boolean" && !(merge && typeof merge === "object" && !Array.isArray(merge) &&
        Object.keys(merge).every(key => key === "tone") && (merge.tone === undefined || calSafeTone(merge.tone))))
      calInvalid("calendar merge is true or { tone }.");
    settings.merge = merge ? { tone: merge.tone ?? null } : null;
    if (input.fadePast !== undefined && !(typeof input.fadePast === "number" && input.fadePast >= 0.1 && input.fadePast <= 0.9)) calInvalid("calendar fadePast is a number from 0.1 to 0.9.");
    settings.fadePast = input.fadePast ?? null;
    const notes = input.dayNotes ?? [];
    if (!Array.isArray(notes) || notes.length > 1000) calInvalid("calendar dayNotes are a list of at most 1000.");
    settings.dayNotes = new Map();
    for (const note of notes) {
      const day = typeof note?.date === "string" ? calParseDay(note.date) : NaN;
      if (!Number.isFinite(day) || Object.keys(note).some(key => !["date", "text", "tone"].includes(key)) || typeof note.text !== "string" || !note.text.trim() ||
          note.text.length > 64 || note.tone !== undefined && !calSafeTone(note.tone))
        calInvalid("a calendar day note has a date (yyyy-MM-dd), a text of 1 to 64 characters and an optional tone.");
      (settings.dayNotes.get(day) || settings.dayNotes.set(day, []).get(day)).push({ text: note.text.trim(), tone: note.tone ?? null });
    }
    settings.listDays = integer("listDays", 2, 14); settings.dayWidth = integer("dayWidth", 60, 400); settings.listBelow = integer("listBelow", 2, 7);
    if (input.reset !== undefined && typeof input.reset !== "boolean") calInvalid("calendar reset is a boolean.");
    settings.reset = input.reset === true;
  }

  // The part starts with the calendar: the fitted day count, the fade strength, the Reset button and a minute timer that fades
  // events as they finish.
  const CAL_SCREEN_START = DataGrid.prototype.startCalendar;
  DataGrid.prototype.startCalendar = function (...args) {
    const result = CAL_SCREEN_START.apply(this, args);
    const cal = this.cal;
    if (!cal?.dayNotes || this.calScreenStarted) return result;
    this.calScreenStarted = true;
    // The part's own texts, translated like the calendar's (label packs and the view's labels).
    this.calLabels = Object.freeze({ ...this.calLabels, ...Object.fromEntries(Object.entries(CAL_SCREEN_LABELS).map(([name, text]) => [name, Object.hasOwn(this.labels, name) ? this.labels[name] : text])) });
    const signal = this.lifetime.signal;
    if (cal.fadePast) {
      this.host.style.setProperty("--cx-cal-fade", String(Math.round((1 - cal.fadePast) * 100) / 100));
      const timer = setInterval(() => this.calMarkPast(), 60000);
      signal.addEventListener("abort", () => { clearInterval(timer); this.host.style.removeProperty("--cx-cal-fade"); }, { once: true });
    }
    this.calHomeSources = new Set(this.calHiddenSources); this.calHomeView = this.calView;
    this.calScreenReset();
    if (cal.dayWidth || cal.listDays) this.calStartFit();
    return result;
  };
