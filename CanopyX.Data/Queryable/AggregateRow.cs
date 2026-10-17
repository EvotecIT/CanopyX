namespace CanopyX.Data;

/// <summary>One group of a summary query: its key, record count, and up to 32 aggregate values with their nonmissing counts.</summary>
/// <remarks>Public members with fixed names let LINQ providers translate the projection; unused slots stay unset.</remarks>
internal sealed class AggregateRow<TKey> {
    public TKey Key { get; set; } = default!;
    public int Rows { get; set; }
    public double? V0 { get; set; }
    public int N0 { get; set; }
    public double? V1 { get; set; }
    public int N1 { get; set; }
    public double? V2 { get; set; }
    public int N2 { get; set; }
    public double? V3 { get; set; }
    public int N3 { get; set; }
    public double? V4 { get; set; }
    public int N4 { get; set; }
    public double? V5 { get; set; }
    public int N5 { get; set; }
    public double? V6 { get; set; }
    public int N6 { get; set; }
    public double? V7 { get; set; }
    public int N7 { get; set; }
    public double? V8 { get; set; }
    public int N8 { get; set; }
    public double? V9 { get; set; }
    public int N9 { get; set; }
    public double? V10 { get; set; }
    public int N10 { get; set; }
    public double? V11 { get; set; }
    public int N11 { get; set; }
    public double? V12 { get; set; }
    public int N12 { get; set; }
    public double? V13 { get; set; }
    public int N13 { get; set; }
    public double? V14 { get; set; }
    public int N14 { get; set; }
    public double? V15 { get; set; }
    public int N15 { get; set; }
    public double? V16 { get; set; }
    public int N16 { get; set; }
    public double? V17 { get; set; }
    public int N17 { get; set; }
    public double? V18 { get; set; }
    public int N18 { get; set; }
    public double? V19 { get; set; }
    public int N19 { get; set; }
    public double? V20 { get; set; }
    public int N20 { get; set; }
    public double? V21 { get; set; }
    public int N21 { get; set; }
    public double? V22 { get; set; }
    public int N22 { get; set; }
    public double? V23 { get; set; }
    public int N23 { get; set; }
    public double? V24 { get; set; }
    public int N24 { get; set; }
    public double? V25 { get; set; }
    public int N25 { get; set; }
    public double? V26 { get; set; }
    public int N26 { get; set; }
    public double? V27 { get; set; }
    public int N27 { get; set; }
    public double? V28 { get; set; }
    public int N28 { get; set; }
    public double? V29 { get; set; }
    public int N29 { get; set; }
    public double? V30 { get; set; }
    public int N30 { get; set; }
    public double? V31 { get; set; }
    public int N31 { get; set; }
}
