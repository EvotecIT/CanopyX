  // Bucket controls share the grouping chip's lifetime and saved query. They never replace a column's raw data.
  DataGrid.prototype.groupBucketControls = function (chip, levels, level, column) {
    if (!["number", "datetime"].includes(column.kind)) return;
    const select = h("select", "cx-gchip-order cx-gchip-bucket"), labels = this.labels;
    select.setAttribute("aria-label", column.title + ": " + labels.gridBucket);
    const choices = column.kind === "datetime" ? ["day", "week", "month", "quarter", "year", "hour", "weekday"] : ["width", "edges"];
    for (const kind of ["", ...choices]) {
      const option = h("option"); option.value = kind; setText(option, kind ? labels["gridBucket" + kind[0].toUpperCase() + kind.slice(1)] : labels.gridBucketNone); select.append(option);
    }
    select.value = level.bucket?.kind || "";
    select.title = labels.gridBucket + ": " + select.selectedOptions[0].textContent;
    const apply = bucket => this.setGroupBy(levels.map(item => {
      if (item !== level) return item;
      const { bucket: old, ...rest } = item; return bucket ? { ...rest, bucket } : rest;
    })).catch(error => this.emit("error", { error }));
    select.addEventListener("change", () => {
      const kind = select.value;
      apply(!kind ? null : kind === "width" ? { kind, width: 10, origin: 0 } : kind === "edges" ? { kind, edges: [0, 10, 100] } : { kind, timeZone: level.bucket?.timeZone || "UTC", firstWeekday: level.bucket?.firstWeekday ?? 1 });
    });
    chip.append(select);
    if (!["width", "edges"].includes(level.bucket?.kind)) return;
    const input = (name, value, type, read) => {
      const field = h("input", "cx-input cx-gchip-bucket-value"); field.type = type; field.value = String(value);
      if (type === "number") field.step = "any"; else field.maxLength = 4096;
      field.setAttribute("aria-label", column.title + ": " + labels[name]); field.title = labels[name];
      field.addEventListener("change", () => {
        try { const bucket = gridBucketDefinition(read(field.value), column); field.setCustomValidity(""); apply(bucket); }
        catch (_) { field.setCustomValidity(labels.gridBucketInvalid); field.reportValidity(); }
      });
      chip.append(field);
    };
    if (level.bucket.kind === "width") {
      input("gridBucketWidth", level.bucket.width, "number", text => ({ ...level.bucket, width: text.trim() ? Number(text) : NaN }));
      input("gridBucketOrigin", level.bucket.origin, "number", text => ({ ...level.bucket, origin: text.trim() ? Number(text) : NaN }));
    } else input("gridBucketEdges", level.bucket.edges.join(", "), "text", text => ({ kind: "edges", edges: text.split(",").map(item => item.trim() ? Number(item) : NaN) }));
  };
