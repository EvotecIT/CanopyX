  // ---------- flow: the English texts of the flow labels (docs/flow.md#labels-and-right-to-left) ----------
  // The label packs translate them (CanopyLabels.Flow…, labels.json). A flow document's labels and the host's replace them,
  // together with the forms part's shared messages (gridEditRequired, …). Plural texts pick their form by count.
  const FLOW_LABELS = {
    flowSteps: "Steps", flowStepOf: "Step {current} of {count}", flowStepAnnounce: "Step {current} of {count}, {title}",
    flowNext: "Next", flowBack: "Back", flowSubmit: "Submit", flowSubmitting: "Submitting…", flowReviewTitle: "Check your answers",
    flowChange: "Change", flowChangeField: "Change {field}", flowNotProvided: "Not provided", flowOptional: "(optional)",
    flowStepOptional: "Optional", flowStepComplete: "Complete", flowStepCurrent: "Current step", flowStepErrors: "Errors: {count}",
    flowStepLocked: "Complete the earlier steps first", flowStepNotStarted: "Not started", flowErrorSummary: "Fix these before you continue",
    flowReady: "Ready to submit", flowNotReady: "Errors to fix: {count}", flowWarnings: "Warnings: {count}", flowChangesOnly: "Show changes only",
    flowNoChanges: "No answers have changed.", flowWas: "Was: {value}", flowChangedCount: "Changed answers: {count}",
    flowSecretSet: "Set", flowSecretKept: "Unchanged", flowSecretNotSet: "Not set", flowSecretHint: "A value is saved. Leave blank to keep it.",
    flowSecretShow: "Show", flowSecretHide: "Hide", flowSecretReveal: "Show {field}", flowOn: "On", flowOff: "Off",
    flowAdd: "Add", flowAddItem: "Add to {field}", flowRemoveItem: "Remove {item}", flowItemLabel: "{field}, item {index}",
    flowSelectAll: "Select all", flowSelectNone: "Clear", flowSelectedCount: "{count} of {total} selected", flowUnit: "Unit",
    flowUnitSeconds: "seconds", flowUnitMinutes: "minutes", flowUnitHours: "hours", flowUnitDays: "days",
    flowSeconds: "[one]{count} second[other]{count} seconds", flowMinutes: "[one]{count} minute[other]{count} minutes",
    flowHours: "[one]{count} hour[other]{count} hours", flowDays: "[one]{count} day[other]{count} days",
    flowDurationInvalid: "{field} must be a whole number.", flowItemsMin: "{field} needs at least {min}.", flowItemsMax: "{field} allows at most {max}.",
    flowItemEmail: "“{item}” is not an email address.", flowItemHost: "“{item}” is not a host name.", flowItemIp: "“{item}” is not an IP address.",
    flowItemCidr: "“{item}” is not a network range.", flowItemUrl: "“{item}” is not a web address.", flowItemPattern: "“{item}” does not have the expected format.",
    flowSaved: "Saved", flowAccepted: "In progress", flowProgress: "{done} of {total}", flowConflict: "These settings changed while you were editing them.",
    flowReload: "Reload current settings", flowNotSubmitted: "The answers were not submitted.", flowNoHost: "No host received the answers.",
    flowStartAgain: "Start another", flowCopy: "Copy", flowCopied: "Copied", flowSavedIt: "I have saved it", flowShownOnce: "Shown only once. Copy it now."
  };

  /** A flow's labels: the English texts, then the document's, then the host's. An unknown flow… name is a mistake; other views' names are ignored. */
  function flowLabels(...sources) {
    const labels = { ...FORM_LABELS, ...FLOW_LABELS };
    for (const source of sources) {
      if (source == null) continue;
      if (!flowIs(source)) flowFail("labels must be an object of strings");
      for (const [name, text] of Object.entries(source)) {
        // A whole label pack holds the labels of every view; a flow takes its own and the shared form messages.
        if (!Object.hasOwn(labels, name)) { if (/^flow[A-Z]/.test(name)) flowFail("there is no flow label '" + name + "'"); continue; }
        if (typeof text !== "string" || !/\S/.test(text)) flowFail("label '" + name + "' must be a string with visible text");
        labels[name] = text;
      }
    }
    return Object.freeze(labels);
  }
