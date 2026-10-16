  // ---------- calendar: a calendar of the grid's records comes with a part (docs/calendar.md) ----------
  // A grid whose view declares calendar shows its records as a calendar (month, week, day, N days, agenda, year and, with
  // resources, the resource timeline) from canopyx-calendar.js and canopyx-timeline.js (Build/parts.json). The part loads
  // before the first query, so the first paint is the calendar; until it is in, the calendar methods load it first.
  const GRID_CALENDAR = definePart(DataGrid, "calendar", "calendar", () => ({ DataGrid, h, setText, fill, plural, gridButton, gridIcon, gridFreeze, cellText,
    cellValue, isCellObject, gridQuery, gridQueryRows, gridResultShape, gridPresenterTone, validateGridRows, validateGridPage, validStructuralCount, checkDocument,
    numberFormat, loadPart, PROTOCOL }));
  definePart(DataGrid, "timeline", "resource timeline", () => ({ DataGrid, TreeGrid, h, setText, fill, numberFormat }));
  const GRID_CALENDAR_API = ["getCalendar", "setCalendarView", "setCalendarDate", "setCalendarZoom", "calendarStep", "calendarToday", "getCalendarEvents",
    "exportCalendar", "openCalendarEvent", "clearCalendarSelection"];
  for (const name of GRID_CALENDAR_API) DataGrid.prototype[name] = function (...args) { return this.loadCalendar().then(() => this[name](...args)); };
  DataGrid.prototype.loadCalendar = function () {
    return this.calLoad ||= loadPart(GRID_CALENDAR).then(() => this.destroyed || this.startCalendar()).catch(error => { this.calLoad = null; this.emit("error", { error }); throw error; });
  };
  const GRID_CALENDAR_INIT = DataGrid.prototype.initializeState;
  DataGrid.prototype.initializeState = function () {
    const start = () => GRID_CALENDAR_INIT.call(this);
    return this.view.calendar ? this.loadCalendar().then(start, start) : start();
  };
