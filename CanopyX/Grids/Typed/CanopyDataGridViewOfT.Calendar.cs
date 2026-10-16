namespace CanopyX;

public sealed partial class CanopyDataGridView<T> {
    /// <summary>
    /// Returns the calendar of the grid's records, for typed settings (<c>grid.Calendar().Start(x =&gt; x.Starts).End(x =&gt; x.Ends)</c>):
    /// creates <see cref="CanopyDataGridView.Calendar"/> on the first call, and adds a column for each member the calendar names
    /// that the grid has none for yet.
    /// </summary>
    /// <returns>The typed calendar builder over <see cref="CanopyDataGridView.Calendar"/>.</returns>
    public CanopyCalendar<T> Calendar() => new CanopyCalendar<T>(this, View.Calendar ??= new CanopyCalendar());
}
