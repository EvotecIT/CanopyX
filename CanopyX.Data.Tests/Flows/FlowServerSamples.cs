namespace CanopyX.Data.Tests.Flows;

/// <summary>Flows and proposals the server-side flow tests read.</summary>
internal static class FlowServerSamples {
    /// <summary>A mail flow with a condition, a secret, list, duration and records rules, setting paths and a command.</summary>
    public static CanopyFlow Mail(bool edit = false) {
        var flow = new CanopyFlow("mail", "Mail")
            .Step("server", "Server", step => step
                .Text("host", "Host", field => field.Required().Length(3, 80).Path("mail.host").Parameter("Server"))
                .Number("port", "Port", field => field.Range(1, 65535).Step(1).Default(25).Path("mail.port").Parameter("Port"))
                .Toggle("auth", "Sign in", field => field.Path("mail.auth"))
                .Text("user", "User name", field => field.Required().When(CanopyFlowCondition.Equal("auth", true)).Path("mail.user"))
                .Secret("password", "Password", field => field.Required().Length(4, null).When(CanopyFlowCondition.Equal("auth", true)).Parameter("Credential"))
                .Check("connection", "Test the connection", check => check.Fields("host", "port", "password")))
            .Step("recipients", "Recipients", step => step
                .List("to", "To", field => field.Items(CanopyFlowItemRule.Email).Count(1, 5).Path("mail.to"))
                .Duration("retry", "Retry after", field => field.Range(TimeSpan.FromMinutes(1), TimeSpan.FromHours(1)))
                .Records("rules", "Rules", field => field
                    .Column("name", "Name", CanopyFlowRecordColumnKind.Text, column => column.Required())
                    .Column("limit", "Limit", CanopyFlowRecordColumnKind.Number, column => column.Validation.Minimum = 1)))
            .Review();
        flow.Command = new CanopyFlowCommand("Set-Mail");
        if (edit) {
            flow.Initial["host"] = "old.example.com";
            flow.Initial["port"] = 25;
            flow.Initial["auth"] = true;
            flow.Initial["user"] = "svc";
            flow.StoredSecrets.Add("password");
            flow.Baseline = "r1";
        }

        return flow;
    }

    /// <summary>A flow with a host section and a field whose options come from the host.</summary>
    public static CanopyFlow Engine() =>
        new CanopyFlow("engine", "Engine")
            .Step("pick", "Engine", step => step
                .Select("engine", "Engine", field => field.Required().Option("sql", "SQL").Option("file", "File"))
                .Select("region", "Region", field => field.FromHost())
                .Section("engine-options", "Options", section => section.FromHost("engine")));

    /// <summary>A proposal of the mail flow in create mode, with replaceable parts.</summary>
    public static string MailProposal(string values, string secrets = "{}", string extra = "") =>
        "{\"kind\":\"flowSubmission\",\"flow\":\"mail\",\"version\":1,\"mode\":\"create\",\"values\":" + values + ",\"secrets\":" + secrets + ",\"changes\":[],\"patch\":[]" + extra + "}";

    /// <summary>Valid create-mode answers of the mail flow, without sign-in.</summary>
    public const string ValidValues = "{\"host\":\"mail.example.com\",\"port\":587,\"auth\":false,\"to\":[\"ops@example.com\"],\"retry\":\"PT15M\",\"rules\":[{\"name\":\"Daily\",\"limit\":5}]}";
}
