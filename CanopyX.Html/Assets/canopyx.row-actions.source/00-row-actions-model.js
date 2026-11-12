  // ---------- row actions: the definition, its conditions and the actions each row offers ----------
  // rowActions is { label?, inline?, reveal?, pin?, lockedWhen?, lockedLabel?, actions }. Conditions are conditional
  // formatting's (10-format-conditions.js, which this part carries): every filter group of a grid query is one. A row
  // that matches lockedWhen shows a lock and no actions; an action shows on the rows its when matches and is disabled,
  // with its reason, on the rows its disabledWhen matches or the host's isRowActionEnabled refuses.
  const ROW_ACTION_ICONS = {
    play: '<path d="M8 5.5v13l10-6.5z"/>',
    pause: '<path d="M9 5.5v13M15 5.5v13"/>',
    stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="1.5"/>',
    retry: '<path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4"/>',
    delete: '<path d="M4.5 7h15M10 7V4.5h4V7M6.5 7l1 12.5h9l1-12.5M10 10.5v6M14 10.5v6"/>',
    copy: '<rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    open: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19h14"/>',
    lock: '<rect x="5.5" y="10.5" width="13" height="9.5" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>'
  };
  const ROW_ACTION_TONES = ["neutral", "primary", "danger"];
  // The part carries the English defaults of its labels; a view's or host's rowAction… labels replace them.
  const ROW_ACTION_TEXT = { rowActionColumn: "Actions", rowActionMore: "More actions", rowActionLocked: "Read-only", rowActionDismiss: "Dismiss",
    rowActionPending: "{action}: working", rowActionDone: "{action}: done", rowActionRejected: "{action} was not carried out.", rowActionFailed: "{action} failed: {error}" };
  function rowActionIcon(name) { return svgIcon(ROW_ACTION_ICONS[name] || ROW_ACTION_ICONS.check); }
  function rowActionText(value, max, what) {
    if (typeof value !== "string" || !value.trim() || value.length > max) formatError(what + " needs visible text of at most " + max + " characters.");
    return value;
  }
  function rowActionCondition(group, columns) {
    return group === undefined ? null : formatGroup(group, columns, { predicates: 0, groups: 0, now: () => Date.now() }, 1);
  }
  /** Validates a view's rowActions against its declared columns and compiles the conditions once. */
  function rowActionSettings(spec, columns) {
    formatKeys(spec, ["label", "inline", "reveal", "pin", "lockedWhen", "lockedLabel", "actions"], "row actions");
    if (columns.has("cx-row-actions")) formatError("the column id cx-row-actions belongs to the actions column.");
    if (!Array.isArray(spec.actions) || !spec.actions.length || spec.actions.length > 16) formatError("row actions list 1 to 16 actions.");
    if (spec.inline !== undefined && !(Number.isInteger(spec.inline) && spec.inline >= 0 && spec.inline <= 4)) formatError("row actions show 0 to 4 actions inline.");
    if (spec.reveal !== undefined && !["always", "hover"].includes(spec.reveal) || spec.pin !== undefined && !["right", "none"].includes(spec.pin))
      formatError("row actions reveal always or on hover, and pin right or none.");
    if (spec.label !== undefined) rowActionText(spec.label, 200, "the actions column");
    if (spec.lockedLabel !== undefined) rowActionText(spec.lockedLabel, 500, "a locked row");
    const ids = new Set();
    const actions = spec.actions.map(action => {
      formatKeys(action, ["id", "label", "icon", "tone", "when", "disabledWhen", "disabledReason", "refresh"], "row action");
      requireIdentifier(action.id, "row action ID");
      if (ids.has(action.id)) formatError("row action IDs are unique.");
      ids.add(action.id);
      if (action.icon !== undefined && (!Object.hasOwn(ROW_ACTION_ICONS, action.icon) || action.icon === "lock")) formatError("unknown row action icon '" + action.icon + "'.");
      if (action.tone !== undefined && !ROW_ACTION_TONES.includes(action.tone) || action.refresh !== undefined && typeof action.refresh !== "boolean")
        formatError("a row action's tone is neutral, primary or danger, and refresh is a boolean.");
      return Object.freeze({ id: action.id, label: rowActionText(action.label, 200, "a row action"), icon: action.icon || "check", tone: action.tone || "neutral",
        when: rowActionCondition(action.when, columns), disabledWhen: rowActionCondition(action.disabledWhen, columns),
        reason: action.disabledReason === undefined ? null : rowActionText(action.disabledReason, 500, "a disabled reason"), refresh: !!action.refresh });
    });
    return { actions, inline: spec.inline ?? 2, reveal: spec.reveal || "always", locked: rowActionCondition(spec.lockedWhen, columns),
      lockedLabel: spec.lockedLabel ?? null };
  }

  Object.assign(DataGrid.prototype, {
    /**
     * What a row offers: locked, or its actions with their disabled state and reason, split into the inline buttons and
     * the More menu. When one action would be left for the menu it shows inline in the menu button's place.
     */
    rowActionState(row) {
      const settings = this.rowActions, pending = this.rowActionPending.get(row.id);
      if (settings.locked?.(row)) return { locked: true, all: [], inline: [], more: [], pending };
      const enabled = this.opts.isRowActionEnabled;
      const all = settings.actions.filter(action => !action.when || action.when(row)).map(action => {
        const refused = !!action.disabledWhen?.(row), host = !refused && typeof enabled === "function" && enabled(row, action) === false;
        return { action, disabled: refused || host || !!pending, reason: refused ? action.reason : null };
      });
      const split = all.length > settings.inline + 1 ? settings.inline : all.length;
      return { locked: false, all, inline: all.slice(0, split), more: all.slice(split), pending };
    },
    /** The loaded record of an id, or null when it is not loaded. */
    rowActionRow(id) {
      for (const row of this.rowCache.values()) if (row.key === id && !row.status) return row;
      return null;
    }
  });
