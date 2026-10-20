using System.Text.Json;

namespace CanopyX.Tests.Flows;

/// <summary>Flow conditions: the shared fixtures the browser evaluator also passes, the factories, the bounds and the visibility rules.</summary>
public sealed class FlowConditionTests {
    public static IEnumerable<object[]> Fixtures() {
        using var document = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", "flow-conditions.json")));
        foreach (var item in document.RootElement.EnumerateArray()) {
            yield return new object[] { item.GetProperty("name").GetString()!, item.GetProperty("condition").GetRawText(), item.GetProperty("values").GetRawText(), item.GetProperty("expected").GetBoolean() };
        }
    }

    [Fact]
    public void Fixtures_CoverEveryOperatorAndJunction() {
        var text = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", "flow-conditions.json"));
        Assert.True(Fixtures().Count() >= 40);
        foreach (var name in new[] { "eq", "ne", "gt", "ge", "lt", "le", "contains", "notContains", "startsWith", "endsWith", "matches", "notMatches", "in", "notIn", "between", "isNull", "isNotNull" })
            Assert.Contains("\"operator\": \"" + name + "\"", text);
        foreach (var junction in new[] { "and", "or", "none" }) Assert.Contains("\"operator\": \"" + junction + "\"", text);
    }

    [Theory]
    [MemberData(nameof(Fixtures))]
    public void Evaluate_SharedFixture_MatchesExpected(string name, string condition, string values, bool expected) {
        var parsed = CanopyFlowCondition.FromContract(condition);
        using var document = JsonDocument.Parse(values);
        var answers = (Dictionary<string, object?>)FlowSamples.Plain(document.RootElement)!;
        Assert.True(expected == parsed.Evaluate(answers), name);
        // The written form reads back to the same condition.
        Assert.Equal(parsed.ToContract(), CanopyFlowCondition.FromContract(parsed.ToContract()).ToContract());
    }

    [Fact]
    public void Evaluate_ReadsClrValues() {
        var values = new Dictionary<string, object?> {
            ["count"] = 5, ["big"] = 12.5m, ["when"] = new DateTimeOffset(2026, 3, 1, 12, 0, 0, TimeSpan.FromHours(1)),
            ["window"] = TimeSpan.FromMinutes(90), ["tags"] = new[] { "a", "b" }, ["flag"] = true
        };
        Assert.True(CanopyFlowCondition.Equal("count", 5.0).Evaluate(values));
        Assert.True(CanopyFlowCondition.GreaterThan("big", 12).Evaluate(values));
        Assert.True(CanopyFlowCondition.Equal("when", "2026-03-01T11:00:00Z").Evaluate(values));
        Assert.True(CanopyFlowCondition.Equal("window", "PT1H30M").Evaluate(values));
        Assert.True(CanopyFlowCondition.Contains("tags", "B").Evaluate(values));
        Assert.True(CanopyFlowCondition.Equal("flag", true).Evaluate(values));
        Assert.False(CanopyFlowCondition.NotEqual("missing", "x").Evaluate(values));
        Assert.True(CanopyFlowCondition.IsEmpty("missing").Evaluate(values));
    }

    [Fact]
    public void Matches_TestsTheFirst4096CodeUnits() {
        var condition = CanopyFlowCondition.Matches("text", "z");
        Assert.True(condition.Evaluate(new Dictionary<string, object?> { ["text"] = new string('a', 4095) + "Z" }));
        Assert.False(condition.Evaluate(new Dictionary<string, object?> { ["text"] = new string('a', 4096) + "z" }));
        Assert.True(CanopyFlowCondition.NotMatches("text", "z").Evaluate(new Dictionary<string, object?> { ["text"] = new string('a', 4096) + "z" }));
    }

    [Fact]
    public void Factories_CheckTheirValues() {
        Assert.Throws<ArgumentException>(() => CanopyFlowCondition.Equal("1x", "a"));
        Assert.Throws<ArgumentException>(() => CanopyFlowCondition.Equal("a", new object()));
        Assert.Throws<ArgumentException>(() => CanopyFlowCondition.Equal("a", null!));
        Assert.Throws<ArgumentException>(() => CanopyFlowCondition.GreaterThan("a", true));
        Assert.Throws<ArgumentException>(() => CanopyFlowCondition.Equal("a", new string('x', 4097)));
        Assert.Throws<ArgumentException>(() => CanopyFlowCondition.In("a"));
        Assert.Throws<ArgumentException>(() => CanopyFlowCondition.In("a", Enumerable.Range(0, 1001).Cast<object>().ToArray()));
        Assert.Throws<ArgumentException>(() => CanopyFlowCondition.Between("a", 5, 1));
        Assert.Throws<ArgumentException>(() => CanopyFlowCondition.Between("a", 1, "5"));
        Assert.Throws<ArgumentException>(() => CanopyFlowCondition.Matches("a", "(a|b)"));
        Assert.Throws<ArgumentException>(() => CanopyFlowCondition.Matches("a", "a+"));
        Assert.Throws<ArgumentException>(() => CanopyFlowCondition.All());
        Assert.Throws<ArgumentException>(() => CanopyFlowCondition.Any(CanopyFlowCondition.IsEmpty("a"), null!));
        var between = CanopyFlowCondition.Between("a", 1, 10);
        Assert.False(between.IsGroup);
        Assert.Equal(CanopyFlowOperator.Between, between.Operator);
        Assert.Equal(new object[] { 1d, 10d }, between.Values);
        Assert.Equal("{\"operator\":\"and\",\"filters\":[{\"field\":\"a\",\"operator\":\"between\",\"values\":[1,10]}]}", between.ToContract());
    }

    [Fact]
    public void Groups_WritePredicatesThenGroups() {
        var condition = CanopyFlowCondition.None(CanopyFlowCondition.Any(CanopyFlowCondition.IsEmpty("a")), CanopyFlowCondition.In("b", "x", 2, false));
        Assert.Equal("{\"operator\":\"none\",\"filters\":[{\"field\":\"b\",\"operator\":\"in\",\"values\":[\"x\",2,false]}],\"groups\":[{\"operator\":\"or\",\"filters\":[{\"field\":\"a\",\"operator\":\"isNull\"}]}]}", condition.ToContract());
    }

    [Fact]
    public void Bounds_AreEightLevels64Groups64Predicates() {
        var deep = CanopyFlowCondition.IsEmpty("a");
        for (var level = 0; level < 9; level++) deep = CanopyFlowCondition.All(deep);
        Assert.Throws<InvalidOperationException>(() => deep.ToContract());
        var fine = CanopyFlowCondition.IsEmpty("a");
        for (var level = 0; level < 8; level++) fine = CanopyFlowCondition.All(fine);
        Assert.NotNull(CanopyFlowCondition.FromContract(fine.ToContract()));
        var many = CanopyFlowCondition.All(Enumerable.Range(0, 65).Select(index => CanopyFlowCondition.IsEmpty("a")).ToArray());
        Assert.Throws<InvalidOperationException>(() => many.ToContract());
        var groups = CanopyFlowCondition.All(Enumerable.Range(0, 64).Select(index => CanopyFlowCondition.Any(CanopyFlowCondition.IsEmpty("a"))).ToArray());
        Assert.Throws<InvalidOperationException>(() => groups.ToContract());
        Assert.Throws<InvalidOperationException>(() => CanopyFlowCondition.FromContract("{\"operator\":\"and\"}"));
        Assert.Throws<InvalidOperationException>(() => CanopyFlowCondition.FromContract("{\"operator\":\"and\",\"filters\":[{\"field\":\"a\",\"operator\":\"like\",\"values\":[\"x\"]}]}"));
        Assert.Throws<InvalidOperationException>(() => CanopyFlowCondition.FromContract("{\"operator\":\"and\",\"filters\":[{\"field\":\"a\",\"operator\":\"isNull\",\"values\":[1]}]}"));
        Assert.Throws<InvalidOperationException>(() => CanopyFlowCondition.FromContract("{\"operator\":\"and\",\"filters\":[{\"field\":\"a\",\"operator\":\"eq\",\"values\":[null]}]}"));
    }

    [Fact]
    public void VisibleValues_DropsHiddenStepsFieldsAndSecrets() {
        var flow = FlowSamples.MailServer();
        var answers = new Dictionary<string, object?> {
            ["host"] = "mail.example.com", ["port"] = 587, ["security"] = "none", ["user"] = "sender", ["password"] = "hunter2", ["verify"] = true, ["unknown"] = 1
        };
        var visible = flow.VisibleValues(answers);
        Assert.Equal(new[] { "host", "port", "security", "user" }, visible.Keys);
        answers["security"] = "tls";
        Assert.Equal(new[] { "host", "port", "security", "user", "verify" }, flow.VisibleValues(answers).Keys);
        Assert.Same(answers["host"], flow.VisibleValues(answers)["host"]);
    }

    [Fact]
    public void VisibleValues_ReadsHiddenFieldsAsEmpty() {
        var flow = new CanopyFlow("flow", "A flow")
            .Step("one", "One", step => step
                .Toggle("advanced", "Advanced")
                .Text("proxy", "Proxy", f => f.When(CanopyFlowCondition.Equal("advanced", true)))
                .Text("port", "Proxy port", f => f.When(CanopyFlowCondition.IsNotEmpty("proxy")))
                .Text("direct", "Direct", f => f.When(CanopyFlowCondition.IsEmpty("proxy"))))
            .Step("two", "Two", step => step
                .When(CanopyFlowCondition.IsNotEmpty("port"))
                .Section("auth", "Authentication", section => section.Text("login", "Login")));
        var answers = new Dictionary<string, object?> { ["advanced"] = false, ["proxy"] = "relay", ["port"] = "8080", ["direct"] = "yes", ["login"] = "me" };
        // The proxy keeps its answer while hidden, but reads as empty: its port hides, "direct" shows, and step two hides.
        Assert.Equal(new[] { "advanced", "direct" }, flow.VisibleValues(answers).Keys);
        answers["advanced"] = true;
        Assert.Equal(new[] { "advanced", "proxy", "port", "login" }, flow.VisibleValues(answers).Keys);
    }

    [Fact]
    public void VisibleValues_ReadsAnswersByFieldKind() {
        var flow = new CanopyFlow("flow", "A flow").Step("s", "S", step => step
            .Date("start", "Start")
            .Text("late", "Late", f => f.When(CanopyFlowCondition.GreaterOrEqual("start", "2026-06-01")))
            .Duration("window", "Window")
            .Text("long", "Long", f => f.When(CanopyFlowCondition.Equal("window", "PT2H"))));
        var visible = flow.VisibleValues(new Dictionary<string, object?> { ["start"] = new DateTime(2026, 7, 1), ["late"] = "x", ["window"] = TimeSpan.FromMinutes(120), ["long"] = "y" });
        Assert.Equal(new[] { "start", "late", "window", "long" }, visible.Keys);
    }
}
