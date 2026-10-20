namespace CanopyX.Examples;

/// <summary>
/// A short, dialog-sized task: pause notifications for a while, in one step without a review page, in the compact density.
/// Also written with the Polish labels and in a right-to-left page, which mirrors the rail, the fields and the action bar.
/// </summary>
internal static class FlowPauseExample {
    internal static CanopyFlow Flow(bool polish = false) {
        var flow = new CanopyFlow("pause-alerts", polish ? "Wstrzymaj powiadomienia" : "Pause notifications") {
            Density = CanopyGridDensity.Compact,
            Submit = new CanopyFlowSubmit(polish ? "Wstrzymaj" : "Pause")
        };
        flow.Step("pause", polish ? "Na jak długo?" : "For how long?", step => step
            .Duration("for", polish ? "Wstrzymaj na" : "Pause for", f => f.Required().Default(TimeSpan.FromHours(2)).Units(CanopyFlowDurationUnit.Minutes, CanopyFlowDurationUnit.Hours, CanopyFlowDurationUnit.Days)
                .Range(TimeSpan.FromMinutes(15), TimeSpan.FromDays(14)))
            .Choice("scope", polish ? "Które powiadomienia" : "Which notifications", f => f
                .Option("all", polish ? "Wszystkie" : "All").Option("warnings", polish ? "Tylko ostrzeżenia" : "Warnings only", polish ? "Błędy nadal przychodzą." : "Errors still come through.")
                .AsList().Required().Default("warnings"))
            .TextArea("reason", polish ? "Powód" : "Reason", f => f.Rows(2).Placeholder(polish ? "Na przykład: prace serwisowe" : "For example: planned maintenance").Length(null, 200))
            .Toggle("tell", polish ? "Powiadom zespół" : "Tell the team", f => f.Default(true)));
        return flow;
    }

    internal static void Write(string output) {
        const string script = """
<script>
window.flowAnswer = detail => ({ status: "saved", message: "Notifications are paused." });
</script>
""";
        FlowExamplePage.Write(output, "flow-pause", Flow(), "Pause notifications", script, width: 480);
        FlowExamplePage.Write(output, "flow-pause-rtl", Flow(), "Pause notifications", script, width: 480, direction: Html.CanopyTextDirection.Rtl, dark: false);
        const string polishScript = """
<script>
window.flowAnswer = detail => ({ status: "saved", message: "Powiadomienia zostały wstrzymane." });
</script>
""";
        FlowExamplePage.Write(output, "flow-pause-pl", Flow(polish: true), "Wstrzymaj powiadomienia", polishScript, width: 480, labels: CanopyLabels.Polish(), language: "pl", dark: false);
    }
}
