  // ---------- changes: the change list and propagation documents ----------
  const CHANGE_KINDS = ["added", "removed", "modified", "renamed"], CHANGE_ICONS = ["none", "copy", "diff", "check", "open", "download", "compare", "flag"];
  const PROPAGATION_STATES = ["converged", "propagating", "fault", "unknown"];
  function changeVersion(value, what) {
    if (value === undefined) return null;
    const version = changeKeys(value, ["size", "hash", "time"], what);
    if (version.size !== undefined && (!Number.isSafeInteger(version.size) || version.size < 0)) changeFail(what + " has a size outside 0 to 2^53 - 1");
    const hash = changeLine(version.hash, what + " hash", 256);
    if (hash !== null && !/\S/.test(hash)) changeFail(what + " has an empty hash");
    return Object.freeze({ size: version.size ?? null, hash, time: changeTime(version.time, what + " time") });
  }
  function changeAction(entry, ids) {
    const action = changeKeys(entry, ["id", "label", "icon", "copy", "link", "reveal", "reason"], "an action"), id = changeId(action.id, "an action id", 64);
    if (ids.has(id)) changeFail("the action '" + id + "' is declared twice");
    ids.add(id);
    for (const key of ["copy", "link"]) if (action[key] !== undefined && (typeof action[key] !== "string" || !action[key].length || action[key].length > 64)) changeFail("the action '" + id + "' " + key + "s a value key of 1 to 64 characters");
    const reveal = changeEnum(action.reveal, ["none", "details", "diff"], "an action reveal", "none"), reason = changeFlag(action.reason, "reason");
    const kinds = (action.copy !== undefined) + (action.link !== undefined) + (reveal !== "none");
    if (kinds > 1 || reason && kinds) changeFail("the action '" + id + "' copies, opens a link, reveals or asks for a reason: one of them");
    return Object.freeze({ id, label: changeText(action.label, "the label of action '" + id + "'", 64), icon: changeEnum(action.icon, CHANGE_ICONS, "an action icon", "none"), copy: action.copy ?? null,
      link: action.link ?? null, reveal, reason });
  }
  function changeValues(input, what) {
    const values = Object.create(null);
    if (input === undefined) return Object.freeze(values);
    if (!changeObject(input) || Object.keys(input).length > 16) changeFail(what + " has at most 16 values");
    for (const [key, value] of Object.entries(input)) { if (!key.length || key.length > 64 || typeof value !== "string" || value.length > 4096) changeFail(what + " has an invalid value"); values[key] = value; }
    return Object.freeze(values);
  }
  /** An item's diff, with its labels checked when the list loads rather than when the item first opens. */
  function changeDiffChecked(diff) { changeLabels(diff.labels); return diff; }
  function changesDocument(input) {
    const doc = changeEnvelope(input, "changes", ["id", "label", "actions", "toolbar", "values", "exports", "items", "groupByFolder", "flaggedOnly", "expandFlagged", "hashLength", "pageSize", "timeZone", "labels"]);
    changeLabels(doc.labels);
    const actionIds = new Set(), actions = changeList(doc.actions, "actions", 8).map(entry => changeAction(entry, actionIds));
    const barIds = new Set(actionIds), listValues = changeValues(doc.values, "the change list"), toolbar = changeList(doc.toolbar, "toolbar", 8).map(entry => {
      const action = changeAction(entry, barIds), key = action.copy ?? action.link;
      if (action.reveal !== "none") changeFail("the bar action '" + action.id + "' has no item to reveal");
      if (key !== null && !Object.hasOwn(listValues, key)) changeFail("the bar action '" + action.id + "' uses the list value '" + key + "', which the list does not have");
      return action;
    });
    const exports = changeList(doc.exports, "exports", 2);
    if (exports.some(name => name !== "csv" && name !== "json") || new Set(exports).size !== exports.length) changeFail("exports are csv and json, each once");
    const ids = new Set(), items = changeList(doc.items, "items", 10000).map((entry, index) => {
      const item = changeKeys(entry, ["id", "kind", "path", "previousPath", "kindLabel", "secondary", "before", "after", "facts", "flags", "diff", "actions", "values"], "an item");
      const id = changeId(item.id, "an item id"), what = "the item '" + id + "'";
      if (ids.has(id)) changeFail(what + " appears twice");
      ids.add(id);
      const kind = changeEnum(item.kind, CHANGE_KINDS, what + " kind"), path = changeLine(item.path, what + " path", 2048), previousPath = changeLine(item.previousPath, what + " previous path", 2048);
      if (kind === undefined || path === null || !/\S/.test(path)) changeFail(what + " needs a kind and a path");
      if (kind === "renamed" && previousPath === null || (kind === "added" || kind === "removed") && previousPath !== null) changeFail(what + " has a previous path only when it is renamed or modified, and always when renamed");
      const facts = changeList(item.facts, what + " facts", 32).map(value => {
        const fact = changeKeys(value, ["label", "before", "after", "tone", "note"], "a fact");
        if (fact.before === undefined && fact.after === undefined) changeFail(what + " has a fact without a value");
        return Object.freeze({ label: changeText(fact.label, "a fact label", 200), before: changeText(fact.before, "a fact value", 2000, true), after: changeText(fact.after, "a fact value", 2000, true), tone: changeTone(fact.tone, "a fact"),
          note: changeText(fact.note, "a fact note", 500, true) });
      });
      const flagIds = new Set(), flags = changeList(item.flags, what + " flags", 16).map(value => {
        const flag = changeKeys(value, ["id", "label", "reason", "tone"], "a flag"), flagId = changeId(flag.id, "a flag id", 64);
        if (flagIds.has(flagId)) changeFail(what + " has the flag '" + flagId + "' twice");
        flagIds.add(flagId);
        return Object.freeze({ id: flagId, label: changeText(flag.label, "a flag label", 64), reason: changeText(flag.reason, "a flag reason", 500), tone: changeTone(flag.tone, "a flag") || "warning" });
      });
      const offered = changeList(item.actions, what + " actions", 8);
      for (const action of offered) if (!actionIds.has(action)) changeFail(what + " offers the undeclared action '" + action + "'");
      const values = changeValues(item.values, what);
      return Object.freeze({ id, index, kind, path, previousPath, kindLabel: changeText(item.kindLabel, what + " kind label", 64, true), secondary: changeText(item.secondary, what + " secondary text", 200, true),
        before: changeVersion(item.before, what + " before"), after: changeVersion(item.after, what + " after"), facts: Object.freeze(facts), flags: Object.freeze(flags),
        diff: item.diff === undefined ? null : changeDiffChecked(diffBody(item.diff, what + " diff")), actions: Object.freeze([...offered]), values });
    });
    return Object.freeze({ id: changeId(doc.id, "the change list id"), label: changeText(doc.label, "the label", 200), actions: Object.freeze(actions), toolbar: Object.freeze(toolbar),
      values: listValues, exports: Object.freeze([...exports]), items: Object.freeze(items),
      groupByFolder: doc.groupByFolder !== false && changeFlag(doc.groupByFolder ?? true, "groupByFolder"), flaggedOnly: changeFlag(doc.flaggedOnly, "flaggedOnly"), expandFlagged: changeFlag(doc.expandFlagged, "expandFlagged"),
      hashLength: changeInteger(doc.hashLength, "hashLength", 4, 64, 8), pageSize: changeInteger(doc.pageSize, "pageSize", 10, 1000, 200), local: changeEnum(doc.timeZone, ["utc", "local"], "timeZone", "utc") === "local", labels: doc.labels });
  }
  function propagationDocument(input) {
    const doc = changeEnvelope(input, "propagation", ["id", "label", "start", "asOf", "state", "summary", "title", "groupCount", "witnesses", "timeZone", "labels", "timeSlider"]);
    const start = changeTime(doc.start, "start"), asOf = changeTime(doc.asOf, "asOf");
    if (start !== null && asOf !== null && start > asOf) changeFail("a propagation view starts before its evidence time");
    const groupCount = changeText(doc.groupCount, "the group count", 200, true);
    if (groupCount !== null && !changePluralText(groupCount)) changeFail("the group count needs {count} in every form, and plural forms that end with [other]");
    const ids = new Set(), witnesses = changeList(doc.witnesses, "witnesses", 2000).map(entry => {
      const witness = changeKeys(entry, ["id", "label", "secondary", "state", "firstSeen", "lastSeen", "note", "source", "group"], "a replica"), id = changeId(witness.id, "a replica id");
      if (ids.has(id)) changeFail("the replica '" + id + "' appears twice");
      ids.add(id);
      const firstSeen = changeTime(witness.firstSeen, "firstSeen"), lastSeen = changeTime(witness.lastSeen, "lastSeen");
      if (firstSeen !== null && lastSeen !== null && firstSeen > lastSeen) changeFail("the replica '" + id + "' was first seen after it last reported");
      const state = changeEnum(witness.state, PROPAGATION_STATES, "a replica state");
      if (state === undefined) changeFail("the replica '" + id + "' needs a state");
      return Object.freeze({ id, label: changeText(witness.label, "a replica label", 200), secondary: changeText(witness.secondary, "a replica's secondary text", 200, true), state, firstSeen, lastSeen,
        note: changeText(witness.note, "a replica note", 500, true), source: changeFlag(witness.source, "source"), group: changeText(witness.group, "a replica group", 200, true) });
    });
    if (!witnesses.length) changeFail("a propagation view has 1 to 2000 replicas");
    return Object.freeze({ id: changeId(doc.id, "the propagation id"), label: changeText(doc.label, "the label", 200), start, asOf, state: changeEnum(doc.state, PROPAGATION_STATES, "state", null),
      summary: changeText(doc.summary, "the summary", 500, true), title: changeText(doc.title, "the title", 200, true), groupCount, witnesses: Object.freeze(witnesses),
      local: changeEnum(doc.timeZone, ["utc", "local"], "timeZone", "utc") === "local", labels: doc.labels });
  }
