/** Layout checks for rendered views. Runs inside the page, without a browser or test-runner dependency. */
export function inspectFinishQuality(root = document) {
  const findings = [], tolerance = 3;
  const box = element => element.getBoundingClientRect();
  const visible = element => element.getClientRects().length && getComputedStyle(element).visibility !== "hidden" &&
    !element.closest('[hidden]');
  const all = selector => [...root.querySelectorAll(selector)].filter(visible);
  const allowed = (element, rule) => {
    for (let at = element; at; at = at.parentElement) {
      if ((at.getAttribute("data-cx-finish-allow") || "").split(/\s+/).includes(rule)) return true;
    }
    return false;
  };
  const location = element => {
    if (element.id) return "#" + CSS.escape(element.id);
    const parts = [];
    for (let at = element; at && at !== root && parts.length < 5; at = at.parentElement) {
      const classes = [...at.classList].filter(name => name.startsWith("cx-")).slice(0, 2);
      parts.unshift(at.localName + classes.map(name => "." + CSS.escape(name)).join("") +
        (at.parentElement ? ":nth-child(" + ([...at.parentElement.children].indexOf(at) + 1) + ")" : ""));
    }
    return parts.join(" > ");
  };
  const report = (rule, element, message, measurements = {}) => {
    if (!allowed(element, rule)) findings.push({ rule, selector: location(element), message, ...measurements });
  };
  const rowHeight = element => {
    const row = element.querySelector('.cx-row,[role="row"],.cx-cal-slot');
    return row && box(row).height > 0 ? box(row).height : 32;
  };

  // Bands compare with the actual rendered row width, including the fitted filler, not the viewport or hidden columns.
  for (const band of all('.cx-footer-row,.cx-summary-row,.cx-grid-group,.cx-grid-query-summary,.cx-toolbar,[data-cx-finish-band]')) {
    const frame = band.closest('.cx-data-grid,[data-canopyx-host],[data-cx-finish-frame]');
    const rows = frame && [...frame.querySelectorAll('.cx-row,[data-cx-finish-row]')].filter(row => visible(row) &&
      row.closest('.cx-data-grid,[data-canopyx-host],[data-cx-finish-frame]') === frame);
    if (!rows?.length) continue;
    const bodyWidth = Math.max(...rows.map(row => box(row).width)), inside = band.closest('.cx-grid');
    const expected = inside ? bodyWidth : Math.min(bodyWidth, box(frame.querySelector('.cx-grid') || frame).width), actual = box(band).width;
    if (actual + tolerance < expected) report("band-width", band, "Band ends before its body rows.", { actual, expected });
  }

  // datetime-local defaults to minute precision. Fractions can force native editors to expose extra fields even at zero.
  const dates = all('.cx-cell[data-cx-column]').filter(cell => {
    const host = cell.closest('[data-canopyx-host],[data-canopyx-mounted]');
    return host?.canopyx?.view?.columns?.some(column => column.id === cell.dataset.cxColumn && column.kind === "datetime");
  });
  for (const field of new Set([...dates, ...all('input[type="datetime-local"],input[type="time"],[data-cx-precision="minutes"]')])) {
    const explicit = field.getAttribute("data-cx-precision"), editor = field.matches("input"),
      minuteEditor = editor && (!field.hasAttribute("step") || Number(field.step) >= 60 ||
        !!field.closest(".cx-cal-occurrence-editor,.cx-cal-create"));
    if (explicit !== "minutes" && !minuteEditor && !dates.includes(field)) continue;
    const value = editor ? field.value : field.textContent;
    if (/(?:T|\b)\d{1,2}:\d{2}:\d{2}(?:[.,]\d+)?/.test(value) || editor && Number(field.step) < 60)
      report("minute-precision", field, "Minute precision exposes seconds or milliseconds.", { value, step: field.step });
  }

  for (const header of all('.cx-hcell,[data-cx-finish-header]')) {
    const label = header.querySelector('.cx-htext,[data-cx-finish-label]') || header;
    const style = getComputedStyle(label), lineHeight = Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) * 1.2;
    const range = document.createRange(); range.selectNodeContents(label);
    const lines = new Set([...range.getClientRects()].filter(rect => rect.width > 0).map(rect => Math.round(rect.top)));
    if (lines.size < 2 || box(label).height < lineHeight * 1.7) continue;
    const frame = header.closest('.cx-grid,[data-cx-finish-frame]');
    if (!frame) continue;
    const heads = [...frame.querySelectorAll('.cx-hcell,[data-cx-finish-header]')].filter(header => visible(header) &&
      header.closest('.cx-grid,[data-cx-finish-frame]') === frame);
    const occupied = heads.reduce((total, cell) => total + box(cell).width, 0), spare = box(frame).width - occupied;
    const canvas = document.createElement("canvas"), context = canvas.getContext("2d");
    context.font = style.font;
    const natural = context.measureText(label.textContent.trim()).width;
    if (spare > tolerance && natural <= box(label).width + spare - tolerance)
      report("header-wrap", header, "Header wraps despite enough unused row width.", { spare, natural });
  }

  // Check unused frame space after real content. Virtual spacers, calendar cells and intentionally empty states are content.
  for (const frame of all('.cx-grid,.cx-cal-body,.cx-cal-scroll,[data-cx-finish-frame]')) {
    // A mini-month picker deliberately stays compact inside a frame shared with full calendar layouts.
    const mini = [...frame.children].some(child => child.matches('.cx-cal-mini[data-cx-finish-allow~="empty-band"]'));
    if (mini) continue;
    const children = [...frame.children].filter(visible).filter(child => !["absolute", "fixed"].includes(getComputedStyle(child).position));
    if (!children.length || frame.scrollHeight > frame.clientHeight + tolerance) continue;
    const bottom = Math.max(...children.map(child => box(child).bottom)), gap = box(frame).bottom - bottom;
    if (gap > rowHeight(frame) + tolerance)
      report("empty-band", frame, "Unused vertical band exceeds one row.", { gap });
  }

  for (const frame of all('.cx-grid,[data-cx-finish-frame]')) {
    const belongs = element => visible(element) && element.closest('.cx-grid,[data-cx-finish-frame]') === frame;
    const sorted = [...frame.querySelectorAll('[role="columnheader"][aria-sort]')].filter(element =>
      belongs(element) && ["ascending", "descending", "other"].includes(element.getAttribute("aria-sort")));
    const priorities = [...frame.querySelectorAll('.cx-sort-priority,[data-cx-finish-sort-priority]')].filter(belongs);
    const host = frame.closest('[data-canopyx-host],[data-canopyx-mounted]');
    let userSorts;
    if (host?.canopyx?.getQuery) {
      const fixed = (host.canopyx.view?.preSort || []).map(sort => sort.column);
      userSorts = host.canopyx.getQuery()?.sort?.filter(sort => !fixed.includes(sort.column)).length;
    }
    if (userSorts === 1 || userSorts === undefined && (sorted.length === 1 || sorted.length === 0 && priorities.length === 1)) {
      for (const priority of priorities) if (/\d/.test(priority.textContent))
        report("single-sort-priority", priority, "A single visible user sort has a priority number.");
    }
  }

  for (const element of all('.cx-cell,.cx-hcell,.cx-cal-ev-title,.cx-cal-title,.cx-btn,.cx-chip,.p-pill,[data-cx-finish-text]')) {
    if (!element.textContent.trim() || element.scrollWidth <= element.clientWidth + tolerance) continue;
    const style = getComputedStyle(element);
    if (!["hidden", "clip"].includes(style.overflowX) || style.textOverflow === "ellipsis" ||
        element.closest('[title],[aria-describedby],[data-cx-tooltip]') ||
        [...element.querySelectorAll("*")].some(child => getComputedStyle(child).textOverflow === "ellipsis")) continue;
    report("text-clipped", element, "Text is clipped without ellipsis or a tooltip.");
  }

  // A control can have an ordinary layout box while a fixed-height host cuts it off entirely. Scrollports make their
  // descendants reachable; compare that port with outer clips instead of treating offscreen scroll content as lost.
  for (const element of all('button,[role="button"],[role="status"],[data-cx-finish-text]')) {
    if (!element.textContent.trim()) continue;
    const bounds = box(element), reachable = { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom };
    if (bounds.width <= tolerance || bounds.height <= tolerance) continue;
    for (let at = element.parentElement; at && at !== document.body; at = at.parentElement) {
      const style = getComputedStyle(at), frame = box(at);
      const edges = { left: frame.left + at.clientLeft, top: frame.top + at.clientTop };
      edges.right = edges.left + at.clientWidth; edges.bottom = edges.top + at.clientHeight;
      let clipped = false;
      for (const [axis, start, end, size] of [["X", "left", "right", "Width"], ["Y", "top", "bottom", "Height"]]) {
        const overflow = style["overflow" + axis];
        if (["auto", "scroll"].includes(overflow) && at["scroll" + size] > at["client" + size] + tolerance) {
          reachable[start] = edges[start]; reachable[end] = edges[end];
        } else if (["hidden", "clip"].includes(overflow) &&
            (reachable[start] < edges[start] - tolerance || reachable[end] > edges[end] + tolerance)) clipped = true;
      }
      if (clipped) {
        report("text-clipped", element, "A clipping ancestor cuts off a control or status.", { ancestor: location(at) });
        break;
      }
    }
  }

  if (innerWidth <= 390) {
    for (const element of all('body *')) {
      const bounds = box(element);
      if (bounds.right <= innerWidth + tolerance || bounds.width === 0 || getComputedStyle(element).position === "fixed") continue;
      let scroll = false;
      for (let at = element.parentElement; at && at !== document.body; at = at.parentElement) {
        const style = getComputedStyle(at);
        if (["auto", "scroll", "hidden", "clip"].includes(style.overflowX)) { scroll = true; break; }
      }
      if (!scroll) report("phone-overflow", element, "Content overflows the phone outside a scroll container.");
    }
    for (const chip of all('.cx-chip,.p-pill,.cx-badge,[data-cx-finish-chip]')) {
      const line = chip.parentElement;
      if (!line || !line.textContent.replace(chip.textContent, "").trim()) continue;
      const siblings = [...line.children].filter(element => element !== chip && visible(element));
      if (siblings.length && siblings.every(element => box(element).bottom <= box(chip).top + 1))
        report("phone-chip-wrap", chip, "A chip occupies a separate line from its row text.");
    }
  }
  return findings;
}
