namespace CanopyX.Examples;

/// <summary>
/// "Connect a mail server": a four-step flow with choice cards, a password that never echoes, certificate options that
/// appear only with a secure connection, a recipients list and the review page (docs/flow.md).
/// </summary>
internal static class FlowMailServerExample {
    internal static CanopyFlow Flow() {
        var flow = new CanopyFlow("mail-server", "Connect a mail server") {
            Description = "Alerts and reports go out through this server.",
            Submit = new CanopyFlowSubmit("Save settings")
        };
        flow.Step("server", "Which server sends the mail?", step => step
            .Text("host", "Server name", f => f.Required().Help("A host name, such as mail.example.com, or an IP address the service can reach.").Path("mail.host"))
            .Number("port", "Port", f => f.Default(587d).Range(1, 65535).Half().Path("mail.port"))
            .Duration("timeout", "Give up after", f => f.Default(TimeSpan.FromSeconds(30)).Units(CanopyFlowDurationUnit.Seconds, CanopyFlowDurationUnit.Minutes)
                .Range(TimeSpan.FromSeconds(5), TimeSpan.FromMinutes(5)).Half().Path("mail.timeout"))
            .Choice("security", "Connection security", f => f
                .Option(new CanopyFlowOption("starttls", "STARTTLS") { Description = "Upgrades a plain connection. Port 587 is usual.", Badge = "Recommended" })
                .Option("tls", "TLS from the start", "Encrypted from the first byte. Port 465 is usual.")
                .Option("none", "No encryption", "Only inside a trusted network.")
                .Required().Default("starttls").Path("mail.security")));
        flow.Step("tls", "How should the certificate be checked?", step => step
            .When(CanopyFlowCondition.NotEqual("security", "none"))
            .Describe("These options apply to encrypted connections only.")
            .Toggle("verify", "Check the server certificate", f => f.Default(true).Path("mail.tls.verify"))
            .Select("minimum", "Lowest TLS version", f => f.Option("1.2", "TLS 1.2").Option("1.3", "TLS 1.3").Default("1.2").Half().Path("mail.tls.minimum"))
            .Text("serverName", "Expected certificate name", f => f.Help("Leave empty to use the server name.").Path("mail.tls.serverName")
                .When(CanopyFlowCondition.Equal("verify", true))));
        flow.Step("sign-in", "How does it sign in?", step => step
            .Choice("auth", "Sign-in", f => f.Option("password", "User name and password").Option("none", "No sign-in", "The server accepts mail from this host without one.")
                .AsList().Required().Default("password").Path("mail.auth"))
            .Section("account", "Account", section => section
                .When(CanopyFlowCondition.Equal("auth", "password"))
                .Text("user", "User name", f => f.Required().Help("Often the sender address, such as alerts@example.com.").Path("mail.user"))
                .Secret("password", "Password", f => f.Required().Help("Kept by the host. It is never shown again on this page."))));
        flow.Step("recipients", "Who receives the mail?", step => step
            .Text("from", "Sender address", f => f.Required().Default("alerts@example.com").Length(3, 254).Path("mail.from"))
            .List("to", "Recipients", f => f.Required().Items(CanopyFlowItemRule.Email).Count(1, 20).Placeholder("For example: name@example.com")
                .Help("One address per row. Paste several lines to add them at once.").Path("mail.to")));
        flow.Review(review => review.Declaration("Saving sends a test message to the first recipient."));
        return flow;
    }

    internal static void Write(string output) {
        const string script = """
<script>
window.flowAnswer = detail => ({ status: "saved", message: "Mail settings saved. A test message is on its way to " + detail.values.to[0] + ".",
  links: [{ label: "Open the delivery log", href: "#delivery-log" }] });
</script>
""";
        FlowExamplePage.Write(output, "flow-mail-server", Flow(), "Connect a mail server", script);
    }
}
