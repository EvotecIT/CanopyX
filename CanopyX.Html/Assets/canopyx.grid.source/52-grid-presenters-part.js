  const PRESENTERS_INIT = DataGrid.prototype.initializeState;
  DataGrid.prototype.initializeState = function () {
    const ready = PRESENTERS_INIT.call(this);
    return [...this.columns,...(this.view.record?.fields||[])].some(column => column.presenter || column.wrap) ? Promise.all([ready, this.loadPresenters()]).then(([result]) => result) : ready;
  };
