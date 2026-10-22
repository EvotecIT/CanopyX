  // ---------- changes: sizes, times, durations, paths and icons (as CanopyChangeFormat writes them in C#) ----------
  const CHANGE_UNITS = ["B", "KB", "MB", "GB", "TB"];
  function changeSize(bytes, lang) {
    if (bytes < 1024) return numberFormat(lang, 0, 0).format(bytes) + " B";
    let value = bytes, unit = 0;
    while (value >= 1024 && unit < CHANGE_UNITS.length - 1) { value /= 1024; unit++; }
    return numberFormat(lang, 0, 1).format(value) + " " + CHANGE_UNITS[unit];
  }
  const changePad = value => (value < 10 ? "0" : "") + value;
  /** A time as yyyy-MM-dd HH:mm: in UTC with the label's mark, or in the reader's own time zone. */
  function changeTimeText(ms, local, labels) {
    const d = new Date(ms), get = local ? ["getFullYear", "getMonth", "getDate", "getHours", "getMinutes"] : ["getUTCFullYear", "getUTCMonth", "getUTCDate", "getUTCHours", "getUTCMinutes"];
    const [year, month, day, hours, minutes] = get.map(name => d[name]());
    const text = String(year).padStart(4, "0") + "-" + changePad(month + 1) + "-" + changePad(day) + " " + changePad(hours) + ":" + changePad(minutes);
    return local ? text : fill(labels.changeUtcTime, { time: text });
  }
  /** A duration in the largest two units that matter, as CanopyChangeFormat.Duration writes it. */
  function changeDuration(ms, labels, format) {
    const seconds = Math.max(0, Math.floor(ms / 1000)), unit = (template, count) => fill(template, { count: format.format(count) });
    if (seconds < 60) return unit(labels.changeSeconds, seconds);
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return unit(labels.changeMinutes, minutes);
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return unit(labels.changeHours, hours) + (minutes % 60 ? " " + unit(labels.changeMinutes, minutes % 60) : "");
    return unit(labels.changeDays, Math.floor(hours / 24)) + (hours % 24 ? " " + unit(labels.changeHours, hours % 24) : "");
  }
  /** A path's folder (everything before its last / or \) and its name. */
  function changePath(path) {
    const at = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
    return at < 0 ? ["", path] : [path.slice(0, at), path.slice(at + 1)];
  }
  const CHANGE_TONES = { added: "success", removed: "danger", modified: "info", renamed: "neutral" };
  const PROPAGATION_LOOK = { converged: ["check", "success"], propagating: ["clock", "warning"], fault: ["cross", "danger"], unknown: ["question", "muted"] };
  const CHANGE_ICONS_SVG = {
    copy: '<rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    diff: '<path d="M4 5h7M4 9h5M4 13h7M4 17h4M13 5h7M15 9h5M13 13h7M16 17h4"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    open: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19h14"/>',
    compare: '<path d="M7 7h12M15 3l4 4-4 4M17 17H5M9 13l-4 4 4 4"/>',
    flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
    cross: '<path d="M7 7l10 10M17 7 7 17"/>', clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4.5l3 2"/>',
    question: '<path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6"/><circle cx="12" cy="17" r=".6"/>',
    chevron: '<path d="m9 6 6 6-6 6"/>', up: '<path d="M12 19V5M6 11l6-6 6 6"/>', down: '<path d="M12 5v14M6 13l6 6 6-6"/>'
  };
  /** Esc hides the tooltip of the focused or hovered icon button until the pointer or focus leaves it (WCAG 1.4.13). */
  function changeTips(root, signal) {
    root.addEventListener("keydown", event => { if (event.key === "Escape") event.target.closest?.("[data-cx-tip]")?.setAttribute("data-cx-tip-off", ""); }, { signal });
    for (const type of ["focusout", "pointerout"]) root.addEventListener(type, event => event.target.closest?.("[data-cx-tip]")?.removeAttribute("data-cx-tip-off"), { signal });
  }
  function changeIcon(name) { const icon = svgIcon(CHANGE_ICONS_SVG[name] || CHANGE_ICONS_SVG.check); icon.classList.add("cx-chg-ico"); return icon; }
