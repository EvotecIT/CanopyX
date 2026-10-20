using System.Text.Json;
using Json.Schema;

namespace CanopyX.Tests.Flows;

/// <summary>Sample flows, the flow schema and conversions shared by the flow tests.</summary>
internal static class FlowSamples {
    private static readonly Lazy<JsonSchema> Schema = new(() =>
        JsonSchema.FromFile(Path.Combine(AppContext.BaseDirectory, "Schema", "canopyx-flow-1.schema.json")));

    /// <summary>The quick start of docs/flow.md: a small create-mode flow.</summary>
    internal static CanopyFlow MailServer() {
        var flow = new CanopyFlow("mail-server", "Connect a mail server") { Submit = new CanopyFlowSubmit("Save settings") };
        flow.Step("server", "Which server sends the mail?", step => step
            .Text("host", "Server name", f => f.Required().Placeholder("mail.example.com").Path("mail.host"))
            .Number("port", "Port", f => f.Default(587).Range(1, 65535).Half().Path("mail.port"))
            .Choice("security", "Connection security", f => f
                .Option("starttls", "STARTTLS", "Upgrades a plain connection. Port 587 is usual.")
                .Option("tls", "TLS from the start", "Port 465 is usual.")
                .Option("none", "None", "Only inside a trusted network.")
                .Default("starttls").Path("mail.security")));
        flow.Step("sign-in", "How does it sign in?", step => step
            .Text("user", "User name", f => f.Path("mail.user"))
            .Secret("password", "Password", f => f.Path("mail.password"))
            .Toggle("verify", "Check the server certificate", f => f.Default(true)
                .When(CanopyFlowCondition.NotEqual("security", "none")).Path("mail.verifyCertificate")));
        flow.Review(review => review.Declaration("The settings apply to new messages."));
        return flow;
    }

    /// <summary>A rich edit-mode flow with every field kind, sections, conditions, initial values, stored secrets and labels.</summary>
    internal static CanopyFlow Everything() {
        var labels = new CanopyLabels { GridEditRequired = "Pole {column} jest wymagane." };
        var flow = new CanopyFlow("schedule-report", "Schedule a report") {
            Description = "Sends a summary on a schedule.",
            Mode = CanopyFlowMode.Free,
            Orientation = CanopyFlowOrientation.Vertical,
            Density = CanopyGridDensity.Compact,
            TimeZone = CanopyTimeZone.Local,
            Baseline = "rev-12",
            Submit = new CanopyFlowSubmit("Save schedule"),
            Labels = labels
        };
        flow.Info("welcome", "Before you start", "You need a recipient list.");
        flow.Step("basics", "What does the report hold?", step => step
            .Describe("Name the report and pick its content.")
            .Text("name", "Report name", f => f.Required().Length(3, 80).Pattern("[A-Za-z0-9 ]+", "Letters, digits and spaces.").Help("Shown in the subject line.").Parameter("Name").Path("report.name"))
            .TextArea("notes", "Notes", f => f.Rows(6).Placeholder("Anything the readers should know").Path("report.notes"))
            .Select("format", "Format", f => f.Option("pdf", "PDF").Option("html", "Web page").Default("pdf").Path("report.format"))
            .Choice("audience", "Audience", f => f.Cards()
                .Option(new CanopyFlowOption("team", "My team") { Badge = "Recommended", Description = "People you manage." })
                .Option(new CanopyFlowOption("all", "Everyone") { DisabledReason = "Needs approval." })
                .Path("report.audience"))
            .MultiChoice("sections", "Sections", f => f.Count(1, 3)
                .Option(new CanopyFlowOption("summary", "Summary") { Group = "Overview" })
                .Option(new CanopyFlowOption("trends", "Trends") { Group = "Overview" })
                .Option(new CanopyFlowOption("details", "Details") { Group = "Data" })
                .Default(new[] { "summary" }).Path("report.sections"))
            .Lookup("owner", "Owner", f => f.Option("alex").Option("sam").Placeholder("Type a name").Path("report.owner"))
            .Custom("rating", "Priority", "stars", f => f.Default(3).Path("report.priority")));
        flow.Step("when", "When does it run?", step => step
            .Date("start", "First run", f => f.Default(new DateTime(2026, 11, 2)).Half().Path("schedule.start"))
            .Time("at", "Time of day", f => f.Default("07:30").Half().Path("schedule.at"))
            .DateTime("until", "Stop after", f => f.Range(new DateTimeOffset(2026, 1, 1, 0, 0, 0, TimeSpan.Zero), new DateTimeOffset(2030, 1, 1, 0, 0, 0, TimeSpan.Zero)).Path("schedule.until"))
            .Duration("window", "Delivery window", f => f.Units(CanopyFlowDurationUnit.Minutes, CanopyFlowDurationUnit.Hours).Range(TimeSpan.FromMinutes(5), TimeSpan.FromHours(12)).Default(TimeSpan.FromMinutes(90)).Path("schedule.window"))
            .Number("retries", "Retries", f => f.Range(0, 10).Step(1).Default(2).Path("schedule.retries"))
            .Toggle("weekends", "Run on weekends", f => f.States("Yes, also on weekends", "Weekdays only").Path("schedule.weekends"))
            .Section("advanced", "Advanced", section => section
                .Describe("Only for unusual schedules.")
                .When(CanopyFlowCondition.Equal("weekends", true))
                .Text("calendar", "Holiday calendar", f => f.Path("schedule.calendar"))));
        flow.Step("delivery", "Where does it go?", step => step
            .Optional()
            .When(CanopyFlowCondition.Any(CanopyFlowCondition.Equal("format", "pdf"), CanopyFlowCondition.All(CanopyFlowCondition.IsNotEmpty("owner"), CanopyFlowCondition.None(CanopyFlowCondition.In("audience", "all")))))
            .List("recipients", "Recipients", f => f.Required().Items(CanopyFlowItemRule.Email).Count(1, 50).Placeholder("name@example.com").Path("delivery.recipients"))
            .List("hosts", "Relay hosts", f => f.ItemPattern("[a-z0-9.-]+").Path("delivery.hosts"))
            .Secret("token", "Access token", f => f.Length(8, 128).KeepWhenBlank().NoReveal().Path("delivery.token"))
            .Text("relay", "Relay", f => f.Sensitive().ReadOnly().When(CanopyFlowCondition.Matches("owner", "^a")).Path("delivery.relay")));
        flow.Review(review => review.ChangesOnly(false).Declaration("The schedule starts with the next run."));
        flow.Initial["name"] = "Weekly summary";
        flow.Initial["format"] = "html";
        flow.Initial["sections"] = new List<object> { "summary", "trends" };
        flow.Initial["retries"] = 3;
        flow.Initial["until"] = new DateTimeOffset(2027, 6, 30, 12, 0, 0, TimeSpan.FromHours(2));
        flow.Initial["window"] = "PT2H";
        flow.Initial["weekends"] = false;
        flow.Initial["recipients"] = new[] { "ops@example.com" };
        flow.Initial["notes"] = null;
        flow.StoredSecrets.Add("token");
        return flow;
    }

    internal static EvaluationResults Evaluate(string json) {
        using var document = JsonDocument.Parse(json);
        return Schema.Value.Evaluate(document.RootElement, new EvaluationOptions { OutputFormat = OutputFormat.List });
    }

    internal static void AssertValid(string json, string description) {
        var results = Evaluate(json);
        if (results.IsValid) return;
        var errors = string.Join(Environment.NewLine, (results.Details ?? new List<EvaluationResults>())
            .Where(detail => detail.Errors != null)
            .SelectMany(detail => detail.Errors!.Select(error => detail.InstanceLocation + ": " + error.Value)));
        Assert.Fail(description + " does not match canopyx-flow-1.schema.json:" + Environment.NewLine + errors + Environment.NewLine + json);
    }

    /// <summary>A JSON value as plain CLR values: text, doubles, booleans, null, lists and string-keyed dictionaries.</summary>
    internal static object? Plain(JsonElement element) => element.ValueKind switch {
        JsonValueKind.String => element.GetString(),
        JsonValueKind.Number => element.GetDouble(),
        JsonValueKind.True => true,
        JsonValueKind.False => false,
        JsonValueKind.Array => element.EnumerateArray().Select(Plain).ToList(),
        JsonValueKind.Object => element.EnumerateObject().ToDictionary(property => property.Name, property => Plain(property.Value)),
        _ => null
    };
}
