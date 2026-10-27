using System.Threading;
using System.Threading.Tasks;

namespace CanopyX.Data;

/// <summary>An optional complete-query pivot capability; pages are never used as a pivot input.</summary>
public interface ICanopyPivotProvider {
    /// <summary>Computes both axes, exact prefix totals and a bounded column set.</summary>
    /// <param name="request">The accepted query and allow-listed pivot definition.</param>
    /// <param name="cancellationToken">Cancels store reads and computation.</param>
    /// <returns>The complete pivot result.</returns>
    ValueTask<CanopyPivotResult> PivotAsync(CanopyPivotRequest request, CancellationToken cancellationToken);
}
