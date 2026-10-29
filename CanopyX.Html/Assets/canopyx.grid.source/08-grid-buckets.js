  // The small definition check stays with queries; partition evaluation is in the lazy buckets part.
  const GRID_BUCKETS = {}, GRID_BUCKET_KINDS = ["day", "week", "month", "quarter", "year", "hour", "weekday", "width", "edges"];
  function gridBucketDefinition(input, column) {
    const fail = () => { throw new Error("CanopyX: invalid calendar or numeric bucket."); };
    if (!input || typeof input !== "object" || Array.isArray(input) || !GRID_BUCKET_KINDS.includes(input.kind)) fail();
    const numeric = ["width", "edges"].includes(input.kind), fields = numeric ? input.kind === "width" ? ["kind", "width", "origin"] : ["kind", "edges"] : ["kind", "timeZone", "firstWeekday"];
    if (Object.keys(input).some(key => !fields.includes(key)) || column.kind !== (numeric ? "number" : "datetime")) fail();
    if (input.kind === "width") {
      if (!Number.isFinite(input.width) || input.width <= 0 || input.origin !== undefined && !Number.isFinite(input.origin)) fail();
      return gridFreeze({ kind: input.kind, width: input.width, origin: input.origin ?? 0 });
    }
    if (input.kind === "edges") {
      if (!Array.isArray(input.edges) || !input.edges.length || input.edges.length > 200 || input.edges.some((edge, index) => !Number.isFinite(edge) || index && edge <= input.edges[index - 1])) fail();
      return gridFreeze({ kind: input.kind, edges: [...input.edges] });
    }
    const timeZone = input.timeZone ?? "UTC", firstWeekday = input.firstWeekday ?? 1;
    if (typeof timeZone !== "string" || !timeZone.length || timeZone.length > 128 || !Number.isInteger(firstWeekday) || firstWeekday < 0 || firstWeekday > 6) fail();
    try { new Intl.DateTimeFormat("en", { timeZone }); } catch (_) { fail(); }
    return gridFreeze({ kind: input.kind, timeZone, firstWeekday });
  }
