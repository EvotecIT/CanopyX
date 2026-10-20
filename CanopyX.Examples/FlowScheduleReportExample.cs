namespace CanopyX.Examples;

/// <summary>
/// "Schedule a report": the vertical stepper, report cards, multiple choice with groups, weekdays that appear only for a
/// weekly schedule, a delivery time, how long to keep each report as a duration, and a recipients list (docs/flow.md).
/// </summary>
internal static class FlowScheduleReportExample {
    internal static CanopyFlow Flow() {
        var flow = new CanopyFlow("schedule-report", "Schedule a report") {
            Description = "A report is built on the schedule you choose and sent to its recipients.",
            Orientation = CanopyFlowOrientation.Vertical,
            Submit = new CanopyFlowSubmit("Create schedule")
        };
        flow.Step("report", "Which report?", step => step
            .Choice("report", "Report", f => f
                .Option(new CanopyFlowOption("weekly-summary", "Activity summary") { Description = "Counts and trends for the period, one page." })
                .Option(new CanopyFlowOption("open-items", "Open items") { Description = "Everything still waiting, oldest first." })
                .Option(new CanopyFlowOption("changes", "Change log") { Description = "Every change in the period, with who made it." })
                .Option(new CanopyFlowOption("audit", "Audit export") { Description = "The full record set as a workbook.", Badge = "Large", DisabledReason = "Needs the archive add-on." })
                .Required().Path("schedule.report"))
            .MultiChoice("formats", "Formats", f => f
                .Option(new CanopyFlowOption("pdf", "PDF") { Group = "Documents" }).Option(new CanopyFlowOption("docx", "Word") { Group = "Documents" })
                .Option(new CanopyFlowOption("xlsx", "Excel") { Group = "Data" }).Option(new CanopyFlowOption("csv", "CSV") { Group = "Data" })
                .Option(new CanopyFlowOption("json", "JSON") { Group = "Data" })
                .Required().Count(1, null).Default(new[] { "pdf" }).Path("schedule.formats")));
        flow.Step("when", "When should it run?", step => step
            .Choice("cadence", "Repeat", f => f.Option("daily", "Every day").Option("weekdays", "Every weekday").Option("weekly", "On chosen days")
                .AsList().Required().Default("weekdays").Path("schedule.cadence"))
            .MultiChoice("days", "Days", f => f.Option("mon", "Monday").Option("tue", "Tuesday").Option("wed", "Wednesday").Option("thu", "Thursday")
                .Option("fri", "Friday").Option("sat", "Saturday").Option("sun", "Sunday").Required().When(CanopyFlowCondition.Equal("cadence", "weekly")).Path("schedule.days"))
            .Time("at", "Time of day", f => f.Required().Default("07:00").Half().Help("In the service's time zone.").Path("schedule.at"))
            .Date("starts", "First run", f => f.Half().Path("schedule.starts")));
        flow.Step("delivery", "Where does it go?", step => step
            .List("recipients", "Recipients", f => f.Required().Items(CanopyFlowItemRule.Email).Count(1, 50).Placeholder("name@example.com").Path("delivery.recipients"))
            .Text("subject", "Subject", f => f.Default("Scheduled report").Length(null, 120).Path("delivery.subject"))
            .Duration("keep", "Keep each report for", f => f.Default(TimeSpan.FromDays(30)).Units(CanopyFlowDurationUnit.Days).Range(TimeSpan.FromDays(1), TimeSpan.FromDays(365))
                .Help("Older reports are removed from the archive.").Path("delivery.keep"))
            .TextArea("note", "Note in the message", f => f.Rows(3).Length(null, 500).Path("delivery.note")));
        flow.Review();
        return flow;
    }

    internal static void Write(string output) {
        const string script = """
<script>
window.flowAnswer = detail => ({ status: "saved", message: "The schedule was created. The first report runs at " + detail.values.at + ".",
  result: [{ label: "Schedule", value: "SCH-2041" }], links: [{ label: "See all schedules", href: "#schedules" }] });
</script>
""";
        FlowExamplePage.Write(output, "flow-schedule-report", Flow(), "Schedule a report", script);
    }
}
