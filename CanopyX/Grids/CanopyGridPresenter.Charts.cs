using System;

namespace CanopyX;

public sealed partial class CanopyGridPresenter {
    /// <summary>Gets the authored comparison target for a bullet cell.</summary>
    public double Target { get; private set; }
    internal bool UsesChartRenderer => Kind == CanopyGridPresenterKind.SparklineArea || Kind == CanopyGridPresenterKind.SparklineColumns
        || Kind == CanopyGridPresenterKind.SparklineWinLoss || Kind == CanopyGridPresenterKind.Bullet;

    /// <summary>Creates an optional ChartForgeX area chart from the cell's numeric history.</summary>
    public static CanopyGridPresenter SparklineArea() => new(CanopyGridPresenterKind.SparklineArea);
    /// <summary>Creates an optional ChartForgeX column chart from the cell's numeric history.</summary>
    public static CanopyGridPresenter SparklineColumns() => new(CanopyGridPresenterKind.SparklineColumns);
    /// <summary>Creates an optional ChartForgeX sign chart from the cell's numeric history.</summary>
    public static CanopyGridPresenter SparklineWinLoss() => new(CanopyGridPresenterKind.SparklineWinLoss);
    /// <summary>Creates an optional ChartForgeX comparison of the numeric cell value with a target.</summary>
    /// <param name="target">The finite target in the same units as the cell value.</param>
    public static CanopyGridPresenter Bullet(double target) {
        if (!Safe(target)) throw new ArgumentOutOfRangeException(nameof(target));
        return new(CanopyGridPresenterKind.Bullet) { Target = target };
    }
}
