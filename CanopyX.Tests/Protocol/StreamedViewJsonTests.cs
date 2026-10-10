using System.Security.Cryptography;
using System.Text;
using Xunit;

namespace CanopyX.Tests.Protocol;

/// <summary>
/// Hosts hash and store the view document without building it as one string (a sidecar folder name, for example, is
/// the hash of the document), so the streamed document must be exactly the text of <see cref="CanopyTreeView.ToJson()"/>.
/// The .NET Framework test project runs these too: the writer passes its text on differently there.
/// </summary>
public sealed class StreamedViewJsonTests {
    public static TheoryData<string> Views => new() { "hostile", "unicode", "empty", "filters", "details", "large", "sidecar" };

    [Theory]
    [MemberData(nameof(Views))]
    public void WriteJson_Stream_WritesTheUtf8BytesOfToJson(string name) {
        var view = Create(name);
        var expected = Encoding.UTF8.GetBytes(view.ToJson());

        using var stream = new MemoryStream();
        view.WriteJson(stream);

        Assert.Equal(expected, stream.ToArray());
    }

    [Theory]
    [MemberData(nameof(Views))]
    public void WriteJson_TextWriter_WritesTheTextOfToJson(string name) {
        var view = Create(name);
        var writer = new StringWriter();

        view.WriteJson(writer);

        Assert.Equal(view.ToJson(), writer.ToString());
    }

    [Theory]
    [MemberData(nameof(Views))]
    public void WriteJson_HashedStream_HasTheHashOfTheString(string name) {
        var view = Create(name);
        using var sha = SHA256.Create();
        var expected = sha.ComputeHash(Encoding.UTF8.GetBytes(view.ToJson()));

        using var hash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
        using (var sink = new HashStream(hash)) {
            view.WriteJson(sink);
        }

        Assert.Equal(expected, hash.GetHashAndReset());
    }

    [Fact]
    public void WriteJson_HiddenFilters_WritesTheTextOfToJsonWithThem() {
        var view = Create("filters");
        var hidden = new[] { "changed" };
        var writer = new StringWriter();
        using var stream = new MemoryStream();

        view.WriteJson(writer, hidden);
        view.WriteJson(stream, hidden);

        Assert.Equal(view.ToJson(hidden), writer.ToString());
        Assert.Equal(Encoding.UTF8.GetBytes(view.ToJson(hidden)), stream.ToArray());
    }

    [Fact]
    public void WriteJson_Stream_LeavesTheStreamOpenWithoutAByteOrderMark() {
        var view = Create("unicode");
        using var stream = new MemoryStream();

        view.WriteJson(stream);
        stream.WriteByte((byte)'\n');

        Assert.Equal((byte)'{', stream.ToArray()[0]);
    }

    [Fact]
    public void WriteJson_InvalidView_ThrowsBeforeWritingAnything() {
        var view = new CanopyTreeView("v", "View");
        view.Columns.Add(new CanopyColumn("name", "Name"));
        view.Columns.Add(new CanopyColumn("name", "Again"));
        view.Roots.Add(new CanopyNode("a", "A"));
        using var stream = new MemoryStream();

        Assert.Throws<InvalidOperationException>(() => view.WriteJson(stream));
        Assert.Throws<InvalidOperationException>(() => view.WriteJson(new StringWriter(), new[] { "missing" }));
        Assert.Equal(0, stream.Length);
    }

    [Fact]
    public void WriteJson_NullTarget_Throws() {
        var view = Create("empty");

        Assert.Throws<ArgumentNullException>(() => view.WriteJson((Stream)null!));
        Assert.Throws<ArgumentNullException>(() => view.WriteJson((TextWriter)null!));
    }

    private static CanopyTreeView Create(string name) {
        var view = new CanopyTreeView("view-" + name, "View " + name);
        view.Columns.Add(new CanopyColumn("name", "Name"));
        view.Columns.Add(new CanopyColumn("size", "Size") { Kind = CanopyColumnKind.Number });
        view.Columns.Add(new CanopyColumn("when", "When") { Kind = CanopyColumnKind.DateTime });
        switch (name) {
            case "hostile":
                view.Icons["i"] = "<svg viewBox=\"0 0 1 1\"><path d=\"M0 0\"/></svg>";
                view.Roots.Add(new CanopyNode("</script>", "<!-- & \"q\" \\ \u2028\u2029 \t\r\n\b\f `${x}` $ {") { Icon = "i", ClassName = "a&b" });
                view.Roots.Add(new CanopyNode("lone", "broken \uD800 and \uDC00 end \uD83D"));
                break;
            case "unicode":
                view.Labels.SearchPlaceholder = "Szukaj — zażółć gęślą jaźń";
                view.Roots.Add(new CanopyNode("u", "😀 日本語 Ünïcödé Ελληνικά עברית \u0000\u001F\u007F\u0080￿"));
                break;
            case "empty":
                break;
            case "filters":
                view.Filters.Add(new CanopyFilter("changed", "Changed", "changed"));
                view.Filters.Add(new CanopyFilter("stale", "Stale", "stale"));
                var flagged = new CanopyNode("f", "Flagged");
                flagged.Flags.Add("changed");
                view.Roots.Add(flagged);
                break;
            case "details":
                var parent = new CanopyNode("p", "Parent") { Expanded = true };
                var table = new CanopyTableDetail("Changes <b>").AddColumns("Setting", "Before", "After");
                table.ColumnWidths.Add(3);
                table.ColumnWidths.Add(1);
                table.ColumnWidths.Add(1);
                table.AddRow("Password length", 8, new CanopyCell("14") { Tone = CanopyTone.Success, Title = "raised" });
                table.AddRow("Lockout & reset", null!, DateTime.SpecifyKind(new DateTime(2026, 10, 7, 4, 53, 31), DateTimeKind.Utc));
                parent.Children.Add(new CanopyNode("p/t", "Table") { Detail = table });
                parent.Children.Add(new CanopyNode("p/h", "Html") { Detail = new CanopyHtmlDetail("<p>trusted & \"raw\"</p>") { Height = 3 } });
                parent.Children.Add(new CanopyNode("p/x", "Properties") { Detail = new CanopyPropertiesDetail().Add("Owner", "Team ${a}").Add("Size", 1.5) });
                view.Roots.Add(parent);
                break;
            case "large":
                // Many times the streaming writer's piece size, with values that straddle piece boundaries.
                var random = new Random(7);
                for (var r = 0; r < 20; r++) {
                    var root = new CanopyNode("r" + r, "Root " + r + " Łódź 😀");
                    for (var c = 0; c < 1500; c++) {
                        var child = new CanopyNode(root.Id + "/" + c, new string((char)('a' + c % 26), random.Next(1, 400)) + " 😀 <&> \u2028");
                        child.Cells["size"] = random.Next();
                        child.Cells["when"] = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc).AddSeconds(random.Next());
                        if (c % 7 == 0) child.Badges.Add(new CanopyBadge("new", CanopyTone.Info));
                        if (c % 11 == 0) child.Data["k"] = "v" + c;
                        if (c % 13 == 0) {
                            var detail = new CanopyTableDetail().AddColumns("A", "B");
                            detail.AddRow(new string('x', random.Next(1, 5000)), c);
                            child.Children.Add(new CanopyNode(child.Id + "/d", "Detail") { Detail = detail });
                        }

                        root.Children.Add(child);
                    }

                    view.Roots.Add(root);
                }

                break;
            case "sidecar":
                view.Search = new CanopySearchOptions();
                view.Roots.Add(new CanopyNode("s", "Kept in memory"));
                view.Source = CanopySource.Sidecar("data/tree");
                break;
        }

        return view;
    }

    private sealed class HashStream : Stream {
        private readonly IncrementalHash _hash;

        internal HashStream(IncrementalHash hash) {
            _hash = hash;
        }

        public override bool CanRead => false;

        public override bool CanSeek => false;

        public override bool CanWrite => true;

        public override long Length => throw new NotSupportedException();

        public override long Position { get => throw new NotSupportedException(); set => throw new NotSupportedException(); }

        public override void Flush() {
        }

        public override int Read(byte[] buffer, int offset, int count) => throw new NotSupportedException();

        public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();

        public override void SetLength(long value) => throw new NotSupportedException();

        public override void Write(byte[] buffer, int offset, int count) => _hash.AppendData(buffer, offset, count);
    }
}
