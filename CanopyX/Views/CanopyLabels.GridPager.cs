namespace CanopyX;

public sealed partial class CanopyLabels {
    /// <summary>Gets or sets the pager's result sentence (<see cref="CanopyGridPagerInfo.Sentence"/>), using <c>{first}</c>, <c>{last}</c> and <c>{count}</c>. Default "Showing {first} to {last} of {count} rows".</summary>
    public string GridPageInfo { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the pager's result sentence while a search or filter narrows the rows, using <c>{first}</c>, <c>{last}</c>, <c>{count}</c> and the unfiltered <c>{total}</c>. Default "Showing {first} to {last} of {count} rows (filtered from {total})".</summary>
    public string GridPageInfoFiltered { get => Get(); set => Set(value); }

    /// <summary>Gets or sets the accessible name of a numbered page button (<see cref="CanopyGridPager.PageNumbers"/>), using <c>{page}</c>. Default "Page {page}".</summary>
    public string GridPageButton { get => Get(); set => Set(value); }
}
