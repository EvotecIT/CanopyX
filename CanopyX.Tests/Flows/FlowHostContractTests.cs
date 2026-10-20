using CanopyX.Html;

namespace CanopyX.Tests.Flows;

/// <summary>
/// The host-connected parts of the flow document (docs/flow.md#host-connected-flows): checks, host options and sections, records,
/// pick steps, task lists, dialogs, the command, presets, drafts, deep links, the endpoint and the review page's consent. They
/// round-trip through the contract, match the schema, are refused when inconsistent, and choose the entry point a page needs.
/// </summary>
public sealed class FlowHostContractTests {
    /// <summary>A flow that uses every host-connected setting.</summary>
    internal static CanopyFlow Everything() {
        var servers = new CanopyDataGridView("servers", "Servers");
        servers.Columns.Add(new CanopyColumn("name", "Server"));
        servers.Columns.Add(new CanopyColumn("site", "Site"));
        for (var index = 1; index <= 3; index++) {
            var row = new CanopyGridRow("s" + index);
            row.Cells["name"] = "SRV-" + index;
            row.Cells["site"] = index % 2 == 0 ? "Oslo" : "Lyon";
            servers.Rows.Add(row);
        }

        var flow = new CanopyFlow("relay", "Relay") {
            Mode = CanopyFlowMode.Tasks,
            Container = CanopyFlowContainer.Dialog,
            LaunchLabel = "Set up the relay",
            Draft = CanopyFlowDraftStore.Host,
            DeepLinks = true,
            Command = new CanopyFlowCommand("set-relay", CanopyFlowCommandStyle.Posix).Variant("csharp", "C#")
        };
        flow.Step("server", "Which server relays the mail?", step => step
            .Group("Connect")
            .Text("host", "Host", f => f.Required().Parameter("host").Path("relay.host"))
            .Secret("password", "Password", f => f.Parameter("password"))
            .Select("region", "Region", f => f.FromHost().DependsOn("host").Path("relay.region"))
            .Records("rules", "Rules", f => f
                .Column("name", "Name", CanopyFlowRecordColumnKind.Text, column => column.Required())
                .Column("level", "Level", CanopyFlowRecordColumnKind.Select, column => column.Option("high", "High").Option("low", "Low"))
                .Column("limit", "Limit", CanopyFlowRecordColumnKind.Number, column => { column.Validation.Minimum = 1; column.Width = 120; })
                .Count(null, 5).Path("relay.rules"))
            .Section("engine", "Engine options", section => section.FromHost("region").Describe("What the engine needs."))
            .Check("connect", "Test the connection", check => check.Fields("host", "password").RequirePass().Describe("Opens a connection.")));
        flow.Pick("servers", "Which servers?", servers, picker => {
            picker.Label("name");
            picker.Height = 360;
            picker.Field.Count(1, 3).Required().Parameter("servers");
        });
        flow.Review(review => review
            .Confirm("Type {text} to confirm", "RELAY")
            .Acknowledge("I understand that mail moves to this relay.", CanopyFlowCondition.Equal("host", "relay.example.com")));
        flow.Preset("office", "Office relay", preset => preset.Value("host", "office.example.com"));
        flow.UseEndpoint("/api/flows/relay", CanopyFlowRoutes.Options | CanopyFlowRoutes.Fields | CanopyFlowRoutes.Check | CanopyFlowRoutes.Submit);
        return flow;
    }

    [Fact]
    public void ToContract_HostFeatures_MatchTheSchemaAndReadBack() {
        var json = Everything().ToContract();
        FlowSamples.AssertValid(json, "The host-connected flow");
        var read = CanopyFlow.FromContract(json);
        Assert.Equal(json, read.ToContract());
        Assert.Equal(CanopyFlowMode.Tasks, read.Mode);
        Assert.Equal(CanopyFlowContainer.Dialog, read.Container);
        Assert.Equal("Set up the relay", read.LaunchLabel);
        Assert.Equal(CanopyFlowRoutes.Options | CanopyFlowRoutes.Fields | CanopyFlowRoutes.Check | CanopyFlowRoutes.Submit, read.Endpoint!.Routes);
        Assert.Equal(CanopyFlowStepKind.Pick, read.Steps[1].Kind);
        Assert.Equal("name", read.Steps[1].Picker!.LabelColumn);
        Assert.Equal(CanopyFlowCheckRequirement.Pass, read.Steps[0].Checks[0].Requirement);
        Assert.Contains("\"routes\":[\"options\",\"fields\",\"check\",\"submit\"]", json);
        Assert.Contains("\"source\":\"host\",\"dependsOn\":[\"host\"]", json);
    }

    [Fact]
    public void Html_AFlowWithAPickStep_UsesTheReportingEntryPointAndTheViewsParts() {
        var flow = Everything();
        Assert.Equal(CanopyRuntime.ReportingGrid, CanopyHtmlAssets.GetRuntime(flow));
        var parts = CanopyHtmlAssets.GetRequiredParts(flow).Select(part => part.Name).ToList();
        Assert.Contains("forms", parts);
        Assert.Contains("flow", parts);
        Assert.All(CanopyHtmlAssets.GetRequiredParts(flow.Steps[1].Picker!.GridView!), part => Assert.Contains(part.Name, parts));
        Assert.Equal(CanopyRuntime.Flow, CanopyHtmlAssets.GetRuntime(FlowSamples.MailServer()));
    }

    [Fact]
    public void Html_RequiredParts_AreTheFeaturePartsTheFlowUses() {
        // Every host-connected feature but the preview, and the shared flow-host part they require.
        var parts = CanopyHtmlAssets.GetRequiredParts(Everything()).Select(part => part.Name).Where(name => name.StartsWith("flow-", StringComparison.Ordinal)).OrderBy(name => name, StringComparer.Ordinal);
        Assert.Equal(new[] { "flow-checks", "flow-command", "flow-consent", "flow-dialog", "flow-drafts", "flow-endpoint", "flow-host", "flow-links", "flow-options", "flow-pick", "flow-records", "flow-tasks" }, parts);
        // A plain form loads none of them.
        Assert.DoesNotContain(CanopyHtmlAssets.GetRequiredParts(FlowSamples.MailServer()), part => part.Name.StartsWith("flow-", StringComparison.Ordinal));
        // A review page that shows the host's preview loads the preview part.
        var previewing = FlowSamples.MailServer();
        previewing.Steps[^1].Preview();
        Assert.Contains(CanopyHtmlAssets.GetRequiredParts(previewing), part => part.Name == "flow-preview");
    }

    public static IEnumerable<object[]> Problems() {
        static CanopyFlowField Field(CanopyFlow flow, string id) => flow.Steps.SelectMany(step => step.Fields).First(field => field.Id == id);
        yield return Case(flow => Field(flow, "region").DependsOnIds.Add("password"), "depends on the secret field");
        yield return Case(flow => Field(flow, "host").DependsOnIds.Add("region"), "depends on itself");
        yield return Case(flow => flow.Steps[0].Checks[0].FieldIds.Add("missing"), "which the flow does not have");
        yield return Case(flow => { for (var index = 0; index < 8; index++) flow.Steps[0].Checks.Add(new CanopyFlowCheck("extra" + index, "Extra").Fields("host")); }, "more than 8 checks");
        yield return Case(flow => flow.Endpoint = new CanopyFlowEndpoint("//elsewhere.example.com", CanopyFlowRoutes.Submit), "own origin");
        yield return Case(flow => flow.Endpoint = new CanopyFlowEndpoint("/api", CanopyFlowRoutes.None), "at least one known route");
        yield return Case(flow => flow.Presets[0].Values["missing"] = "x", "missing");
        yield return Case(flow => flow.Steps[2].Confirmation = new CanopyFlowConfirmation("Type it") { FieldId = "password" }, "confirmation reads");
        yield return Case(flow => flow.Command!.Variants.Add(new CanopyFlowCommandVariant("patch", "Patch")), "variant id twice");
        yield return Case(flow => flow.Container = CanopyFlowContainer.Inline, "launch label");
        yield return Case(flow => flow.Steps[0].Fields.Add(new CanopyFlowField("other-pick", CanopyFlowFieldKind.Pick, "Pick")), "pick fields belong to pick steps");
    }

    private static object[] Case(Action<CanopyFlow> change, string message) => new object[] { change, message };

    [Theory]
    [MemberData(nameof(Problems))]
    public void Validate_InconsistentHostSettings_AreRefused(Action<CanopyFlow> change, string message) {
        var flow = Everything();
        change(flow);
        var error = Assert.Throws<InvalidOperationException>(flow.Validate);
        Assert.Contains(message, error.Message);
    }

    [Fact]
    public void FromContract_UnknownHostSettings_AreRefused() {
        var json = Everything().ToContract();
        Assert.Throws<InvalidOperationException>(() => CanopyFlow.FromContract(json.Replace("\"draft\":\"host\"", "\"draft\":\"cloud\"")));
        Assert.Throws<InvalidOperationException>(() => CanopyFlow.FromContract(json.Replace("\"routes\":[\"options\"", "\"routes\":[\"query\"")));
        Assert.Throws<InvalidOperationException>(() => CanopyFlow.FromContract(json.Replace("\"required\":\"pass\"", "\"required\":\"always\"")));
    }
}
