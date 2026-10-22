using System;
using System.Collections.Generic;

namespace CanopyX;

/// <summary>
/// How one change reached its replicas (docs/changes.md): a summary with a count of each state, then a row per replica with its
/// state, when the change was first seen there and how long after the change, when it last reported, and a lane that draws the
/// delay against the time since the change. It reads as a compact table on wide screens and as stacked rows on phones.
/// </summary>
/// <remarks>The document is checked when it is written (<see cref="Validate"/>, <see cref="ToJson"/> and the writers); <see cref="FromJson"/> reads one back.</remarks>
public sealed partial class CanopyPropagation {
    /// <summary>The most replicas a view holds.</summary>
    public const int MaxWitnesses = 2000;

    /// <summary>Creates a propagation view.</summary>
    /// <param name="id">Its identity; a nonempty identifier of at most 256 characters.</param>
    /// <param name="label">Its accessible name, such as "Propagation of Logon.ps1": plain text of at most 200 characters.</param>
    /// <exception cref="ArgumentException"><paramref name="id"/> is empty.</exception>
    public CanopyPropagation(string id, string label) {
        CanopyIdentifiers.Require(id, nameof(id));
        Id = id;
        Label = label;
    }

    /// <summary>Gets the view's identity.</summary>
    public string Id { get; }

    /// <summary>Gets or sets the accessible name.</summary>
    public string Label { get; set; }

    /// <summary>Gets or sets when the change happened or was first seen anywhere; the delays count from it. Null takes the earliest first sighting.</summary>
    public DateTimeOffset? Start { get; set; }

    /// <summary>Gets or sets when the view's evidence is from; the lanes end there. Null takes the latest sighting or report.</summary>
    public DateTimeOffset? AsOf { get; set; }

    /// <summary>Gets or sets the overall state; null takes the worst replica's (fault, then propagating, then unknown, then converged).</summary>
    public CanopyPropagationState? State { get; set; }

    /// <summary>Gets or sets the host's one-sentence summary, such as "Seen on 3 of 5 domain controllers"; null writes a count of each state. At most 500 characters.</summary>
    public string? Summary { get; set; }

    /// <summary>Gets or sets the title of the replica column, such as "Domain controller"; the <c>changeReplica</c> label when null.</summary>
    public string? Title { get; set; }

    /// <summary>
    /// Gets or sets how a group heading counts its replicas, with <c>{count}</c> and optionally plural forms, such as
    /// <c>"[one]{count} domain controller[other]{count} domain controllers"</c>; the count alone when null.
    /// </summary>
    public string? GroupCount { get; set; }

    /// <summary>Gets the replicas, at most <see cref="MaxWitnesses"/>, in the order they show within their groups.</summary>
    public IList<CanopyPropagationWitness> Witnesses { get; } = new List<CanopyPropagationWitness>();

    /// <summary>Gets or sets the time zone of the times; UTC by default.</summary>
    public CanopyTimeZone TimeZone { get; set; }

    /// <summary>Gets or sets the translations of the texts the view writes itself; the document carries those that differ from English.</summary>
    public CanopyLabels? Labels { get; set; }

    /// <summary>Adds a replica and returns it.</summary>
    /// <param name="id">Its identity in the view.</param>
    /// <param name="label">Its name.</param>
    /// <param name="state">Where the change stands there.</param>
    /// <returns>The replica.</returns>
    public CanopyPropagationWitness Witness(string id, string label, CanopyPropagationState state) {
        var witness = new CanopyPropagationWitness(id, label, state);
        Witnesses.Add(witness);
        return witness;
    }

    /// <summary>Gets the overall state: <see cref="State"/>, or the worst replica's when it is null.</summary>
    public CanopyPropagationState OverallState {
        get {
            if (State.HasValue) return State.Value;
            var worst = CanopyPropagationState.Converged;
            foreach (var witness in Witnesses) if (Rank(witness.State) > Rank(worst)) worst = witness.State;
            return worst;
        }
    }

    /// <summary>How bad a state is: fault, then propagating, then unknown, then converged.</summary>
    internal static int Rank(CanopyPropagationState state) => state switch {
        CanopyPropagationState.Fault => 3,
        CanopyPropagationState.Propagating => 2,
        CanopyPropagationState.Unknown => 1,
        _ => 0
    };

    /// <summary>Checks the view as the writers do.</summary>
    /// <exception cref="InvalidOperationException">The view is not valid; the message names the first problem.</exception>
    public void Validate() => CanopyChangeValidator.Validate(this);
}
