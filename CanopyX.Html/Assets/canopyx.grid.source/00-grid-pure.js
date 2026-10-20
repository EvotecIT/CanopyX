  // ---------- pure helpers: moments from wall-time parts and deep freezing ----------
  // Flows share these through their entry point (Build/Sync-Assets.ps1), without the grid around them.
  // Native editor and clipboard wall times must retain every requested component, including across local DST gaps.
  // Setters preserve years 0–99; the multi-argument Date constructor would silently add 1900 to them.
  function gridMomentFromParts(year, month, day, hours, minutes, seconds, local) {
    const parts = [year, month, day, hours, minutes, seconds];
    if (!parts.every(Number.isInteger)) return null;
    const moment = new Date(0), zone = local ? "" : "UTC";
    moment["set" + zone + "FullYear"](year, month - 1, day);
    moment["set" + zone + "Hours"](hours, minutes, seconds, 0);
    const actual = ["FullYear", "Month", "Date", "Hours", "Minutes", "Seconds"].map(name => moment["get" + zone + name]());
    actual[1]++;
    return parts.every((value, index) => value === actual[index]) ? moment : null;
  }
  // Native datetime-local inputs carry a wall time, with optional seconds and millisecond precision.
  // Validate its components before adding the fraction, so DST gaps and calendar rollover cannot move a condition.
  function gridDateInputMoment(text, local) {
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(text);
    if (!match) return null;
    const moment = gridMomentFromParts(Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6] || 0), local);
    if (moment) moment.setTime(moment.getTime() + Number((match[7] || "").padEnd(3, "0")));
    return moment;
  }
  function gridFreeze(value) {
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
      Object.values(value).forEach(gridFreeze); Object.freeze(value);
    }
    return value;
  }
