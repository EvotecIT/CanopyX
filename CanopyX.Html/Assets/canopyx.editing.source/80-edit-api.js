  // ---------- editing: the API on grids that have not started editing ----------
  // The part installs once for every grid of the page. A grid that has not started editing (no editable column, and no
  // editing call yet) keeps the answers it had before the part arrived: the reads answer empty, the actions start editing
  // on it first.
  for (const name of ["beginEdit", "endEdit", "setCellValue", "validate", "commitRow", "commitChanges"]) {
    const run = DataGrid.prototype[name];
    DataGrid.prototype[name] = function (...args) { return this.edit ? run.apply(this, args) : this.loadEditing().then(() => run.apply(this, args)); };
  }
  for (const name of ["isEditing", "hasChanges", "undo", "redo", "canUndo", "canRedo", "cancelEdit", "revertChanges", "getChanges", "setReadOnly"]) {
    const run = DataGrid.prototype[name];
    DataGrid.prototype[name] = function (...args) {
      if (this.edit) return run.apply(this, args);
      if (name === "setReadOnly") this.editReadOnly = !!args[0];
      return name === "getChanges" ? [] : false;
    };
  }
