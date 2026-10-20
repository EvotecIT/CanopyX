  // ---------- the flow-preview part: the host's preview on the review page (docs/flow.md) ----------
  // hooks.preview(values, { signal }) answers what submitting will do, drawn from structured rows (never HTML): loading, then
  // its rows, or why it failed. A later review drops an earlier answer.
  const FLOW_PART_LABELS = {
    flowPreview: "Preview",
    flowPreviewLoading: "Loading the preview…",
    flowPreviewFailed: "The preview could not load: {message}",
    flowPreviewNone: "Nothing to preview."
  };
  Object.assign(FLOW_LABELS, FLOW_PART_LABELS);
  const FLOW_PREVIEW_TONES = ["info", "success", "warning", "danger"];
  FLOW_HOST.preview = {
    /** The review page shows the preview when the host answers it. */
    review(view, section) { if (typeof view.hooks.preview === "function") section.appendChild(view.previewBlock()); }
  };

  Object.assign(FlowView.prototype, {
    /** The host's preview: loading, then its rows, or why it failed. A later review drops an earlier answer. */
    previewBlock() {
      const labels = this.labels, block = h("section", "cx-flow-preview"), heading = h("h4", "cx-flow-review-title"), body = h("div", "cx-flow-preview-body");
      heading.id = this.id + "-rp"; setText(heading, labels.flowPreview); block.setAttribute("aria-labelledby", heading.id); block.setAttribute("aria-busy", "true");
      const loading = h("p", "cx-flow-loading"); setText(loading, labels.flowPreviewLoading); body.appendChild(loading);
      block.append(heading, body);
      this.previewController?.abort();
      const controller = this.previewController = new AbortController();
      this.timed("preview", signal => this.hooks.preview(this.getValues(), { signal }), controller).then(answer => {
        if (this.previewController !== controller || this.destroyed || answer.cancelled) return;
        block.removeAttribute("aria-busy");
        if (answer.failed) { const failed = h("p", "cx-flow-error"); setText(failed, fill(labels.flowPreviewFailed, { message: answer.failed })); body.replaceChildren(failed); return; }
        body.replaceChildren(...this.previewContent(answer.value));
      });
      return block;
    },

    /** Structured preview content: rows of { label, value, tone }, or { title, rows, notes }. Text only. */
    previewContent(value) {
      const text = item => typeof item === "string" && /\S/.test(item) ? item.slice(0, 1000) : null, nodes = [];
      const content = Array.isArray(value) ? { rows: value } : flowIs(value) ? value : null;
      if (!content) { const none = h("p", "cx-flow-none"); setText(none, this.labels.flowPreviewNone); return [none]; }
      if (text(content.title)) { const title = h("p", "cx-flow-preview-title"); setText(title, text(content.title)); nodes.push(title); }
      const rows = (Array.isArray(content.rows) ? content.rows : []).slice(0, 50).filter(row => flowIs(row) && text(row.label) && flowScalar(row.value));
      if (rows.length) {
        const list = h("dl", "cx-flow-answers cx-flow-preview-rows");
        for (const row of rows) {
          const item = h("div", "cx-flow-answer"), term = h("dt"), data = h("dd", "cx-flow-answer-value");
          setText(term, text(row.label)); setText(data, String(row.value).slice(0, 1000));
          if (FLOW_PREVIEW_TONES.includes(row.tone)) data.classList.add("cx-flow-tone-" + row.tone);
          item.append(term, data); list.appendChild(item);
        }
        nodes.push(list);
      }
      for (const note of (Array.isArray(content.notes) ? content.notes : []).slice(0, 10).map(text).filter(Boolean)) { const line = h("p", "cx-flow-preview-note"); setText(line, note); nodes.push(line); }
      if (!nodes.length) { const none = h("p", "cx-flow-none"); setText(none, this.labels.flowPreviewNone); nodes.push(none); }
      return nodes;
    }
  });
