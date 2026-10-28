using CanopyX.Json;

namespace CanopyX;

public sealed partial class CanopyDataGridView {
    /// <summary>Gets or sets task planning on the calendar's resource timeline. Null keeps the ordinary calendar.</summary>
    public CanopyPlan? Plan { get; set; }

    private void ValidatePlan() => Plan?.Validate(this);

    private void WritePlanJson(CanopyJsonWriter writer) {
        if (Plan != null) { writer.Name("plan"); Plan.WriteJson(writer); }
    }
}
