  DEFAULT_LABELS = Object.freeze(Object.assign({}, DEFAULT_LABELS, {
    gridCalculationAdd: "Add calculated column", gridCalculationTitle: "Column title", gridCalculationId: "Column ID", gridCalculationExpression: "Expression",
    gridCalculationError: "Calculation error: {error}", gridCalculationInvalid: "Check the expression, column references and result kind.", gridCalculationHelp: "Use [columnId], arithmetic, IF, COALESCE, ROUND, CONCAT, DATEPART or DATEDIFF.",
    gridCalculationNumber: "Number", gridCalculationDate: "Date and time"
  }));
  const GRID_CALCULATIONS = {}, CALCULATIONS_PART = definePart(DataGrid, "calculations", "calculated columns",
    () => ({ DataGrid, GRID_CALCULATIONS, requireIdentifier, cellValue, h, setText, fill, gridButton, gridQuery, gridQueryStart, inlineGridSource, rowDataSource, loadGridFilterEditor, gridFreeze, gridFitPrepare }));
  const gridUsesCalculations = view => view.calculatedColumnsEditable || view.columns.some(column => column.calculation !== undefined);
  Object.assign(DataGrid.prototype, {
    async prepareCalculations() {
      if (!gridUsesCalculations(this.view)) return;
      await loadPart(CALCULATIONS_PART); GRID_CALCULATIONS.prepare(this);
    },
    async setCalculatedColumns(columns) { await loadPart(CALCULATIONS_PART); return this.setCalculatedColumns(columns); },
    getCalculatedColumns() { return GRID_CALCULATIONS.definitions?.(this.view) || []; },
    async openCalculatedColumn(anchor) { await loadPart(CALCULATIONS_PART); return this.openCalculatedColumn(anchor); }
  });
