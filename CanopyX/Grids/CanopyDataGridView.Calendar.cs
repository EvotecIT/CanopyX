using CanopyX.Json;

namespace CanopyX;

public sealed partial class CanopyDataGridView {
    /// <summary>Gets or sets a calendar of the grid's records: month, week, day, N-day, agenda and year views and a resource timeline,
    /// with recurring events. Null, the default, shows none.</summary>
    public CanopyCalendar? Calendar { get; set; }

    private void ValidateCalendar() => Calendar?.Validate(this);

    private void WriteCalendarJson(CanopyJsonWriter writer) {
        if (Calendar != null) { writer.Name("calendar"); Calendar.WriteJson(writer); }
    }
}
