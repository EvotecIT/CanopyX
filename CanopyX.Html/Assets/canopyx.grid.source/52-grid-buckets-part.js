  DEFAULT_LABELS = Object.freeze(Object.assign({}, DEFAULT_LABELS, {
    gridBucket: "Bucket", gridBucketNone: "Exact values", gridBucketDay: "Day", gridBucketWeek: "Week", gridBucketMonth: "Month", gridBucketQuarter: "Quarter", gridBucketYear: "Year",
    gridBucketHour: "Hour of day", gridBucketWeekday: "Weekday", gridBucketWidth: "Range width", gridBucketEdges: "Range edges", gridBucketOrigin: "Range origin", gridBucketInvalid: "Enter valid bucket settings."
  }));
  const BUCKETS_PART = definePart(DataGrid, "buckets", "date and range buckets", () => ({ GRID_BUCKETS }));
  const gridUsesBuckets = view => view.reporting?.groupBy?.some(level => level.bucket) || view.facets?.columns?.some(facet => facet?.bucket) ||
    view.query?.groupBy?.some(level => level.bucket) || gridQueryUsesBucketFilters(view.query);
  function gridQueryUsesBucketFilters(query) {
    const group = node => !!node && (node.filters?.some(filter => filter.bucket) || node.groups?.some(group));
    return query?.filters?.some(filter => filter.bucket) || group(query?.filterGroup) || query?.tupleFilters?.some(tuple => tuple.columns?.some(field => field.bucket));
  }
  const BUCKET_REQUEST_PAGE = DataGrid.prototype.requestPage;
  DataGrid.prototype.requestPage = async function (query, signal) {
    if (gridQueryUsesBucketFilters(query)) await loadPart(BUCKETS_PART);
    return BUCKET_REQUEST_PAGE.call(this, query, signal);
  };
