  // Playback state and lifetime belong to the controller, DOM to these templates.
  function timeIcon(button, playing, direction) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"), path = document.createElementNS(svg.namespaceURI, "path");
    svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("aria-hidden", "true");
    path.setAttribute("d", direction === -1 ? "M7 5V19M18 5L9 12L18 19Z" : direction === 1 ? "M17 5V19M6 5L15 12L6 19Z" : playing ? "M8 5V19M16 5V19" : "M7 4L20 12L7 20Z");
    svg.appendChild(path); button.replaceChildren(svg);
  }
  function timeControlsTemplate(model, labels, source, hostLabels, hostLang) {
    const root = h("section", "cx-time"), controls = h("div", "cx-time-controls"), range = h("input", "cx-time-range");
    const stamp = h("div", "cx-time-stamp"), position = h("span", "cx-time-position"), reduced = h("p", "cx-time-reduced");
    const scrubber = h("div", "cx-time-scrubber"), ticks = h("div", "cx-time-ticks"); ticks.setAttribute("aria-hidden", "true");
    const formatter = humanTimeFormat(source.lang || hostLang || document.documentElement.lang, source.timeZone === "local", hostLabels?.changeUtcTime ?? source.labels?.changeUtcTime);
    const button = text => { const result = h("button", "cx-btn icon cx-time-button"); result.type = "button"; result.setAttribute("aria-label", text); result.title = text; return result; };
    const previous = button(labels.timePrevious), play = button(labels.timePlay), next = button(labels.timeNext);
    timeIcon(previous, false, -1); timeIcon(next, false, 1);
    range.type = "range"; range.min = "0"; range.max = String(model.snapshots.length - 1); range.step = "1";
    range.setAttribute("aria-label", labels.timePosition.replace("{index}", "").replace("{count}", String(model.snapshots.length)).trim());
    stamp.setAttribute("aria-live", "polite"); root.setAttribute("aria-label", labels.timeFrame.replace("{time}", "").trim());
    setText(reduced, labels.timeReducedMotion);
    for (const [index, item] of model.snapshots.entries()) {
      const tick = h("i"); tick.style.insetInlineStart = (model.snapshots.length === 1 ? 0 : index * 100 / (model.snapshots.length - 1)) + "%";
      tick.title = formatter.format(new Date(item.at)); ticks.appendChild(tick);
    }
    controls.append(previous, play, next, stamp); scrubber.append(range, ticks); root.append(controls, scrubber, position, reduced);
    return { root, range, stamp, position, reduced, previous, play, next, formatter };
  }
  function timeStateTemplate(elements, model, labels, index, playing, reducedMotion) {
    const { root, range, stamp, position, reduced, previous, play, next, formatter } = elements;
      const item = model.snapshots[index], text = fill(labels.timePosition, { index: index + 1, count: model.snapshots.length });
      const time = formatter.format(new Date(item.at));
      range.value = String(index); range.setAttribute("aria-valuetext", text + ": " + time);
      setText(position, text); setText(stamp, (item.label ? item.label + " · " : "") + fill(labels.timeFrame, { time }));
      previous.disabled = index === 0; next.disabled = index === model.snapshots.length - 1;
      play.disabled = reducedMotion || model.snapshots.length < 2 || !playing && index === model.snapshots.length - 1;
      root.dataset.playing = String(playing); play.setAttribute("aria-pressed", String(playing));
      const name = playing ? labels.timePause : labels.timePlay; play.setAttribute("aria-label", name); play.title = name; timeIcon(play, playing); reduced.hidden = !reducedMotion;
  }
