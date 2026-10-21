namespace CanopyX.Examples;

/// <summary>
/// A task-list setup: "Set up the reporting service" opens on a hub of grouped tasks with their states, the host's one-line
/// summaries and blockers. Tasks open on their own; the database task tests its connection and takes the fields its engine
/// needs from the host; schedules are records; review and submit opens once every required task is complete (docs/flow.md).
/// </summary>
internal static class FlowSetupTasksExample {
    internal static CanopyFlow Flow() {
        var flow = new CanopyFlow("service-setup", "Set up the reporting service") {
            Description = "Finish the tasks in any order. The service starts once every required task is complete.",
            Mode = CanopyFlowMode.Tasks,
            Submit = new CanopyFlowSubmit("Start the service")
        };
        flow.Step("database", "Connect the database", step => step
            .Group("Connect")
            .Describe("Where the service keeps its reports and history.")
            .Choice("engine", "Database engine", f => f.Option("sql", "SQL Server").Option("pg", "PostgreSQL").Required().Default("sql").Path("database.engine"))
            .Text("server", "Server", f => f.Required().Help("A host name, with a port when it is not the default.").Path("database.server"))
            .Text("name", "Database name", f => f.Required().Default("reports").Half().Path("database.name"))
            .Section("engine-options", "Engine options", section => section.FromHost("engine").Describe("The settings this engine needs."))
            .Check("database-test", "Test the connection", check => check.Fields("engine", "server", "name").RequirePass()));
        flow.Step("mail", "Choose who gets notified", step => step
            .Group("Connect")
            .List("admins", "Administrators", f => f.Required().Items(CanopyFlowItemRule.Email).Count(1, 10).Placeholder("For example: name@example.com").Path("notify.admins"))
            .Toggle("digest", "Send a daily digest", f => f.Default(true).Path("notify.digest")));
        flow.Step("schedules", "Plan the report schedules", step => step
            .Group("Content")
            .Records("schedule", "Schedules", f => f
                .Column("report", "Report", CanopyFlowRecordColumnKind.Select, column => column.Option("health", "Health summary").Option("usage", "Usage").Option("changes", "Changes").Required())
                .Column("time", "Time", CanopyFlowRecordColumnKind.Time, column => column.Required())
                .Column("weekdays", "Weekdays only", CanopyFlowRecordColumnKind.Toggle)
                .Count(1, 12).Default(new[] { new Dictionary<string, object?> { ["report"] = "health", ["time"] = "07:00", ["weekdays"] = true } }).Path("schedules")));
        flow.Step("branding", "Add your branding", step => step
            .Group("Content")
            .Optional()
            .Text("company", "Company name", f => f.Path("branding.company"))
            .Choice("accent", "Accent colour", f => f.Option("teal", "Teal").Option("blue", "Blue").Option("violet", "Violet").Default("teal").Path("branding.accent")));
        flow.Info("licence", "Activate the licence", "The licence arrives by email after the order is approved. This task completes on its own.");
        flow.Steps[flow.Steps.Count - 1].GroupLabel = "Access";
        flow.Review(review => review.Declaration("Starting the service runs the first schedules today."));
        return flow;
    }

    internal static void Write(string output) {
        // The mock host: the licence task is blocked until an approval, the database task's summary names the server, the engine
        // options follow the engine, and the connection test fails for a server name with "fail".
        const string script = """
<script>
(() => {
  const wait = (ms, signal) => new Promise((resolve, reject) => { const timer = setTimeout(resolve, ms); signal?.addEventListener("abort", () => { clearTimeout(timer); reject(new Error("Cancelled")); }); });
  window.CanopyX.configure("service-setup", { hooks: {
    async status(values, { signal }) {
      await wait(150, signal);
      const states = { licence: { state: "blocked", summary: "Order approved on 14 October", blockers: ["Waiting for the licence email"] } };
      if (values.server) states.database = { state: "notStarted", summary: values.server + " / " + (values.name || "reports") };
      return states;
    },
    async fields(section, values, { signal }) {
      await wait(250, signal);
      return values.engine === "pg"
        ? [{ id: "pgSchema", type: "text", label: "Schema", default: "public", width: "half" }, { id: "pgSsl", type: "select", label: "SSL mode", options: [{ value: "require", label: "Require" }, { value: "prefer", label: "Prefer" }], default: "require", width: "half" }]
        : [{ id: "sqlEncrypt", type: "toggle", label: "Encrypt the connection", default: true }, { id: "sqlInstance", type: "text", label: "Instance name", help: "Leave empty for the default instance." }];
    },
    async check(id, values, { signal }) {
      await wait(600, signal);
      return /fail/i.test(values.server || "") ? { status: "fail", message: "Could not reach " + values.server + "." } :
        { status: "pass", message: "Connected.", details: [{ label: "Version", value: values.engine === "pg" ? "PostgreSQL 16.4" : "SQL Server 2022" }, { label: "Free space", value: "182 GB" }] };
    }
  } });
})();
window.flowAnswer = detail => ({ status: "accepted", message: "Starting the service…" });
document.addEventListener("canopyx:flowSubmitted", event => {
  if (event.detail.status !== "accepted") return;
  const flow = document.querySelector("[data-canopyx-host]").canopyx;
  let done = 0;
  const timer = setInterval(() => { done += 1; flow.setProgress({ done, total: 3, message: ["Creating the tables", "Loading the schedules", "Starting the service"][done - 1] + "…" });
    if (done === 3) { clearInterval(timer); setTimeout(() => flow.complete({ status: "saved", message: "The service is running." }), 400); } }, 600);
});
</script>
""";
        FlowExamplePage.Write(output, "flow-setup-tasks", Flow(), "Set up the reporting service", script, width: 860);
    }
}
