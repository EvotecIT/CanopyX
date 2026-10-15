using CanopyX.Json;

namespace CanopyX;

public sealed partial class CanopyDataGridView {
    /// <summary>Gets or sets live data: rows added, changed and removed in place with a stable order, flashing cells, a batched
    /// update rate and polling. Null, the default, leaves the behaviour to the page; the browser's live API works either way.</summary>
    public CanopyGridLive? Live { get; set; }

    private void WriteLiveJson(CanopyJsonWriter writer) {
        if (Live != null) { writer.Name("live"); Live.WriteJson(writer); }
    }
}
