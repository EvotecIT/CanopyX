namespace CanopyX.Tests.Protocol;

/// <summary>
/// The runtime keys nodes by id and resolves columns and icons by key, so a document that breaks those rules would
/// render wrong rows silently. Writing such a document fails in the host instead.
/// </summary>
public sealed class ViewValidationTests {
    public static TheoryData<string, string> InvalidViews() => new() {
        { "duplicate node id", "more than one node with id 'dup'" },
        { "node that contains itself", "more than one node with id 'n'" },
        { "duplicate column id", "more than one column with id 'name'" },
        { "cell for unknown column", "column 'missing'" },
        { "undeclared icon", "icon 'ghost'" },
        { "hidden tree column", "cannot be hidden" },
        { "detail with children", "a detail row must be a leaf" },
        { "detail with lazy children", "a detail row must be a leaf" },
        { "lazy node in an inline view", "needs the complete tree" },
        { "inline children fewer than child count", "inline children must be complete" },
        { "sidecar search shorter than two characters", "at least 2 characters" }
    };

    [Theory]
    [MemberData(nameof(InvalidViews))]
    public void ToJson_InvalidView_ThrowsWithTheOffendingKey(string rule, string message) {
        var view = new CanopyTreeView("v", "View");
        view.Columns.Add(new CanopyColumn("name", "Name"));
        var node = new CanopyNode("n", "Node");
        view.Roots.Add(node);
        switch (rule) {
            case "duplicate node id":
                node.Children.Add(new CanopyNode("dup", "A"));
                node.Children.Add(new CanopyNode("dup", "B"));
                break;
            case "node that contains itself":
                node.Children.Add(node);
                break;
            case "duplicate column id":
                view.Columns.Add(new CanopyColumn("name", "Again"));
                break;
            case "cell for unknown column":
                node.Cells["missing"] = 1;
                break;
            case "undeclared icon":
                node.Icon = "ghost";
                break;
            case "hidden tree column":
                view.Columns[0].Hidden = true;
                break;
            case "detail with children":
                node.Detail = new CanopyHtmlDetail("<p>x</p>");
                node.Children.Add(new CanopyNode("c", "Child"));
                break;
            case "detail with lazy children":
                node.Detail = new CanopyHtmlDetail("<p>x</p>");
                node.HasChildren = true;
                break;
            case "lazy node in an inline view":
                node.HasChildren = true;
                break;
            case "inline children fewer than child count":
                node.Children.Add(new CanopyNode("c", "Child"));
                node.ChildCount = 240;
                break;
            case "sidecar search shorter than two characters":
                view.Source = CanopySource.Sidecar("data/v");
                view.Search = new CanopySearchOptions { MinLength = 1 };
                break;
        }

        var error = Assert.Throws<InvalidOperationException>(() => view.ToJson());
        Assert.Contains(message, error.Message);
    }

    [Fact]
    public void ToJson_PageWithDuplicateIds_Throws() {
        var page = new CanopyPage("p");
        page.Items.Add(new CanopyNode("a", "A"));
        page.Items.Add(new CanopyNode("a", "A again"));

        Assert.Throws<InvalidOperationException>(() => page.ToJson());
    }

    [Fact]
    public void ToJson_PageTotalBelowShownItems_Throws() {
        var page = new CanopyPage("p") { Offset = 10, Total = 10 };
        page.Items.Add(new CanopyNode("a", "A"));

        Assert.Throws<InvalidOperationException>(() => page.ToJson());
    }

    [Fact]
    public void Setters_EmptyReferenceOrContinuation_Throw() {
        // An empty value means "top level" or "first page" on the wire, so it cannot also mean a real reference.
        Assert.Throws<ArgumentException>(() => new CanopyNode("a", "A").Ref = "");
        Assert.Throws<ArgumentException>(() => new CanopyPage("p").Next = "");
        Assert.Throws<ArgumentException>(() => new CanopyPage(""));
    }

    [Theory]
    [InlineData("api/children?ref={ref}", null)]
    [InlineData("api/children?ref={ref}&cursor={cursor}", "api/search?limit={limit}")]
    public void Remote_TemplateWithoutPlaceholder_Throws(string children, string? search) {
        Assert.Throws<ArgumentException>(() => CanopySource.Remote(children, search));
    }
}
