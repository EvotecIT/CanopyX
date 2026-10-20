  // ---------- forms: option lists, rule settings and the field checks ----------
  // Grid columns and flow fields describe their checks the same way (required, min, max, step, minLength, maxLength,
  // pattern, message; docs/editing.md#validation) and fail with the same translated messages. A host validator runs after
  // these checks in each caller, which knows its own value shape (a row, or a flow's answers).

  // The English texts of the messages every form shows. Grid editing and flows add their own labels to these.
  const FORM_LABELS = {
    gridEditRequired: "{column} is required.", gridEditNumber: "{column} must be a number.", gridEditDate: "{column} must be a valid date.",
    gridEditMin: "{column} must be at least {min}.", gridEditMax: "{column} must be at most {max}.", gridEditStep: "{column} must be a multiple of {step}.",
    gridEditMinLength: "{column} needs at least {min} characters.", gridEditMaxLength: "{column} allows at most {max} characters.",
    gridEditPattern: "{column} does not have the expected format.", gridEditChoice: "Choose {column} from the list.",
    gridEditNoMatches: "No matches", gridEditSearching: "Searching…", gridEditNone: "(none)"
  };

  // A select or lookup list: scalars or { value, label }, at most 1,000. bad(problem) throws the caller's error.
  function editOptions(list, id, bad = problem => { throw new Error("CanopyX: column " + id + " " + problem + "."); }) {
    if (list === undefined) return null;
    if (!Array.isArray(list) || list.length > 1000) bad("needs an array of at most 1000 editor options");
    return list.map(item => {
      const option = item !== null && typeof item === "object" ? item : { value: item };
      if (!["string", "number", "boolean"].includes(typeof option.value) || option.label !== undefined && typeof option.label !== "string")
        bad("has an invalid editor option");
      return Object.freeze({ value: option.value, label: option.label ?? String(option.value) });
    });
  }

  // An editor's limits and a validation object, checked once: { pattern, rules } with the limits a check reads. The pattern
  // must compile on its own too, so a stray parenthesis cannot escape the anchors around it.
  function formRuleSpec(raw, rules, bad) {
    const bound = value => value === undefined || Number.isFinite(value) || typeof value === "string" && !Number.isNaN(Date.parse(value));
    const count = value => value === undefined || Number.isInteger(value) && value >= 0 && value <= 1000000;
    if (raw.step !== undefined && !(Number.isFinite(raw.step) && raw.step > 0) || ![raw.min, raw.max, rules.min, rules.max].every(bound) ||
        !count(rules.minLength) || !count(rules.maxLength) || rules.required !== undefined && typeof rules.required !== "boolean" ||
        [rules.pattern, rules.message, raw.placeholder].some(text => text !== undefined && typeof text !== "string")) bad("has invalid editor or validation settings");
    let pattern = null;
    if (rules.pattern !== undefined) try { pattern = boundedPattern(rules.pattern, true, true); } catch (error) { bad("has an invalid or unsafe pattern"); }
    return { pattern, rules: Object.freeze({ required: !!rules.required, min: rules.min ?? raw.min, max: rules.max ?? raw.max, step: raw.step,
      minLength: rules.minLength, maxLength: rules.maxLength, message: rules.message }) };
  }

  // The first failed check of a value, or null: empty and required, then the type of a number or date-and-time value, its
  // range and step, and a text's length and pattern. kind is the value's kind (number, datetime or text), title the name
  // messages give the field, and shown(bound) writes a limit for a message in the reader's language and time zone.
  function formCheck(spec, value, kind, title, labels, shown) {
    const rules = spec.rules;
    const say = (name, values) => rules.message || fill(labels[name], { column: title, ...values });
    if (value == null || value === "") { if (rules.required) return say("gridEditRequired"); return null; }
    if (kind === "number" && !(typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER)) return say("gridEditNumber");
    if (kind === "datetime" && !(typeof value === "string" && /^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value)))) return say("gridEditDate");
    if (typeof value === "number" || kind === "datetime") {
      const at = kind === "datetime" ? Date.parse(value) : value, of = bound => typeof bound === "string" ? Date.parse(bound) : bound;
      if (rules.min !== undefined && at < of(rules.min)) return say("gridEditMin", { min: shown(rules.min) });
      if (rules.max !== undefined && at > of(rules.max)) return say("gridEditMax", { max: shown(rules.max) });
      const base = typeof rules.min === "number" ? rules.min : 0, steps = rules.step && (value - base) / rules.step;
      if (typeof value === "number" && rules.step && Math.abs(steps - Math.round(steps)) > 1e-9) return say("gridEditStep", { step: shown(rules.step) });
    }
    if (typeof value === "string" && kind !== "datetime") {
      if (rules.minLength !== undefined && value.length < rules.minLength) return say("gridEditMinLength", { min: rules.minLength });
      if (rules.maxLength !== undefined && value.length > rules.maxLength) return say("gridEditMaxLength", { max: rules.maxLength });
      if (spec.pattern && !spec.pattern.test(value)) return say("gridEditPattern");
    }
    return null;
  }
