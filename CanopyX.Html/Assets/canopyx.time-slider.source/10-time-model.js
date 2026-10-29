  const TIME_TEXT = {
    timePlay: "Play", timePause: "Pause", timePrevious: "Previous snapshot", timeNext: "Next snapshot",
    timePosition: "Snapshot {index} of {count}", timeFrame: "Snapshot at {time}",
    timeReducedMotion: "Timed playback is off because reduced motion is enabled. Step through snapshots manually."
  };
  function timeFail(message) { throw new Error("CanopyX: the time slider is not valid: " + message + "."); }
  function timeKeys(value, names, what) {
    if (!value || typeof value !== "object" || Array.isArray(value)) timeFail(what + " must be an object");
    for (const name of Object.keys(value)) if (!names.includes(name)) timeFail(what + " has the unknown property '" + name + "'");
  }
  function timeModel(source, kind, validate) {
    const input = source.timeSlider;
    timeKeys(input, ["interval", "initial", "snapshots"], "settings");
    const interval = input.interval === undefined ? 1000 : input.interval;
    if (!Number.isInteger(interval) || interval < 100 || interval > 60000) timeFail("interval must be 100 to 60000 milliseconds");
    if (!Array.isArray(input.snapshots) || !input.snapshots.length || input.snapshots.length > 500) timeFail("supply 1 to 500 snapshots");
    let previous = -Infinity;
    const snapshots = input.snapshots.map(item => {
      timeKeys(item, ["at", "label", "view"], "snapshot");
      if (typeof item.at !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,7})?(?:Z|[+-]\d\d:\d\d)$/.test(item.at)) timeFail("snapshot time needs an ISO timestamp with a zone");
      const parts = item.at.match(/\d+/g).map(Number), [year, month, day, hour, minute, second] = parts;
      const zone = item.at.match(/([+-])(\d\d):(\d\d)$/);
      const days = month === 2 ? year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28 : [4, 6, 9, 11].includes(month) ? 30 : 31;
      if (!year || month < 1 || month > 12 || day < 1 || day > days || hour > 23 || minute > 59 || second > 59 ||
          zone && (+zone[2] > 14 || +zone[3] > 59 || +zone[2] === 14 && +zone[3] !== 0)) timeFail("snapshot time is outside the supported date range");
      const instant = Date.parse(item.at);
      if (!Number.isFinite(instant) || instant <= previous) timeFail("snapshot times must increase strictly");
      previous = instant;
      if (item.label !== undefined && (typeof item.label !== "string" || !/\S/.test(item.label) || item.label.length > 200)) timeFail("snapshot label must be visible text of at most 200 characters");
      if (!item.view || item.view.type !== kind || item.view.id !== source.id || Object.hasOwn(item.view, "timeSlider")) timeFail("snapshots need the same view type and id, without nested time sliders");
      validate(item.view);
      // The host can retain and edit its own input; replay uses a detached copy of each validated snapshot.
      const view = JSON.parse(JSON.stringify(item.view));
      return Object.freeze({ at: item.at, label: item.label, view });
    });
    const initial = input.initial === undefined ? snapshots.length - 1 : input.initial;
    if (!Number.isInteger(initial) || initial < 0 || initial >= snapshots.length) timeFail("initial must identify a supplied snapshot");
    return { interval, initial, snapshots };
  }
  function timeLabels(...sources) {
    const labels = { ...TIME_TEXT };
    for (const source of sources) for (const [key, value] of Object.entries(source || {})) {
      if (!Object.hasOwn(labels, key)) { if (/^time[A-Z]/.test(key)) timeFail("unknown label '" + key + "'"); continue; }
      if (typeof value !== "string" || !/\S/.test(value)) timeFail("label '" + key + "' needs visible text");
      labels[key] = value;
    }
    return labels;
  }
