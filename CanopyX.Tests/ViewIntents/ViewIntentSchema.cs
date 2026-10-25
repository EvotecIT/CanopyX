using Json.Schema;

namespace CanopyX.Tests.ViewIntents;

// JsonSchema registers the document identity globally; both validator suites share one immutable instance.
internal static class ViewIntentSchema {
    internal static readonly JsonSchema Value = JsonSchema.FromFile(
        Path.Combine(AppContext.BaseDirectory, "Schema", "canopyx-view-state-1.schema.json"));
}
