  // ---------- changes: the English texts of the change views (docs/changes.md) ----------
  // The label packs translate them (CanopyLabels.Change…, labels.json). A document's labels and the host's replace them.
  const CHANGE_LABELS = {
    changeInline: "Inline", changeSplit: "Side by side", changeLayout: "Layout", changeCopyDiff: "Copy diff", changeCopied: "Copied",
    changeCopyFailed: "Could not copy", changeNext: "Next change", changePrevious: "Previous change", changePosition: "Change {index} of {count}",
    changeShowLines: "[one]Show {count} more line[other]Show {count} more lines",
    changeHiddenLines: "[one]{count} unchanged line not included[other]{count} unchanged lines not included",
    changeLineCounts: "Lines added: {added}, removed: {removed}", changeLineAdded: "Added line {line}", changeLineRemoved: "Removed line {line}",
    changeLineContext: "Line {line}", changeBefore: "Before", changeAfter: "After",
    changeBinary: "Binary file: compared by size and hash, not by lines.", changeUnavailable: "The content of this file is not available.",
    changeIdentical: "The text did not change.", changeTruncated: "Some changes are not shown: the comparison was too large.",
    changeTooLarge: "These texts are too long to compare here.", changeDiffOf: "Changes in {name}", changeAdded: "Added", changeRemoved: "Removed",
    changeModified: "Modified", changeRenamed: "Renamed", changeFlaggedOnly: "Flagged only", changeFlaggedCount: "{count} flagged",
    changeNoItems: "No changes to show.", changeSize: "Size", changeHash: "Hash", changeTime: "Time", changeCopyHash: "Copy the full hash",
    changeDetails: "Details of {name}", changeFileCount: "[one]{count} file[other]{count} files", changeFrom: "from {path}",
    changeShowMore: "Show more", changeFlags: "Flags", changeFacts: "Details", changeRoot: "Top level", changeShown: "{shown} of {total} shown",
    changeFilter: "Show changes", changeActions: "Actions for {name}", changeConverged: "Converged", changePropagating: "Propagating",
    changeFault: "Fault", changeUnknown: "Unknown", changeReplica: "Replica", changeState: "State", changeFirstSeen: "First seen",
    changeLastSeen: "Last seen", changeTimeline: "Delay", changeNotSeen: "Not seen yet", changeDelay: "+{duration}", changeSource: "Source",
    changeProgress: "{converged} of {total} have the change", changeSeconds: "{count} s", changeMinutes: "{count} min", changeHours: "{count} h",
    changeDays: "{count} d", changeUtcTime: "{time} UTC", changeExportCsv: "Export CSV", changeExportJson: "Export JSON", changeReason: "Reason",
    changeReasonHint: "{action}: say why. The reason is kept with the action.", changeReasonRequired: "Enter a reason first.", changeCancel: "Cancel",
    changeUnclaimed: "This page cannot carry out “{action}” itself. Copy the request to pass it on.", changeCopyRequest: "Copy request",
    changeFiltered: "Filtered: {filters}"
  };

  /** A change view's labels: the English texts, then the document's, then the host's. An unknown change… name is a mistake; other views' names are ignored. */
  function changeLabels(...sources) {
    const labels = { ...CHANGE_LABELS };
    for (const source of sources) {
      if (source == null) continue;
      if (typeof source !== "object" || Array.isArray(source)) changeFail("labels must be an object of strings");
      for (const [name, text] of Object.entries(source)) {
        if (!Object.hasOwn(labels, name)) { if (/^change[A-Z]/.test(name)) changeFail("there is no change label '" + name + "'"); continue; }
        if (typeof text !== "string" || !/\S/.test(text)) changeFail("label '" + name + "' must be a string with visible text");
        labels[name] = text;
      }
    }
    return Object.freeze(labels);
  }
  function changeFail(message) { throw new Error("CanopyX: the change document is not valid: " + message + "."); }
  /** A label in the page language's plural form for a count, with its placeholders filled. */
  function changeCount(template, count, lang, values) { return fill(plural(template, count, lang), values); }