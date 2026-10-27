  // Playback state and lifetime belong to the controller, DOM to these templates.
  function timeControlsTemplate(model, labels) {
    const root = h("section", "cx-time"), controls = h("div", "cx-time-controls"), range = h("input", "cx-time-range");
    const stamp = h("div", "cx-time-stamp"), position = h("span", "cx-time-position"), reduced = h("p", "cx-time-reduced");
    const button = text => { const result = h("button", "cx-btn cx-time-button"); result.type = "button"; setText(result, text); return result; };
    const previous = button(labels.timePrevious), play = button(labels.timePlay), next = button(labels.timeNext);
    range.type = "range"; range.min = "0"; range.max = String(model.snapshots.length - 1); range.step = "1";
    range.setAttribute("aria-label", labels.timePosition.replace("{index}", "").replace("{count}", String(model.snapshots.length)).trim());
    stamp.setAttribute("aria-live", "polite"); root.setAttribute("aria-label", labels.timeFrame.replace("{time}", "").trim());
    setText(reduced, labels.timeReducedMotion);
    controls.append(previous, play, next, range, position); root.append(controls, stamp, reduced);
    return { root, range, stamp, position, reduced, previous, play, next };
  }
  function timeStateTemplate(elements, model, labels, index, playing, reducedMotion) {
    const { range, stamp, position, reduced, previous, play, next } = elements;
      const item = model.snapshots[index], text = fill(labels.timePosition, { index: index + 1, count: model.snapshots.length });
      range.value = String(index); range.setAttribute("aria-valuetext", text + ": " + item.at);
      setText(position, text); setText(stamp, (item.label ? item.label + " · " : "") + fill(labels.timeFrame, { time: new Date(item.at).toISOString() }));
      previous.disabled = index === 0; next.disabled = index === model.snapshots.length - 1;
      play.disabled = reducedMotion || model.snapshots.length < 2 || !playing && index === model.snapshots.length - 1;
      play.setAttribute("aria-pressed", String(playing)); setText(play, playing ? labels.timePause : labels.timePlay); reduced.hidden = !reducedMotion;
  }
