namespace CanopyX.Data.Tests;

/// <summary>A small record keyed by a GUID or by text, for record identity tests.</summary>
public sealed class Tag {
    public Guid Id { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Note { get; set; } = string.Empty;

    public static CanopyRemoteHandler Handler(bool guidKey, IReadOnlyList<Tag> tags, bool queryable, bool caseInsensitive) {
        var view = new CanopyDataGridView("tags", "Tags") { Source = CanopyGridSource.HostedOffset() };
        view.Columns.Add(new CanopyColumn("code", "Code"));
        view.Record = new CanopyRecordPanel { Source = CanopyRecordSource.Host() };
        view.Record.Fields.Add(new CanopyColumn("note", "Note"));
        var columns = new CanopyColumnMap<Tag>(view).Column("code", tag => tag.Code);
        columns = guidKey ? columns.Key(tag => tag.Id) : columns.Key(tag => tag.Code);
        var records = new CanopyRecordMap<Tag>(columns).Field("note", tag => tag.Note);
        var source = caseInsensitive ? CaseInsensitiveQueryable.Create(tags) : tags.AsQueryable();
        ICanopyRecordProvider provider = queryable ? new CanopyQueryableRecordProvider<Tag>(() => source, records) : new CanopyInMemoryRecordProvider<Tag>(records, () => tags);
        return new CanopyRemoteHandler(columns.Schema, new CanopyQueryableProvider<Tag>(tags.AsQueryable(), columns), null, null, provider);
    }

    public static string Query(string id) => "{\"view\":\"tags\",\"id\":" + RandomQueries.Json(id) + "}";
}
