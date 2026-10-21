namespace CanopyX.Examples;

/// <summary>
/// "Connect a mail server", complete: an edit of the current settings with server checks (a connection test and a sign-in test
/// that reads the password once), relay servers the host lists for the chosen region, routing rules as records, presets, a
/// session draft, deep links per step, the host's preview of what saving does, and the equivalent command with a C# variant
/// (docs/flow.md). Everything the host answers comes from the page's mock host script.
/// </summary>
internal static class FlowMailChecksExample {
    internal static CanopyFlow Flow() {
        var flow = new CanopyFlow("mail-connect", "Connect a mail server") {
            Description = "Alerts and reports go out through this server. Test the connection before you save.",
            Baseline = "rev-12",
            Draft = CanopyFlowDraftStore.Session,
            DeepLinks = true,
            Submit = new CanopyFlowSubmit("Save settings"),
            Command = new CanopyFlowCommand("Set-MailServer").Variant("csharp", "C#")
        };
        flow.Step("server", "Which server sends the mail?", step => step
            .Text("host", "Server name", f => f.Required().Help("A host name or an IP address the service can reach.").Parameter("Server").Path("mail.host"))
            .Number("port", "Port", f => f.Default(587d).Range(1, 65535).Half().Parameter("Port").Path("mail.port"))
            .Choice("security", "Connection security", f => f
                .Option(new CanopyFlowOption("starttls", "STARTTLS") { Description = "Upgrades a plain connection. Port 587 is usual.", Badge = "Recommended" })
                .Option("tls", "TLS from the start", "Encrypted from the first byte. Port 465 is usual.")
                .Option("none", "No encryption", "Only inside a trusted network.")
                .Required().Default("starttls").Parameter("Security").Path("mail.security"))
            .Check("connection", "Test the connection", check => check.Fields("host", "port", "security").RequireRun()
                .Describe("Opens a connection to the server and reads its greeting. Nothing is sent.")));
        flow.Step("sign-in", "How does it sign in?", step => step
            .Text("user", "User name", f => f.Required().Help("Often the sender address, such as alerts@example.com.").Parameter("User").Path("mail.user"))
            .Secret("password", "Password", f => f.Required().Parameter("Password"))
            .Check("sign-in-test", "Test sign-in", check => check.Fields("host", "port", "user", "password").RequirePass()));
        flow.Step("route", "Where does the mail go?", step => step
            .Select("region", "Data centre", f => f.Option("eu", "Europe").Option("us", "United States").Option("ap", "Asia Pacific").Required().Half().Parameter("Region").Path("mail.region"))
            .Select("relay", "Relay", f => f.FromHost().DependsOn("region").Half().Help("The relays the service can use in that data centre.").Parameter("Relay").Path("mail.relay"))
            .List("to", "Recipients", f => f.Required().Items(CanopyFlowItemRule.Email).Count(1, 20).Placeholder("For example: name@example.com").Parameter("To").Path("mail.to"))
            .Records("rules", "Routing rules", f => f
                .Column("severity", "Severity", CanopyFlowRecordColumnKind.Select, column => column.Option("error", "Errors").Option("warning", "Warnings").Option("info", "Information").Required())
                .Column("address", "Send to", CanopyFlowRecordColumnKind.Text, column => column.Required())
                .Column("quiet", "Quiet hours", CanopyFlowRecordColumnKind.Toggle)
                .Count(null, 10).Help("Extra recipients by severity. Quiet hours hold information messages until the morning.").Path("mail.rules")));
        flow.Review(review => review.Preview().Declaration("Saving applies the settings to new messages. Messages in the queue keep their old route."));
        flow.Preset("office", "Office relay", preset => preset.Value("host", "relay.office.example.com").Value("port", 25d).Value("security", "none").Value("region", "eu"));
        flow.Preset("cloud", "Cloud mail service", preset => preset.Value("host", "smtp.mail.example.net").Value("port", 587d).Value("security", "starttls").Value("region", "us"));
        flow.Initial["host"] = "mail.example.com";
        flow.Initial["port"] = 587d;
        flow.Initial["security"] = "starttls";
        flow.Initial["user"] = "alerts@example.com";
        flow.Initial["region"] = "eu";
        flow.Initial["relay"] = "eu-relay-1";
        flow.Initial["to"] = new[] { "ops@example.com" };
        flow.StoredSecrets.Add("password");
        return flow;
    }

    internal static void Write(string output) {
        // The mock host: checks answer after a moment (a server name with "fail" fails, "slow" warns), relays follow the region,
        // the preview says what saving does, and the C# variant writes the same answers as an object initializer.
        const string script = """
<script>
(() => {
  const wait = (ms, signal) => new Promise((resolve, reject) => { const timer = setTimeout(resolve, ms); signal?.addEventListener("abort", () => { clearTimeout(timer); reject(new Error("Cancelled")); }); });
  const relays = { eu: ["eu-relay-1", "eu-relay-2"], us: ["us-relay-1", "us-relay-2", "us-relay-3"], ap: ["ap-relay-1"] };
  window.CanopyX.configure("mail-connect", { hooks: {
    async check(id, values, { signal, secret }) {
      await wait(700, signal);
      if (/fail/i.test(values.host || "")) return { status: "fail", message: "The server did not answer on port " + values.port + ".", fieldErrors: { host: "Not reachable from the service." } };
      if (id === "sign-in-test") {
        const password = secret("password");
        if (password === null) return { status: "pass", message: "Signed in with the saved password." };
        return password.length < 8 ? { status: "fail", message: "The server refused the password." } : { status: "pass", message: "Signed in as " + values.user + "." };
      }
      if (/slow/i.test(values.host || "")) return { status: "warning", message: "The server answered slowly.", details: [{ label: "Greeting", value: "220 " + values.host }, { label: "Round trip", value: "2,410 ms" }] };
      return { status: "pass", message: "The server answered.", details: [{ label: "Greeting", value: "220 " + values.host + " ESMTP ready" }, { label: "TLS", value: values.security === "none" ? "Not used" : "TLS 1.3" }, { label: "Round trip", value: "38 ms" }] };
    },
    async options(field, values, { signal }) {
      await wait(400, signal);
      return (relays[values.region] || []).map((value, index) => ({ value, label: value, description: index === 0 ? "Primary" : "Standby" }));
    },
    async preview(values, { signal }) {
      await wait(300, signal);
      return { rows: [{ label: "Applies", value: "Immediately, without a restart", tone: "success" }, { label: "Queued messages", value: "Keep their old route" },
        { label: "Relay", value: values.relay || "Chosen by the service" }], notes: ["A test message goes to " + (values.to?.[0] || "the first recipient") + " after saving."] };
    },
    commands: { csharp: values => "var mail = new MailSettings {\n  Server = \"" + values.host + "\",\n  Port = " + values.port + ",\n  Security = \"" + values.security + "\"\n};" }
  } });
})();
window.flowAnswer = detail => ({ status: "saved", message: "Mail settings saved. A test message is on its way.", links: [{ label: "Open the delivery log", href: "#delivery-log" }] });
</script>
""";
        FlowExamplePage.Write(output, "flow-mail-checks", Flow(), "Connect a mail server", script);
    }
}
