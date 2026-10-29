using CanopyX.Json;

namespace CanopyX;

public sealed partial class CanopyDataGridView {
    /// <summary>Gets or sets an ordered stack explanation over inline records. Null keeps the ordinary grid.</summary>
    public CanopyStack? Stack { get; set; }

    private void ValidateStack() => Stack?.Validate(this);

    private void WriteStackJson(CanopyJsonWriter writer) {
        if (Stack != null) { writer.Name("stack"); Stack.WriteJson(writer); }
    }
}
