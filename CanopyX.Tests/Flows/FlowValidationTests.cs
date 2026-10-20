namespace CanopyX.Tests.Flows;

/// <summary>The rules <see cref="CanopyFlow.Validate"/> checks before a flow is written, and the argument checks of the model.</summary>
public sealed class FlowValidationTests {
    private static CanopyFlow One(Action<CanopyFlowStep> configure) => new CanopyFlow("flow", "A flow").Step("step", "A step", configure);

    private static void Invalid(CanopyFlow flow, string fragment) {
        var error = Assert.Throws<InvalidOperationException>(() => flow.ToContract());
        Assert.Contains(fragment, error.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Samples_AreValid() {
        FlowSamples.MailServer().Validate();
        FlowSamples.Everything().Validate();
    }

    [Fact]
    public void Constructors_RejectInvalidIds() {
        foreach (var id in new[] { "", "1a", "a b", "a.b", new string('a', 65), "é" }) {
            Assert.Throws<ArgumentException>(() => new CanopyFlow(id, "Title"));
            Assert.Throws<ArgumentException>(() => new CanopyFlowStep(id, "Title"));
            Assert.Throws<ArgumentException>(() => new CanopyFlowSection(id, "Label"));
            Assert.Throws<ArgumentException>(() => new CanopyFlowField(id, CanopyFlowFieldKind.Text, "Label"));
        }

        _ = new CanopyFlow("A-b_" + new string('c', 60), "Title");
        Assert.Throws<ArgumentException>(() => One(step => step.Custom("f", "F", "1bad")));
    }

    [Fact]
    public void Setters_CheckTheirRanges() {
        var field = new CanopyFlowField("f", CanopyFlowFieldKind.TextArea, "F");
        Assert.Throws<ArgumentOutOfRangeException>(() => field.RowCount = 1);
        Assert.Throws<ArgumentOutOfRangeException>(() => field.RowCount = 21);
        Assert.Throws<ArgumentOutOfRangeException>(() => field.NumberStep = 0);
        Assert.Throws<ArgumentOutOfRangeException>(() => field.NumberStep = double.NaN);
        Assert.Throws<ArgumentOutOfRangeException>(() => field.MinItems = -1);
        Assert.Throws<ArgumentOutOfRangeException>(() => field.MaxItems = 1001);
        Assert.Throws<ArgumentException>(() => new CanopyFlowOption(new object()));
        Assert.Throws<ArgumentException>(() => new CanopyFlowOption(double.PositiveInfinity));
        Assert.Throws<ArgumentException>(() => new CanopyFlowOption(9007199254740993L));
        Assert.Equal(5d, new CanopyFlowOption(5).Value);
        Assert.Throws<ArgumentNullException>(() => field.Default(null!));
    }

    [Fact]
    public void Steps_AreCountedAndUnique() {
        Invalid(new CanopyFlow("flow", "A flow"), "1 to 64 steps");
        var many = new CanopyFlow("flow", "A flow");
        for (var index = 0; index < 65; index++) many.Step("s" + index, "Step " + index);
        Invalid(many, "1 to 64 steps");
        Invalid(new CanopyFlow("flow", "A flow").Step("a", "A").Step("a", "B"), "two steps");
    }

    [Fact]
    public void ReviewStep_IsLastAndPlain() {
        Invalid(new CanopyFlow("flow", "A flow").Review().Step("a", "A"), "last step");
        Invalid(new CanopyFlow("flow", "A flow").Step("a", "A").Review().Review(), "last step");
        var twoReviews = new CanopyFlow("flow", "A flow").Review();
        twoReviews.Steps.Add(new CanopyFlowStep("final", null) { Kind = CanopyFlowStepKind.Review });
        Invalid(twoReviews, "last step");
        Invalid(new CanopyFlow("flow", "A flow").Step("a", "A").Review(review => review.Text("f", "F")), "only form steps");
        Invalid(new CanopyFlow("flow", "A flow").Step("a", "A", s => s.Text("f", "F")).Review(review => review.When(CanopyFlowCondition.IsEmpty("f"))), "always shows");
        Invalid(new CanopyFlow("flow", "A flow").Step("a", "A", step => step.Declaration("x")), "apply to the review step");
        Invalid(new CanopyFlow("flow", "A flow").Info("a", "A").Step("b", "B", step => step.ChangesOnly()), "apply to the review step");
        var info = new CanopyFlow("flow", "A flow").Info("a", "A");
        info.Steps[0].Fields.Add(new CanopyFlowField("f", CanopyFlowFieldKind.Text, "F"));
        Invalid(info, "only form steps");
        Invalid(new CanopyFlow("flow", "A flow").Step("a", null!), "title");
    }

    [Fact]
    public void Texts_AreBounded() {
        Invalid(new CanopyFlow("flow", " ").Step("a", "A"), "flow title");
        Invalid(new CanopyFlow("flow", new string('t', 201)).Step("a", "A"), "flow title");
        Invalid(new CanopyFlow("flow", "A flow") { Description = new string('d', 1001) }.Step("a", "A"), "description");
        Invalid(One(step => step.Text("f", "﻿ ")), "label");
        Invalid(One(step => step.Text("f", "F", f => f.Help(new string('h', 1001)))), "help");
        Invalid(One(step => step.Text("f", "F", f => f.Placeholder(new string('p', 257)))), "placeholder");
        Invalid(One(step => step.Select("f", "F", f => f.Option(new CanopyFlowOption("a") { Badge = new string('b', 41) }))), "badge");
        Invalid(One(step => step.Select("f", "F", f => f.Option(new CanopyFlowOption("a") { DisabledReason = new string('r', 401) }))), "disabled reason");
        Invalid(One(step => step.Toggle("f", "F", f => f.States(new string('o', 61), "Off"))), "on text");
        Invalid(new CanopyFlow("flow", "A flow") { Submit = new CanopyFlowSubmit(new string('s', 81)) }.Step("a", "A"), "submit label");
        Invalid(new CanopyFlow("flow", "A flow") { Submit = new CanopyFlowSubmit(" ") }.Step("a", "A"), "submit label");
        Invalid(new CanopyFlow("flow", "A flow") { Baseline = "" }.Step("a", "A"), "baseline");
        Invalid(One(step => step.Section("sec", "", section => section.Text("f", "F"))), "label");
    }

    [Fact]
    public void Fields_AreUniqueAcrossTheFlow() {
        Invalid(new CanopyFlow("flow", "A flow").Step("a", "A", s => s.Text("f", "F")).Step("b", "B", s => s.Section("x", "X", section => section.Number("f", "F"))), "two fields");
        Invalid(One(step => step.Section("x", "X", s => s.Text("a", "A")).Section("x", "Y", s => s.Text("b", "B"))), "two sections");
    }

    [Fact]
    public void Paths_AreNamesAndNeverOverlap() {
        Invalid(One(step => step.Text("f", "F", f => f.Path("mail..host"))), "path");
        Invalid(One(step => step.Text("f", "F", f => f.Path("mail/host"))), "path");
        Invalid(One(step => step.Text("a", "A", f => f.Path("mail.host")).Text("b", "B", f => f.Path("mail.host"))), "two fields write");
        Invalid(One(step => step.Text("a", "A", f => f.Path("mail")).Text("b", "B", f => f.Path("mail.host"))), "holds the path");
        One(step => step.Text("a", "A", f => f.Path("mail.host")).Text("b", "B", f => f.Path("mail.hostname"))).Validate();
        Invalid(One(step => step.Text("f", "F", f => f.Parameter("bad name"))), "parameter");
    }

    [Theory]
    [InlineData("mail", "mail-host", "mail.host")]
    [InlineData("mail.host", "mail-host", "mail")]
    [InlineData("mail.server", "mail.server-host", "mail.server.host.name")]
    public void Paths_RejectAncestorOverlapWithInterveningSibling(string parent, string sibling, string child) {
        var flow = One(step => step
            .Text("a", "A", field => field.Path(parent))
            .Text("b", "B", field => field.Path(sibling))
            .Text("c", "C", field => field.Path(child)));

        Invalid(flow, "holds the path");
    }

    [Fact]
    public void Paths_AllowDistinctOrdinalSegments() {
        One(step => step
            .Text("a", "A", field => field.Path("mail-host"))
            .Text("b", "B", field => field.Path("mail.host"))
            .Text("c", "C", field => field.Path("Mail")))
            .Validate();
    }

    [Fact]
    public void Options_FitTheirKinds() {
        Invalid(One(step => step.Select("f", "F")), "at least one option");
        Invalid(One(step => step.Choice("f", "F")), "at least one option");
        Invalid(One(step => step.MultiChoice("f", "F")), "at least one option");
        Invalid(One(step => step.Lookup("f", "F")), "at least one option");
        Invalid(One(step => step.Text("f", "F", f => f.Option("a"))), "options apply");
        Invalid(One(step => step.Select("f", "F", f => f.Option("a").Option("a"))), "same value");
        One(step => step.Select("f", "F", f => f.Option("1").Option(1).Option(true))).Validate();
        var many = new CanopyFlowField("f", CanopyFlowFieldKind.Lookup, "F");
        for (var index = 0; index < 1001; index++) many.Option(index);
        var flow = new CanopyFlow("flow", "A flow").Step("s", "S");
        flow.Steps[0].Fields.Add(many);
        Invalid(flow, "1000 options");
    }

    [Fact]
    public void KindSettings_ApplyOnlyToTheirKinds() {
        Invalid(One(step => step.Select("f", "F", f => f.Option("a").Cards())), "Display");
        Invalid(One(step => step.Text("f", "F", f => f.States("On", "Off"))), "state texts");
        Invalid(One(step => step.Text("f", "F", f => f.Rows(4))), "rows");
        Invalid(One(step => step.Text("f", "F", f => f.Step(1))), "step");
        Invalid(One(step => step.Text("f", "F", f => f.KeepWhenBlank())), "secret");
        Invalid(One(step => step.Text("f", "F", f => f.NoReveal())), "secret");
        Invalid(One(step => step.Text("f", "F", f => f.Units(CanopyFlowDurationUnit.Days))), "duration");
        Invalid(One(step => step.Duration("f", "F", f => f.Units(CanopyFlowDurationUnit.Days, CanopyFlowDurationUnit.Days))), "twice");
        Invalid(One(step => step.Duration("f", "F", f => f.Range(TimeSpan.FromHours(2), TimeSpan.FromHours(1)))), "shortest");
        Invalid(One(step => step.Duration("f", "F", f => f.Range(TimeSpan.FromSeconds(-1), null))), "non-negative");
        Invalid(One(step => step.Duration("f", "F", f => f.Range(TimeSpan.FromMilliseconds(1500), null))), "whole seconds");
        Invalid(One(step => step.Text("f", "F", f => f.Count(1, 2))), "item counts");
        Invalid(One(step => step.List("f", "F", f => f.Count(3, 2))), "fewest items");
        Invalid(One(step => step.Text("f", "F", f => f.Items(CanopyFlowItemRule.Email))), "item checks");
        Invalid(One(step => step.Text("f", "F", f => f.ItemPattern("[a-z]+"))), "item checks");
        Invalid(One(step => step.List("f", "F", f => f.ItemPattern("(a|b)"))), "Patterns require");
        Invalid(One(step => step.Toggle("f", "F", f => f.Placeholder("x"))), "placeholders");
        var custom = new CanopyFlowField("f", CanopyFlowFieldKind.Custom, "F");
        var flow = new CanopyFlow("flow", "A flow").Step("s", "S");
        flow.Steps[0].Fields.Add(custom);
        Invalid(flow, "editor name");
        Invalid(One(step => step.Text("f", "F", f => f.EditorName = "stars")), "editor name");
    }

    [Fact]
    public void Validation_FitsTheKind() {
        Invalid(One(step => step.Text("f", "F", f => f.Range(1, 2))), "number fields");
        Invalid(One(step => step.Number("f", "F", f => f.Range(new DateTimeOffset(2026, 1, 1, 0, 0, 0, TimeSpan.Zero), null))), "date-and-time");
        Invalid(One(step => step.Number("f", "F", f => f.Length(1, 2))), "lengths and patterns");
        Invalid(One(step => step.Number("f", "F", f => f.Range(5, 1))), "lower limit");
        Invalid(One(step => step.Text("f", "F", f => f.Pattern("a(b"))), "Patterns require");
        Invalid(One(step => step.Text("f", "F", f => f.Message(" "))), "message");
        One(step => step.Secret("f", "F", f => f.Length(8, null).Pattern("[^ ]+"))).Validate();
        One(step => step.TextArea("f", "F", f => f.Length(null, 500))).Validate();
    }

    [Theory]
    [InlineData(CanopyFlowFieldKind.Number, "5")]
    [InlineData(CanopyFlowFieldKind.Number, true)]
    [InlineData(CanopyFlowFieldKind.Number, double.NaN)]
    [InlineData(CanopyFlowFieldKind.Text, 5)]
    [InlineData(CanopyFlowFieldKind.Toggle, "true")]
    [InlineData(CanopyFlowFieldKind.Date, "2026-13-01")]
    [InlineData(CanopyFlowFieldKind.Date, "26-01-01")]
    [InlineData(CanopyFlowFieldKind.Time, "24:00")]
    [InlineData(CanopyFlowFieldKind.Time, "7:30")]
    [InlineData(CanopyFlowFieldKind.DateTime, "2026-01-01T10:00")]
    [InlineData(CanopyFlowFieldKind.DateTime, "yesterday")]
    [InlineData(CanopyFlowFieldKind.Duration, "P1Y")]
    [InlineData(CanopyFlowFieldKind.Duration, "PT1.5S")]
    [InlineData(CanopyFlowFieldKind.Duration, "PT")]
    [InlineData(CanopyFlowFieldKind.Duration, "P1W")]
    [InlineData(CanopyFlowFieldKind.Secret, "hunter2")]
    [InlineData(CanopyFlowFieldKind.List, "one")]
    public void Defaults_FitTheKind(CanopyFlowFieldKind kind, object value) {
        var field = new CanopyFlowField("f", kind, "F") { DefaultValue = value };
        var flow = new CanopyFlow("flow", "A flow").Step("s", "S");
        flow.Steps[0].Fields.Add(field);
        Assert.Throws<InvalidOperationException>(() => flow.ToContract());
    }

    [Fact]
    public void Defaults_OfChoicesAreOptionValues() {
        Invalid(One(step => step.Select("f", "F", f => f.Option("a").Default("b"))), "option values");
        Invalid(One(step => step.Choice("f", "F", f => f.Option(1).Default("1"))), "option values");
        Invalid(One(step => step.MultiChoice("f", "F", f => f.Option("a").Default(new[] { "a", "a" }))), "twice");
        Invalid(One(step => step.MultiChoice("f", "F", f => f.Option("a").Default("a"))), "list");
        Invalid(One(step => step.Lookup("f", "F", f => f.Option("a").Default("b"))), "option values");
        Invalid(One(step => step.Lookup("f", "F", f => f.Default("anything"))), "at least one option");
        One(step => step.Duration("f", "F", f => f.Default("P1DT2H"))).Validate();
        Invalid(One(step => step.List("f", "F", f => f.Default(new object[] { "a", 1 }))), "texts");
    }

    [Fact]
    public void Initial_NamesNonSecretFieldsWithValidValues() {
        var flow = FlowSamples.MailServer();
        flow.Initial["missing"] = "x";
        Invalid(flow, "names no field");
        flow = FlowSamples.MailServer();
        flow.Initial["password"] = "x";
        Invalid(flow, "Secret field");
        flow = FlowSamples.MailServer();
        flow.Initial["port"] = "587";
        Invalid(flow, "initial value");
        flow = FlowSamples.MailServer();
        flow.Initial["security"] = "ssl";
        Invalid(flow, "option values");
        flow = FlowSamples.MailServer();
        flow.StoredSecrets.Add("user");
        Invalid(flow, "not a secret field");
        flow = FlowSamples.MailServer();
        flow.StoredSecrets.Add("password");
        flow.Initial["host"] = null;
        flow.Validate();
    }

    [Fact]
    public void Conditions_ReferenceExistingFieldsWithoutCycles() {
        Invalid(One(step => step.Text("a", "A", f => f.When(CanopyFlowCondition.IsEmpty("missing")))), "does not have");
        Invalid(One(step => step.Text("a", "A", f => f.When(CanopyFlowCondition.IsEmpty("a")))), "own visibility");
        Invalid(One(step => step.Secret("s", "S").Text("a", "A", f => f.When(CanopyFlowCondition.IsNotEmpty("s")))), "secret field");
        Invalid(One(step => step.Text("a", "A", f => f.When(CanopyFlowCondition.IsEmpty("b"))).Text("b", "B", f => f.When(CanopyFlowCondition.IsEmpty("a")))), "own visibility");
        Invalid(new CanopyFlow("flow", "A flow").Step("s", "S", step => step.When(CanopyFlowCondition.IsEmpty("a")).Text("a", "A")), "own visibility");
        Invalid(One(step => step.Section("x", "X", section => section.When(CanopyFlowCondition.Equal("b", 1)).Number("b", "B"))), "own visibility");
        One(step => step.Text("a", "A").Text("b", "B", f => f.When(CanopyFlowCondition.IsEmpty("a"))).Text("c", "C", f => f.When(CanopyFlowCondition.IsEmpty("b")))).Validate();
        new CanopyFlow("flow", "A flow").Step("one", "One", step => step.Text("a", "A")).Info("tip", "Tip").Step("two", "Two", step => step.When(CanopyFlowCondition.IsNotEmpty("a")).Text("b", "B")).Validate();
    }
}
