  // Calendar keys use Gregorian ordinals, not elapsed local milliseconds, so DST never changes a day's identity.
  const bucketClocks = new Map();
  function bucketClock(zone) {
    let clock = bucketClocks.get(zone);
    if (!clock) {
      clock = new Intl.DateTimeFormat("en-US-u-ca-gregory-nu-latn", { timeZone: zone, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", hourCycle: "h23" });
      if (bucketClocks.size >= 64) bucketClocks.delete(bucketClocks.keys().next().value);
      bucketClocks.set(zone, clock);
    }
    return clock;
  }
  function bucketDate(year, month, day) {
    const date = new Date(0); date.setUTCFullYear(year, month - 1, day); date.setUTCHours(0, 0, 0, 0); return date;
  }
  function bucketKey(spec, raw) {
    if (raw === null || raw === undefined) return null;
    if (spec.kind === "width" || spec.kind === "edges") {
      if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
      if (spec.kind === "width") {
        const key = Math.floor((raw - (spec.origin ?? 0)) / spec.width);
        if (!Number.isSafeInteger(key)) throw new Error("CanopyX: the bucket index exceeds the safe integer range.");
        return key;
      }
      let index = 0; while (index < spec.edges.length && raw >= spec.edges[index]) index++; return index;
    }
    const instant = new Date(raw);
    if (!Number.isFinite(instant.getTime())) return null;
    const parts = Object.fromEntries(bucketClock(spec.timeZone || "UTC").formatToParts(instant).filter(part => part.type !== "literal").map(part => [part.type, Number(part.value)]));
    const ordinal = bucketDate(parts.year, parts.month, parts.day).getTime() / 86400000 + 719162, first = spec.firstWeekday ?? 1;
    switch (spec.kind) {
      case "day": return ordinal;
      case "week": return Math.floor((ordinal - (first + 6) % 7) / 7);
      case "month": return (parts.year - 1) * 12 + parts.month - 1;
      case "quarter": return (parts.year - 1) * 4 + Math.floor((parts.month - 1) / 3);
      case "year": return parts.year;
      case "hour": return parts.hour;
      case "weekday": return (ordinal + 8 - first) % 7;
      default: throw new Error("CanopyX: unknown bucket kind.");
    }
  }
  function bucketLabel(spec, key, language) {
    const number = new Intl.NumberFormat(language, { maximumFractionDigits: 15 }), first = spec.firstWeekday ?? 1;
    if (spec.kind === "width") return "[" + number.format((spec.origin ?? 0) + key * spec.width) + ", " + number.format((spec.origin ?? 0) + (key + 1) * spec.width) + ")";
    if (spec.kind === "edges") return key === 0 ? "< " + number.format(spec.edges[0]) : key === spec.edges.length ? "≥ " + number.format(spec.edges[key - 1]) : "[" + number.format(spec.edges[key - 1]) + ", " + number.format(spec.edges[key]) + ")";
    if (spec.kind === "hour") return String(key).padStart(2, "0") + ":00";
    if (spec.kind === "weekday") return new Intl.DateTimeFormat(language, { weekday: "long", timeZone: "UTC" }).format(bucketDate(2026, 1, 4 + (key + first) % 7));
    if (spec.kind === "year") return String(key);
    if (spec.kind === "month") return String(Math.floor(key / 12) + 1).padStart(4, "0") + "-" + String(key % 12 + 1).padStart(2, "0");
    if (spec.kind === "quarter") return (Math.floor(key / 4) + 1) + " Q" + (key % 4 + 1);
    const ordinal = spec.kind === "week" ? key * 7 + (first + 6) % 7 : key;
    const date = new Date((ordinal - 719162) * 86400000);
    if (spec.kind === "day") return date.toISOString().slice(0, 10);
    const middle = new Date(date.getTime() + 3 * 86400000), year = middle.getUTCFullYear(), january = bucketDate(year, 1, 4);
    const weekStart = january.getTime() - (january.getUTCDay() - first + 7) % 7 * 86400000;
    const week = Math.floor((date.getTime() - weekStart) / (7 * 86400000)) + 1;
    return String(year).padStart(4, "0") + "-W" + String(week).padStart(2, "0");
  }
  Object.assign(GRID_BUCKETS, { key: bucketKey, label: bucketLabel });
