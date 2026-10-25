using CanopyX.Json;

namespace CanopyX;

public sealed partial class CanopyDataGridView {
    /// <summary>Gets or sets explicit ordered chains over this grid's inline records. Null keeps the ordinary grid.</summary>
    public CanopyPath? Path { get; set; }

    private void ValidatePath() => Path?.Validate(this);

    private void WritePathJson(CanopyJsonWriter writer) {
        if (Path != null) { writer.Name("path"); Path.WriteJson(writer); }
    }
}
