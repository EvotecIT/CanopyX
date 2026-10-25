using CanopyX.Json;

namespace CanopyX;

public sealed partial class CanopyDataGridView {
    /// <summary>Gets or sets a board of the grid's records. Null, the default, keeps the ordinary grid.</summary>
    public CanopyBoard? Board { get; set; }

    private void ValidateBoard() => Board?.Validate(this);

    private void WriteBoardJson(CanopyJsonWriter writer) {
        if (Board != null) { writer.Name("board"); Board.WriteJson(writer); }
    }
}
