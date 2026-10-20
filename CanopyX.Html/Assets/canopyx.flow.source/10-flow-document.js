  // ---------- flow: reading the flow document (docs/flow.md#the-flow-document) ----------
  // The document is checked once, strictly: unknown properties, bad identifiers, values that do not fit their field and
  // conditions that name unknown fields or depend on each other in a circle are refused, as the C# writer refuses them.
  // The result is the flow's model: its steps, sections and fields, ready for the view (40-flow-view.js).
  const FLOW_NAME = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
  // A field type's value kind for the shared checks (forms part): numbers, date-and-time moments, lists, durations or text.
  const FLOW_KINDS = { text: "text", number: "number", date: "text", datetime: "datetime", time: "text", select: "text", toggle: "text", lookup: "text",
    choice: "text", multiChoice: "list", textarea: "text", list: "list", secret: "text", duration: "duration", custom: "text", records: "records", pick: "pick" };
  // Fields that choose among options; with source "host" their options come from the host's options hook.
  const FLOW_CHOOSING = ["select", "choice", "multiChoice", "lookup"];
  const FLOW_UNITS = { seconds: 1, minutes: 60, hours: 3600, days: 86400 };
  const flowFail = problem => { throw new Error("CanopyX: " + problem + "."); };
  const flowIs = value => value !== null && typeof value === "object" && !Array.isArray(value);
  const flowEmpty = value => value == null || value === "" || Array.isArray(value) && !value.length;
  const flowScalar = value => typeof value === "string" || typeof value === "boolean" || Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER;

  function flowKeys(object, allowed, what) {
    if (!flowIs(object)) flowFail(what + " must be an object");
    for (const key of Object.keys(object)) if (!allowed.includes(key)) flowFail(what + " has an unknown property '" + key + "'");
  }
  function flowString(value, max, what, required) {
    if (value === undefined && !required) return undefined;
    if (typeof value !== "string" || !/\S/.test(value) || value.length > max) flowFail(what + " needs visible text of at most " + max + " characters");
    return value;
  }
  function flowName(value, what) {
    if (typeof value !== "string" || !FLOW_NAME.test(value)) flowFail(what + " must be a letter, then up to 63 letters, digits, - or _");
    return value;
  }
  const flowFlag = (value, what) => { if (value !== undefined && typeof value !== "boolean") flowFail(what + " must be true or false"); return value === true; };

  // ISO 8601 durations in days, hours, minutes and seconds (PT15M, P1DT2H): the seconds they hold, or null.
  function flowSeconds(text) {
    const match = typeof text === "string" && /^P(?!$)(?:(\d{1,9})D)?(?:T(?!$)(?:(\d{1,9})H)?(?:(\d{1,9})M)?(?:(\d{1,9})S)?)?$/.exec(text);
    return match ? Number(match[1] || 0) * 86400 + Number(match[2] || 0) * 3600 + Number(match[3] || 0) * 60 + Number(match[4] || 0) : null;
  }
  function flowDuration(seconds) {
    if (!seconds) return "PT0S";
    const days = Math.floor(seconds / 86400), hours = Math.floor(seconds % 86400 / 3600), minutes = Math.floor(seconds % 3600 / 60), rest = seconds % 60;
    return "P" + (days ? days + "D" : "") + (hours || minutes || rest ? "T" + (hours ? hours + "H" : "") + (minutes ? minutes + "M" : "") + (rest ? rest + "S" : "") : "");
  }

  /** Whether a value fits a field: its type's shape and, for choices, one of its options. Secrets never have values. */
  function flowFits(field, value) {
    if (value === null) return field.type !== "secret";
    // Options a host loads can change: a value of theirs fits by its shape, and the loaded options decide the rest.
    const listed = item => field.host ? flowScalar(item) : field.options.some(option => option.value === item);
    switch (field.type) {
      case "number": return Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER;
      case "toggle": return typeof value === "boolean";
      case "date": return typeof value === "string" && /^\d{4}-\d\d-\d\d$/.test(value) && Number.isFinite(Date.parse(value + "T00:00:00Z")) && new Date(value + "T00:00:00Z").toISOString().startsWith(value);
      case "time": return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
      case "datetime": return typeof value === "string" && /^\d{4}-\d\d-\d\dT([01]\d|2[0-3]):[0-5]\d(:[0-5]\d(\.\d{1,7})?)?(Z|[+-](0\d|1[0-3]):[0-5]\d|[+-]14:00)$/.test(value) && flowFits({ type: "date" }, value.slice(0, 10)) && Number.isFinite(Date.parse(value.replace(/(\.\d{3})\d+/, "$1")));
      case "select": case "choice": return listed(value);
      case "lookup": return listed(value);
      case "multiChoice": return Array.isArray(value) && value.every(listed) && new Set(value).size === value.length;
      case "list": return Array.isArray(value) && value.length <= 1000 && value.every(item => typeof item === "string");
      case "duration": return flowSeconds(value) !== null;
      case "secret": return false;
      case "pick": return Array.isArray(value) && value.length <= 1000 && value.every(item => flowIs(item) && Object.keys(item).every(key => key === "id" || key === "label") &&
        typeof item.id === "string" && item.id.length > 0 && item.id.length <= 256 && typeof item.label === "string" && item.label.length <= 400) && new Set(value.map(item => item.id)).size === value.length;
      case "records": return flowRecordsFit(field, value);
      case "custom": return flowScalar(value) || Array.isArray(value) && value.length <= 1000 && value.every(flowScalar);
      default: return typeof value === "string";
    }
  }

  const FLOW_FIELD_KEYS = ["id", "type", "label", "help", "placeholder", "required", "readOnly", "default", "when", "width", "parameter", "path", "sensitive",
    "validation", "options", "display", "onText", "offText", "rows", "step", "keepWhenBlank", "reveal", "units", "editor", "source", "dependsOn", "columns"];
  const FLOW_RULE_KEYS = ["min", "max", "minLength", "maxLength", "pattern", "message", "minItems", "maxItems", "item", "itemPattern"];

  function flowField(raw, step, section, model) {
    flowKeys(raw, FLOW_FIELD_KEYS, "A flow field");
    const id = flowName(raw.id, "A field id");
    if (model.fields.has(id)) flowFail("the field id '" + id + "' is used twice");
    if (model.fields.size >= 1000) flowFail("a flow holds at most 1000 fields");
    if (!Object.hasOwn(FLOW_KINDS, raw.type) || (raw.type === "pick") !== (step.type === "pick")) flowFail("field " + id + " has an unknown type");
    const type = raw.type, rules = raw.validation === undefined ? {} : raw.validation, bad = problem => flowFail("field " + id + " " + problem);
    flowKeys(rules, FLOW_RULE_KEYS, "The validation of field " + id);
    const field = { id, type, kind: FLOW_KINDS[type], step, section, label: flowString(raw.label, 200, "Field " + id + "'s label", true),
      help: flowString(raw.help, 1000, "Field " + id + "'s help"), placeholder: flowString(raw.placeholder, 256, "Field " + id + "'s placeholder"),
      required: flowFlag(raw.required, "required"), readOnly: flowFlag(raw.readOnly, "readOnly"), sensitive: flowFlag(raw.sensitive, "sensitive"),
      width: raw.width ?? "full", parameter: raw.parameter, path: raw.path, display: raw.display, rows: raw.rows ?? 4, reveal: raw.reveal !== false,
      onText: flowString(raw.onText, 60, "onText"), offText: flowString(raw.offText, 60, "offText"), keepWhenBlank: raw.keepWhenBlank, raw };
    if (!["full", "half"].includes(field.width)) bad("has an unknown width");
    if (field.parameter !== undefined && (typeof field.parameter !== "string" || !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(field.parameter))) bad("has an invalid parameter name");
    if (field.path !== undefined && (typeof field.path !== "string" || !/^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*$/.test(field.path) || field.path.length > 256)) bad("has an invalid path");
    if (raw.keepWhenBlank !== undefined && (type !== "secret" || typeof raw.keepWhenBlank !== "boolean")) bad("can keep a blank value only as a secret");
    if (raw.reveal !== undefined && (type !== "secret" || typeof raw.reveal !== "boolean")) bad("has a reveal setting but is not a secret");
    if ((raw.onText !== undefined || raw.offText !== undefined) && type !== "toggle") bad("names on and off texts but is not a toggle");
    if (raw.rows !== undefined && (type !== "textarea" || !Number.isInteger(raw.rows) || raw.rows < 2 || raw.rows > 20)) bad("needs 2 to 20 rows, as a text area only");
    if (raw.display !== undefined && (type !== "choice" || !["cards", "list"].includes(raw.display))) bad("has an unknown display");
    if (raw.editor !== undefined ? type !== "custom" || typeof raw.editor !== "string" || !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(raw.editor) : type === "custom") bad("needs an editor name as a custom field only");
    if (raw.step !== undefined && type !== "number") bad("has a step but is not a number");
    if (raw.placeholder !== undefined && !["text", "number", "lookup", "textarea", "list"].includes(type)) bad("has a placeholder, which text, number, lookup, text area and list fields take");
    // Options: the choices of select, choice and multiple choice fields, and a lookup's fixed suggestions. With source "host"
    // the host's options hook supplies them (as the reader reaches the field, and again when a field it depends on changes).
    const choosing = FLOW_CHOOSING.includes(type);
    if (raw.source !== undefined && (raw.source !== "host" || !choosing)) bad("takes source \"host\" as a field that chooses only");
    field.host = raw.source === "host";
    if (raw.options !== undefined && !choosing) bad("has options but does not choose");
    if (choosing && !field.host && !(Array.isArray(raw.options) && raw.options.length)) bad("needs options");
    if (raw.options !== undefined && !Array.isArray(raw.options)) bad("needs a list of options");
    field.options = flowOptions(raw.options || [], bad);
    // A records field: rows of typed cells, edited as a small table (36-flow-records.js).
    if ((raw.columns !== undefined) !== (type === "records")) bad("needs columns as a records field only");
    if (type === "records") field.columns = flowRecordColumns(raw.columns, bad);
    if (raw.dependsOn !== undefined && (!Array.isArray(raw.dependsOn) || !raw.dependsOn.length || raw.dependsOn.length > 16 || raw.dependsOn.some(name => typeof name !== "string"))) bad("needs 1 to 16 field ids in dependsOn");
    field.dependsOn = raw.dependsOn ? [...new Set(raw.dependsOn)] : [];
    // The shared rule settings, then the rules only lists, multiple choices and durations know.
    const list = type === "list" || type === "multiChoice" || type === "records" || type === "pick";
    if (list && [rules.min, rules.max, rules.minLength, rules.maxLength, rules.pattern].some(value => value !== undefined)) bad("checks items, not lengths or ranges");
    if (!list && [rules.minItems, rules.maxItems].some(value => value !== undefined) || type !== "list" && (rules.item !== undefined || rules.itemPattern !== undefined)) bad("has rules only lists take");
    if ((rules.min !== undefined || rules.max !== undefined) && !["number", "datetime", "duration"].includes(type)) bad("has a range but is not a number, date and time or duration");
    if ([rules.minLength, rules.maxLength, rules.pattern].some(value => value !== undefined) && !["text", "textarea", "secret"].includes(type)) bad("has lengths or a pattern, which text, text area and secret fields take");
    if (rules.minLength > rules.maxLength) bad("needs the shorter length first");
    const count = value => value === undefined || Number.isInteger(value) && value >= 0 && value <= 1000;
    if (!count(rules.minItems) || !count(rules.maxItems) || rules.minItems > rules.maxItems) bad("needs 0 to 1000 items, the fewest first");
    if (rules.item !== undefined && !["email", "host", "ip", "cidr", "url"].includes(rules.item)) bad("has an unknown item rule");
    let itemPattern = null;
    if (rules.itemPattern !== undefined) try { itemPattern = boundedPattern(rules.itemPattern, true, true); } catch (error) { bad("has an invalid or unsafe item pattern"); }
    const range = type === "duration" ? { min: rules.min === undefined ? undefined : flowSeconds(rules.min), max: rules.max === undefined ? undefined : flowSeconds(rules.max) } : rules;
    if (type === "duration" && (range.min === null || range.max === null)) bad("needs ISO 8601 durations as its range");
    if (type === "number" && ![rules.min, rules.max].every(bound => bound === undefined || Number.isFinite(bound) && Math.abs(bound) <= Number.MAX_SAFE_INTEGER)) bad("needs numbers as its range");
    if (type === "datetime" && ![rules.min, rules.max].every(bound => bound === undefined || flowFits({ type: "datetime" }, bound))) bad("needs ISO 8601 moments as its range");
    const low = type === "datetime" && typeof range.min === "string" ? Date.parse(range.min) : range.min, high = type === "datetime" && typeof range.max === "string" ? Date.parse(range.max) : range.max;
    if (low !== undefined && high !== undefined && low > high) bad("needs the lower limit first");
    const shared = formRuleSpec({ step: raw.step, placeholder: raw.placeholder }, { required: field.required, min: range.min, max: range.max,
      minLength: rules.minLength, maxLength: rules.maxLength, pattern: rules.pattern, message: rules.message }, bad);
    field.spec = Object.freeze({ id, pattern: shared.pattern, rules: shared.rules });
    field.items = Object.freeze({ min: rules.minItems, max: rules.maxItems, rule: rules.item, pattern: itemPattern });
    // Durations: the units the reader picks from, smallest first.
    const units = raw.units ?? ["minutes", "hours", "days"];
    if (raw.units !== undefined && type !== "duration" || !Array.isArray(units) || !units.length || units.some(unit => !Object.hasOwn(FLOW_UNITS, unit)) || new Set(units).size !== units.length) bad("has invalid duration units");
    field.units = Object.keys(FLOW_UNITS).filter(unit => units.includes(unit));
    if (raw.default !== undefined && (type === "secret" || list && !Array.isArray(raw.default) || !flowFits(field, raw.default))) bad("has a default that does not fit it");
    field.start = raw.default === undefined ? (list ? [] : null) : raw.default;
    model.fields.set(id, field);
    return field;
  }

  /** Reads and checks a flow document; returns the flow's model. */
  function flowRead(doc) {
    flowKeys(doc, ["kind", "version", "id", "title", "description", "mode", "layout", "density", "timeZone", "steps", "initial", "storedSecrets", "baseline", "submit", "labels",
      "command", "presets", "draft", "deepLinks", "endpoint"], "A flow document");
    if (doc.kind !== "flow" || doc.version !== 1) flowFail("a flow document needs kind \"flow\" and version 1");
    const model = { id: flowName(doc.id, "The flow id"), title: flowString(doc.title, 200, "The flow title", true), description: flowString(doc.description, 1000, "The flow description"),
      mode: doc.mode ?? "linear", density: doc.density ?? "normal", local: doc.timeZone === "local", fields: new Map(), steps: [], sections: new Set(), checks: new Map() };
    if (!["linear", "free", "tasks"].includes(model.mode) || !["compact", "normal", "comfortable"].includes(model.density) || doc.timeZone !== undefined && !["utc", "local"].includes(doc.timeZone)) flowFail("the flow's mode, density or time zone is unknown");
    flowLayout(doc.layout, model);
    if (!Array.isArray(doc.steps) || !doc.steps.length || doc.steps.length > 64) flowFail("a flow needs 1 to 64 steps");
    for (const [index, raw] of doc.steps.entries()) {
      flowKeys(raw, ["id", "title", "description", "type", "fields", "sections", "when", "optional", "declaration", "changesOnly", "checks", "group", "pick", "confirm", "acknowledge"], "A flow step");
      const step = { id: flowName(raw.id, "A step id"), title: flowString(raw.title, 200, "A step title", raw.type !== "review"), description: flowString(raw.description, 1000, "A step description"),
        type: raw.type ?? "form", optional: flowFlag(raw.optional, "optional"), declaration: flowString(raw.declaration, 1000, "The declaration"), changesOnly: raw.changesOnly !== false,
        group: flowString(raw.group, 200, "A step group"), blocks: [], checks: [], raw };
      if (model.steps.some(other => other.id === step.id)) flowFail("the step id '" + step.id + "' is used twice");
      if (!["form", "info", "review", "pick"].includes(step.type)) flowFail("step " + step.id + " has an unknown type");
      // Form and pick steps ask for answers: they validate on Next and count towards a linear flow's progress.
      step.asks = step.type === "form" || step.type === "pick";
      if (step.type === "review" && index !== doc.steps.length - 1) flowFail("the review step must be the last step");
      if (step.type === "review" && (raw.when !== undefined || raw.optional === true || raw.group !== undefined)) flowFail("the review step takes no condition or group and is never optional");
      if (step.type !== "review" && ["declaration", "changesOnly", "confirm", "acknowledge"].some(key => raw[key] !== undefined)) flowFail("only a review step has a declaration, changesOnly, confirm or acknowledge");
      if (raw.changesOnly !== undefined && typeof raw.changesOnly !== "boolean") flowFail("changesOnly must be true or false");
      if (step.type !== "form" && (raw.fields !== undefined || raw.sections !== undefined)) flowFail("only a form step has fields and sections");
      if ((raw.pick !== undefined) !== (step.type === "pick")) flowFail("step " + step.id + " has a pick only as a pick step, and a pick step needs one");
      if (raw.fields !== undefined && !Array.isArray(raw.fields) || raw.sections !== undefined && !Array.isArray(raw.sections)) flowFail("step " + step.id + " needs arrays of fields and sections");
      if (raw.fields?.length) step.blocks.push({ section: null, fields: raw.fields.map(field => flowField(field, step, null, model)) });
      if ((raw.sections || []).length > 64) flowFail("step " + step.id + " holds at most 64 sections");
      for (const rawSection of raw.sections || []) {
        flowKeys(rawSection, ["id", "label", "description", "fields", "when", "source", "dependsOn"], "A flow section");
        const section = { id: flowName(rawSection.id, "A section id"), label: flowString(rawSection.label, 200, "A section label", true),
          description: flowString(rawSection.description, 1000, "A section description"), host: rawSection.source === "host", raw: rawSection };
        if (model.sections.has(section.id)) flowFail("the section id '" + section.id + "' is used twice");
        model.sections.add(section.id);
        flowDynamicSection(section, rawSection);
        step.blocks.push({ section, fields: (rawSection.fields || []).map(field => flowField(field, step, section, model)) });
      }
      if (step.type === "pick") flowPickStep(raw.pick, step, model);
      if (step.type === "review") flowReviewExtras(raw, step);
      flowChecks(raw.checks, step, model);
      model.steps.push(step);
    }
    // Paths name distinct settings: none repeats and none lies inside another, so the patch never writes a setting twice.
    const paths = new Set();
    for (const path of [...model.fields.values()].map(field => field.path).filter(Boolean)) { if (paths.has(path)) flowFail("the path '" + path + "' is used twice"); paths.add(path); }
    for (const path of paths) for (let at = path.indexOf("."); at > 0; at = path.indexOf(".", at + 1)) if (paths.has(path.slice(0, at))) flowFail("the path '" + path + "' lies inside '" + path.slice(0, at) + "'");
    flowConditions(model);
    flowLinks(model);
    flowEditMode(doc, model);
    flowHostDocument(doc, model);
    if (doc.submit !== undefined) flowKeys(doc.submit, ["label"], "The flow's submit");
    model.submitLabel = flowString(doc.submit?.label, 80, "The submit label");
    model.labels = doc.labels;
    return model;
  }

  // Edit mode: the values being edited, the secrets already stored and the host's revision of them.
  function flowEditMode(doc, model) {
    if (doc.initial !== undefined) {
      if (!flowIs(doc.initial)) flowFail("initial must be an object of field values");
      for (const [id, value] of Object.entries(doc.initial)) {
        const field = model.fields.get(id);
        if (!field || field.type === "secret" || !flowFits(field, value)) flowFail("initial has no value for '" + id + "' that fits a field");
      }
    }
    model.initial = doc.initial ? { ...doc.initial } : null;
    if (doc.storedSecrets !== undefined && (!Array.isArray(doc.storedSecrets) || doc.storedSecrets.some(id => model.fields.get(id)?.type !== "secret") || new Set(doc.storedSecrets).size !== doc.storedSecrets.length))
      flowFail("storedSecrets lists only secret fields");
    model.stored = new Set(doc.storedSecrets || []);
    if (doc.baseline !== undefined && (typeof doc.baseline !== "string" || !doc.baseline.length || doc.baseline.length > 256)) flowFail("the baseline is 1 to 256 characters");
    model.baseline = doc.baseline ?? null;
    if (!model.initial && (model.stored.size || model.baseline !== null)) model.initial = {};
  }
