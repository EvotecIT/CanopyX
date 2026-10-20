  // ---------- flow: reading what host-connected flows add (docs/flow.md) ----------
  // Host options and dependent fields, dynamic sections, server checks, record pickers, records fields, task lists, dialog
  // and drawer layouts, the equivalent command, presets, drafts, deep links, an endpoint, and the review page's typed
  // confirmation and acknowledgement. Read with the same strictness as the rest of the document.
  const FLOW_RECORD_TYPES = ["text", "number", "date", "time", "select", "toggle"];
  const FLOW_COMMAND_STYLES = ["powershell", "posix", "windows"];
  // The routes MapCanopyFlow (CanopyX.AspNetCore) serves below an endpoint, each answering one hook (69-flow-endpoint.js).
  const FLOW_ROUTES = ["options", "fields", "check", "validate", "preview", "status", "draft", "submit"];

  /** Option objects (or bare values) of a field or a records column. */
  function flowOptions(raw, bad) {
    if (raw.length > 1000) bad("needs at most 1000 options");
    const options = raw.map(option => {
      flowKeys(flowIs(option) ? option : { value: option }, ["value", "label", "description", "badge", "disabledReason", "group"], "An option");
      const item = flowIs(option) ? option : { value: option };
      if (!flowScalar(item.value)) bad("has an invalid option value");
      return Object.freeze({ value: item.value, label: flowString(item.label, 200, "An option label") ?? String(item.value), description: flowString(item.description, 1000, "An option description"),
        badge: flowString(item.badge, 40, "An option badge"), disabledReason: flowString(item.disabledReason, 400, "A disabled reason"), group: flowString(item.group, 200, "An option group") });
    });
    if (new Set(options.map(option => option.value)).size !== options.length) bad("needs options with distinct values");
    return options;
  }

  /** The columns of a records field: a typed cell each, with the forms part's checks. */
  function flowRecordColumns(raw, bad) {
    if (!Array.isArray(raw) || !raw.length || raw.length > 16) bad("needs 1 to 16 columns");
    const ids = new Set();
    return raw.map(column => {
      flowKeys(column, ["id", "title", "type", "required", "options", "validation", "width"], "A records column");
      const id = flowName(column.id, "A column id"), type = column.type ?? "text", rules = column.validation ?? {};
      if (ids.has(id)) bad("has two columns named " + id);
      ids.add(id);
      if (!FLOW_RECORD_TYPES.includes(type)) bad("has a column of an unknown type");
      flowKeys(rules, ["min", "max", "minLength", "maxLength", "pattern", "message"], "The validation of column " + id);
      if ((rules.min !== undefined || rules.max !== undefined) && type !== "number" || [rules.minLength, rules.maxLength, rules.pattern].some(value => value !== undefined) && type !== "text") bad("has checks its column type does not take");
      if ((column.options !== undefined) !== (type === "select") || type === "select" && !(Array.isArray(column.options) && column.options.length)) bad("needs options as a select column only");
      if (column.width !== undefined && (!Number.isInteger(column.width) || column.width < 60 || column.width > 480)) bad("needs a column width of 60 to 480 pixels");
      const required = flowFlag(column.required, "required"), shared = formRuleSpec({}, { required, min: rules.min, max: rules.max, minLength: rules.minLength, maxLength: rules.maxLength,
        pattern: rules.pattern, message: rules.message }, bad);
      return Object.freeze({ id, title: flowString(column.title, 200, "A column title", true), type, required, width: column.width ?? null,
        options: type === "select" ? flowOptions(column.options, bad) : [], spec: Object.freeze({ id, pattern: shared.pattern, rules: shared.rules }) });
    });
  }

  /** Whether one cell value fits its records column. */
  function flowCellFits(column, value) {
    if (value === null) return true;
    switch (column.type) {
      case "number": return Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER;
      case "toggle": return typeof value === "boolean";
      case "date": return flowFits({ type: "date" }, value);
      case "time": return flowFits({ type: "time" }, value);
      case "select": return column.options.some(option => option.value === value);
      default: return typeof value === "string" && value.length <= 4096;
    }
  }
  function flowRecordsFit(field, value) {
    return Array.isArray(value) && value.length <= 1000 && value.every(row => flowIs(row) &&
      Object.keys(row).every(key => field.columns.some(column => column.id === key)) && field.columns.every(column => flowCellFits(column, row[column.id] ?? null)));
  }

  /** The layout: a stepper's orientation, and the container a flow opens in (inline, a dialog or a drawer). */
  function flowLayout(raw, model) {
    if (raw !== undefined) flowKeys(raw, ["orientation", "container", "launch"], "The flow layout");
    model.orientation = raw?.orientation ?? "auto";
    model.container = raw?.container ?? "inline";
    if (!["auto", "horizontal", "vertical"].includes(model.orientation)) flowFail("the flow layout has an unknown orientation");
    if (!["inline", "dialog", "drawer"].includes(model.container)) flowFail("the flow layout has an unknown container");
    if (raw?.launch !== undefined && model.container === "inline") flowFail("only a dialog or drawer flow has a launch button");
    model.launch = flowString(raw?.launch, 80, "The launch label");
  }

  /** A section whose fields the host supplies (source "host"), reloaded when the fields it depends on change. */
  function flowDynamicSection(section, raw) {
    if (raw.source !== undefined && raw.source !== "host") flowFail("section " + section.id + " has an unknown source");
    if (section.host ? raw.fields !== undefined && (!Array.isArray(raw.fields) || raw.fields.length) : !Array.isArray(raw.fields)) flowFail("section " + section.id + " needs an array of fields, or source \"host\" and none");
    if (raw.dependsOn !== undefined && (!section.host || !Array.isArray(raw.dependsOn) || !raw.dependsOn.length || raw.dependsOn.length > 16 || raw.dependsOn.some(name => typeof name !== "string")))
      flowFail("section " + section.id + " depends on 1 to 16 fields, as a host section only");
    section.dependsOn = raw.dependsOn ? [...new Set(raw.dependsOn)] : [];
  }

  /** A pick step: a grid or tree view whose selection is the answer of the step's one field (57-flow-pick.js). */
  function flowPickStep(raw, step, model) {
    flowKeys(raw, ["field", "view", "label", "tray", "height"], "The pick of step " + step.id);
    if (!flowIs(raw.view) || raw.view.protocol !== "canopyx/2" || !["grid", "view"].includes(raw.view.type)) flowFail("the pick of step " + step.id + " needs a grid or tree view document");
    if (raw.tray !== undefined && typeof raw.tray !== "boolean") flowFail("the tray of step " + step.id + " is true or false");
    flowKeys(raw.field, ["id", "label", "help", "required", "when", "parameter", "path", "sensitive", "validation", "default"], "The field of pick step " + step.id);
    const field = flowField(Object.assign({}, raw.field, { type: "pick" }), step, null, model), columns = Array.isArray(raw.view.columns) ? raw.view.columns : [];
    const label = raw.label ?? (columns[0] && columns[0].id);
    if (typeof label !== "string" || !columns.some(column => column && column.id === label)) flowFail("the pick of step " + step.id + " needs a label column the view declares");
    if (raw.height !== undefined && (!Number.isInteger(raw.height) || raw.height < 160 || raw.height > 1200)) flowFail("the pick of step " + step.id + " needs a height of 160 to 1200 pixels");
    step.pick = Object.freeze({ view: raw.view, kind: raw.view.type === "grid" ? "grid" : "tree", label, tray: raw.tray !== false, height: raw.height ?? 420, field });
    step.blocks.push({ section: null, fields: [field] });
  }

  /** The review page's typed confirmation and conditional acknowledgement. */
  function flowReviewExtras(raw, step) {
    if (raw.confirm !== undefined) {
      flowKeys(raw.confirm, ["label", "text", "field"], "The confirmation");
      if ((raw.confirm.text === undefined) === (raw.confirm.field === undefined)) flowFail("a confirmation names the text to type or the field that holds it");
      step.confirm = { label: flowString(raw.confirm.label, 200, "The confirmation label", true), text: flowString(raw.confirm.text, 200, "The confirmation text"), field: raw.confirm.field };
    }
    if (raw.acknowledge !== undefined) {
      flowKeys(raw.acknowledge, ["label", "when"], "The acknowledgement");
      step.acknowledge = { label: flowString(raw.acknowledge.label, 400, "The acknowledgement label", true), raw: raw.acknowledge.when };
    }
  }

  /** A step's server checks: named host actions that test some of its answers. */
  function flowChecks(raw, step, model) {
    if (raw === undefined) return;
    if (step.type !== "form" || !Array.isArray(raw) || !raw.length || raw.length > 8) flowFail("step " + step.id + " has 1 to 8 checks, as a form step only");
    for (const entry of raw) {
      flowKeys(entry, ["id", "label", "description", "fields", "required"], "A check");
      const id = flowName(entry.id, "A check id");
      if (model.checks.has(id)) flowFail("the check id '" + id + "' is used twice");
      if (!Array.isArray(entry.fields) || !entry.fields.length || entry.fields.length > 64 || entry.fields.some(name => typeof name !== "string")) flowFail("check " + id + " needs 1 to 64 field ids");
      if (entry.required !== undefined && !["pass", "run"].includes(entry.required)) flowFail("check " + id + " requires pass or run");
      const check = Object.freeze({ id, step, label: flowString(entry.label, 200, "A check label", true), description: flowString(entry.description, 1000, "A check description"),
        fields: Object.freeze([...new Set(entry.fields)]), required: entry.required ?? null });
      model.checks.set(id, check); step.checks.push(check);
    }
  }

  /** What depends on what: dependsOn names fields that exist, never secrets, never in a circle; checks name their fields. */
  function flowLinks(model) {
    const known = (id, what) => { const field = model.fields.get(id); if (!field) flowFail(what + " names the unknown field '" + id + "'"); return field; };
    for (const field of model.fields.values()) for (const id of field.dependsOn) {
      if (id === field.id || known(id, "field " + field.id).type === "secret") flowFail("field " + field.id + " cannot depend on itself or on a secret");
    }
    const state = new Map(), visit = field => {
      if (state.get(field.id) === 2) return;
      if (state.get(field.id) === 1) flowFail("field " + field.id + " depends on itself through dependsOn");
      state.set(field.id, 1); field.dependsOn.forEach(id => visit(model.fields.get(id))); state.set(field.id, 2);
    };
    model.fields.forEach(visit);
    for (const step of model.steps) for (const block of step.blocks) if (block.section?.host) for (const id of block.section.dependsOn) if (known(id, "section " + block.section.id).type === "secret") flowFail("section " + block.section.id + " cannot depend on a secret");
    for (const check of model.checks.values()) for (const id of check.fields) known(id, "check " + check.id);
    const review = model.steps.at(-1);
    if (review.type === "review") {
      if (review.acknowledge?.raw !== undefined) review.acknowledge.when = flowCondition(review.acknowledge.raw, model, { groups: 0, filters: 0 });
      if (review.confirm?.field !== undefined && !["text", "select", "choice", "lookup"].includes(known(review.confirm.field, "the confirmation").type)) flowFail("the confirmation reads a text or choice field");
    }
  }

  /** The flow-wide host settings: the equivalent command, presets, drafts, deep links and an endpoint. */
  function flowHostDocument(doc, model) {
    if (doc.command !== undefined) {
      flowKeys(doc.command, ["name", "style", "variants"], "The command");
      const name = flowString(doc.command.name, 200, "The command name", true), style = doc.command.style ?? "powershell";
      if (!FLOW_COMMAND_STYLES.includes(style) || /[\u0000-\u001f]/.test(name)) flowFail("the command has an unknown style or a control character");
      const variants = doc.command.variants ?? [];
      if (!Array.isArray(variants) || variants.length > 8) flowFail("a command has at most 8 variants");
      const ids = new Set(["command", "patch"]);
      model.command = { name, style, variants: variants.map(variant => {
        flowKeys(variant, ["id", "label"], "A command variant");
        const id = flowName(variant.id, "A variant id");
        if (ids.has(id)) flowFail("the command variant '" + id + "' is used twice");
        ids.add(id);
        return Object.freeze({ id, label: flowString(variant.label, 60, "A variant label", true) });
      }) };
    }
    const presets = doc.presets ?? [];
    if (!Array.isArray(presets) || presets.length > 32) flowFail("a flow has at most 32 presets");
    model.presets = presets.map(raw => flowPreset(raw, model));
    if (new Set(model.presets.map(preset => preset.id)).size !== model.presets.length) flowFail("two presets share an id");
    model.draft = doc.draft ?? "none";
    if (!["none", "session", "local", "host"].includes(model.draft)) flowFail("the flow's draft store is unknown");
    model.deepLinks = flowFlag(doc.deepLinks, "deepLinks");
    model.endpoint = null;
    if (doc.endpoint !== undefined) {
      flowKeys(doc.endpoint, ["url", "routes"], "The endpoint");
      const url = doc.endpoint.url, routes = doc.endpoint.routes;
      if (typeof url !== "string" || url.length > 512 || !/^\/(?!\/)[\w\-./~%]*$/.test(url)) flowFail("the endpoint is a path on the page's own origin");
      if (!Array.isArray(routes) || !routes.length || routes.some(route => !FLOW_ROUTES.includes(route)) || new Set(routes).size !== routes.length) flowFail("the endpoint lists some of its routes: " + FLOW_ROUTES.join(", "));
      model.endpoint = Object.freeze({ url: url.replace(/\/+$/, ""), routes: Object.freeze(routes.slice()) });
    }
  }

  /** A preset: named starting answers. Never secrets; only fields that exist, with values that fit them. */
  function flowPreset(raw, model) {
    flowKeys(raw, ["id", "label", "description", "values"], "A preset");
    const preset = { id: flowName(raw.id, "A preset id"), label: flowString(raw.label, 200, "A preset label", true), description: flowString(raw.description, 1000, "A preset description"), values: {} };
    if (!flowIs(raw.values)) flowFail("preset " + preset.id + " needs an object of values");
    for (const [id, value] of Object.entries(raw.values)) {
      const field = model.fields.get(id);
      if (!field || field.type === "secret" || !flowFits(field, value)) flowFail("preset " + preset.id + " has no value for '" + id + "' that fits a field");
      preset.values[id] = value;
    }
    return Object.freeze(preset);
  }
