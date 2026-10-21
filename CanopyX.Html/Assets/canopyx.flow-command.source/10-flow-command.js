  // ---------- the flow-command part: the equivalent command (command, docs/flow.md#the-equivalent-command) ----------
  // The answers as a command line, by the fields' parameter names, with ConsoleMonster's rules (CommandLine.cs) and C#'s
  // CanopyFlowCommandLine, which the shared fixture tests/fixtures/flow-commands.json keeps in step: hidden, empty and
  // unchanged answers are left out (the default in create mode, the edited value in edit mode), a switch that was on and is
  // now off becomes -Name:$false or --no-name, lists join with commas, values are quoted for the style, and a secret that
  // was typed is <secret>, never its value. Records answers have no command-line form and are left out.
  const FLOW_PART_LABELS = {
    flowCommandTab: "Command",
    flowPatchTab: "JSON patch",
    flowCommandTitle: "Equivalent command"
  };
  Object.assign(FLOW_LABELS, FLOW_PART_LABELS);
  const FLOW_PLAIN_CHARACTERS = { powershell: "-_./:\\=+%", posix: "-_./:=@%+,", windows: "-_./:\\=@%+," };
  const FLOW_COMMAND_STYLES = ["powershell", "posix", "windows"];

  FLOW_HOST.command = {
    /** The document's command: a name, a style and the variants the host writes. */
    read(raw) {
      flowKeys(raw, ["name", "style", "variants"], "The command");
      const name = flowString(raw.name, 200, "The command name", true), style = raw.style ?? "powershell";
      if (!FLOW_COMMAND_STYLES.includes(style) || /[\u0000-\u001f]/.test(name)) flowFail("the command has an unknown style or a control character");
      const variants = raw.variants ?? [];
      if (!Array.isArray(variants) || variants.length > 8) flowFail("a command has at most 8 variants");
      const ids = new Set(["command", "patch"]);
      return { name, style, variants: variants.map(variant => {
        flowKeys(variant, ["id", "label"], "A command variant");
        const id = flowName(variant.id, "A variant id");
        if (ids.has(id)) flowFail("the command variant '" + id + "' is used twice");
        ids.add(id);
        return Object.freeze({ id, label: flowString(variant.label, 60, "A variant label", true) });
      }) };
    },
    line: view => flowCommandLine(view),
    document(doc, model) { if (doc.command !== undefined) model.command = this.read(doc.command); },
    /** The review page's panel of the equivalent command, and the command line in the proposal. */
    review(view, section) { if (view.model.command) section.appendChild(view.commandPanel()); },
    proposal(view, proposal) { if (view.model.command) proposal.command = flowCommandLine(view); }
  };
  function flowCommandParameter(name, style) {
    const bare = name.replace(/^[-/]+/, "");
    return style === "posix" ? (name.startsWith("-") ? name : (bare.length === 1 ? "-" : "--") + bare) : style === "windows" ? "/" + bare : "-" + bare;
  }
  function flowCommandQuote(value, style) {
    const allowed = FLOW_PLAIN_CHARACTERS[style];
    let plain = value.length > 0;
    // Letters and digits of any script stay plain, one UTF-16 unit at a time, as .NET's char.IsLetterOrDigit decides.
    for (let index = 0; plain && index < value.length; index++) plain = /[\p{L}\p{Nd}]/u.test(value[index]) || allowed.includes(value[index]);
    if (plain) return value;
    // Windows doubles backslashes before quotes and the closing quote, so the next argument stays separate.
    return style === "posix" ? "'" + value.replace(/'/g, "'\\''") + "'" : style === "windows" ?
      "\"" + value.replace(/(\\*)"/g, (_, slashes) => slashes + slashes + "\\\"").replace(/(\\+)$/g, "$1$1") + "\"" : "'" + value.replace(/'/g, "''") + "'";
  }
  function flowCommandArgument(name, value, style) {
    const parameter = flowCommandParameter(name, style);
    if (value === null || value === undefined) return "";
    if (typeof value === "boolean") return value ? parameter : "";
    let text;
    if (typeof value === "string") { if (!value.length) return ""; text = flowCommandQuote(value, style); }
    else if (Array.isArray(value)) { const parts = value.filter(item => item !== null && item !== undefined).map(item => flowCommandQuote(String(item), style)); if (!parts.length) return ""; text = parts.join(","); }
    else text = flowCommandQuote(String(value), style);
    return parameter + (style === "windows" ? ":" : " ") + text;
  }

  /** The command line of the visible answers, or null without a command. */
  function flowCommandLine(view) {
    const model = view.model, command = model.command;
    if (!command) return null;
    const style = command.style, args = [];
    for (const field of model.fields.values()) {
      if (!field.parameter || !view.visible(field) || field.type === "records") continue;
      if (field.type === "secret") { if (view.secrets.has(field.id)) args.push(flowCommandParameter(field.parameter, style) + (style === "windows" ? ":" : " ") + "<secret>"); continue; }
      const value = view.values.get(field.id) ?? null, base = model.initial ? (Object.hasOwn(model.initial, field.id) ? model.initial[field.id] : null) : field.start;
      if (flowEmpty(value) || flowSameValue(flowNormal(value), flowNormal(base))) continue;
      if (value === false) { if (base === true) args.push(style === "powershell" ? flowCommandParameter(field.parameter, style) + ":$false" : flowCommandArgument("no-" + field.parameter, true, style)); continue; }
      args.push(flowCommandArgument(field.parameter, field.type === "pick" ? value.map(item => item.id) : value, style));
    }
    return [command.name, ...args.filter(Boolean)].join(" ");
  }

  Object.assign(FlowView.prototype, {
    /** The equivalent command panel of a flow with a command: the command, the host's variants and the JSON patch, each with Copy. */
    commandPanel() {
      const labels = this.labels, proposal = this.submission(), tabs = [{ id: "command", label: labels.flowCommandTab, text: () => Promise.resolve(flowCommandLine(this)) }];
      for (const variant of this.model.command.variants) {
        const format = this.hooks.commands?.[variant.id];
        if (typeof format === "function") tabs.push({ id: variant.id, label: variant.label, text: () => this.hook("commands." + variant.id, () => format(this.getValues())).then(answer => answer.failed || (typeof answer.value === "string" ? answer.value : "")) });
      }
      if (proposal.patch.length) tabs.push({ id: "patch", label: labels.flowPatchTab, text: () => Promise.resolve(JSON.stringify(proposal.patch, null, 2)) });
      const panel = h("details", "cx-flow-command"), summary = h("summary"), list = h("div", "cx-flow-tabs"), code = h("pre", "cx-flow-code"), copy = h("button", "cx-flow-btn");
      setText(summary, labels.flowCommandTitle);
      list.setAttribute("role", "tablist"); list.setAttribute("aria-label", labels.flowCommandTitle);
      code.id = this.id + "-command"; code.tabIndex = 0; code.setAttribute("role", "tabpanel");
      let current = null, ticket = 0;
      const show = async tab => {
        current = tab; const mine = ++ticket;
        for (const button of list.children) { const on = button.dataset.cxTab === tab.id; button.setAttribute("aria-selected", String(on)); button.tabIndex = on ? 0 : -1; if (on) code.setAttribute("aria-labelledby", button.id); }
        const text = await tab.text();
        if (mine === ticket) setText(code, text);
      };
      for (const tab of tabs) {
        const button = h("button", "cx-flow-tab"); button.type = "button"; button.id = this.id + "-tab-" + tab.id; button.dataset.cxTab = tab.id;
        button.setAttribute("role", "tab"); button.setAttribute("aria-controls", code.id); setText(button, tab.label);
        button.addEventListener("click", () => show(tab));
        list.appendChild(button);
      }
      // Arrow keys move between the tabs, as a tab list does.
      list.addEventListener("keydown", event => {
        const buttons = [...list.children], at = buttons.indexOf(document.activeElement), step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
        if (!step || at < 0) return;
        event.preventDefault();
        const rtl = getComputedStyle(list).direction === "rtl", next = buttons[(at + (rtl ? -step : step) + buttons.length) % buttons.length];
        next.focus(); next.click();
      });
      copy.type = "button"; setText(copy, labels.flowCopy);
      copy.addEventListener("click", () => {
        const text = code.textContent, done = () => { setText(copy, labels.flowCopied); this.announce(labels.flowCopied); setTimeout(() => setText(copy, labels.flowCopy), 1500); };
        if (!global.navigator?.clipboard) { global.getSelection?.().selectAllChildren(code); return; }
        global.navigator.clipboard.writeText(text).then(done, error => { global.getSelection?.().selectAllChildren(code); this.report(error, "copy"); });
      });
      const tools = h("div", "cx-flow-command-tools"); tools.append(list, copy);
      panel.append(summary, tools, code);
      show(tabs[0]);
      panel._cxShow = () => current && show(current);
      return panel;
    }
  });
