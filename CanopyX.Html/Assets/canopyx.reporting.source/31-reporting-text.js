  // Complete text lives outside strict row containment and closes when its accepted query is retired.
  DataGrid.prototype.showReportingText = function (column, text, returnFocus, rowId) {
    if (this.destroyed || this.pendingQuery || !this.acceptedQuery) return;
    if (this.reportingText) this.reportingText.close();
    const dialog = h("dialog", "cx-static cx-reporting-text"), heading = h("h2"), content = h("pre"), close = h("button", "cx-button");
    dialog.setAttribute("data-cx-theme", this.host.getAttribute("data-cx-theme"));
    const theme = getComputedStyle(this.host);
    for (const token of ["surface", "text", "accent", "line"])
      dialog.style.setProperty("--cx-" + token, theme.getPropertyValue("--cx-" + token));
    heading.id = this.id + "-cell-title"; setText(heading, column.title); dialog.setAttribute("aria-labelledby", heading.id);
    setText(content, text); content.tabIndex = 0; close.type = "button"; setText(close, this.labels.gridCloseCell);
    dialog.append(heading, content, close); document.body.appendChild(dialog); this.reportingText = dialog;
    const signal = this.dataLifetime.signal, abort = () => dialog.close();
    signal.addEventListener("abort", abort, { once: true });
    close.addEventListener("click", () => dialog.close());
    // WebKit on macOS can skip buttons in its platform Tab order. Both dialog controls remain reachable.
    dialog.addEventListener("keydown", event => {
      if (event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      (document.activeElement === content ? close : content).focus({ preventScroll: true });
    });
    dialog.addEventListener("close", () => {
      signal.removeEventListener("abort", abort); dialog.remove();
      if (this.reportingText === dialog) this.reportingText = null;
      if (signal.aborted || this.destroyed) return;
      if (this.canvas.contains(returnFocus) && reachable(returnFocus)) returnFocus.focus({ preventScroll: true });
      else {
        const element = [...this.rendered.values()].find(item => item._w && !item._w.status && item._w.key === rowId);
        const index = this.visibleColumns().findIndex(item => item.id === column.id);
        if (element && index >= 0) this.focusCell(element._w, index, 0);
        else this.setFocus(element ? element._w : this.focused || this.rowItem(this.rowAt(this.logicalTop())), true);
      }
    }, { once: true });
    dialog.showModal(); content.focus();
  };
