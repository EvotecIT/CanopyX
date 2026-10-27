using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;

namespace CanopyX.Rendering;

public static partial class CanopyStaticHtml {
    /// <summary>
    /// Renders a propagation view for email, print and Office as a script-free table with inline styles: the overall state and summary,
    /// then a row per replica with its state as a symbol and its label (a tint where the change is late or failed, so no state relies on
    /// colour alone), when the change was first seen there and how long after the change, when it last reported, and its note. Replicas
    /// with a group show under its heading. Times are in UTC.
    /// </summary>
    /// <param name="view">The propagation view.</param>
    /// <param name="options">Caption (the view label by default), row limit, theme, culture and link to the full report.</param>
    /// <returns>The fallback table.</returns>
    /// <exception cref="ArgumentNullException"><paramref name="view"/> is null.</exception>
    /// <exception cref="InvalidOperationException">The view is not valid.</exception>
    public static string RenderPropagation(CanopyPropagation view, CanopyStaticHtmlOptions? options = null) {
        if (view == null) throw new ArgumentNullException(nameof(view));
        view.Validate();
        var parentLabels = view.Labels;
        var snapshot = view.TimeSlider?.SelectedSnapshot;
        if (snapshot != null) view = snapshot.View;
        var settings = options ?? new CanopyStaticHtmlOptions();
        var styles = new CanopyStaticStyles(settings);
        var labels = view.Labels ?? parentLabels ?? new CanopyLabels();
        var start = view.Start ?? view.Witnesses.Where(witness => witness.FirstSeen.HasValue).Select(witness => witness.FirstSeen!.Value).DefaultIfEmpty().Min();
        var html = new StringBuilder(512 + view.Witnesses.Count * 300);
        html.Append("<table cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"").Append(styles.Table).Append(CanopyStaticStyles.PrintColors).Append("\">");
        var caption = settings.Caption ?? view.Label;
        if (caption.Length != 0 || snapshot != null) {
            html.Append("<caption style=\"").Append(styles.Caption).Append("\">").Append(Encode(caption));
            if (snapshot != null) {
                var at = snapshot.At.UtcDateTime.ToString("O", CultureInfo.InvariantCulture);
                if (caption.Length != 0) html.Append("<br>");
                html.Append("<span style=\"").Append(styles.MutedText).Append("font-weight:400;\">");
                if (snapshot.Label != null) html.Append(Encode(snapshot.Label)).Append(" · ");
                html.Append("<time datetime=\"").Append(Encode(at)).Append("\">").Append(Encode(CanopyChangeFormat.HumanTime(snapshot.At, labels, settings.Culture))).Append("</time></span>");
            }

            html.Append("</caption>");
        }
        var overall = CanopyChangeFormat.State(view.OverallState, labels);
        var converged = view.Witnesses.Count(witness => witness.State == CanopyPropagationState.Converged);
        var summary = view.Summary ?? labels.ChangeProgress.Replace("{converged}", converged.ToString("N0", settings.Culture)).Replace("{total}", view.Witnesses.Count.ToString("N0", settings.Culture));
        html.Append("<thead><tr><td colspan=\"4\" style=\"").Append(styles.Note).Append("font-size:13px;\"><span style=\"").Append(StateStyle(view.OverallState, styles))
            .Append("padding:1px 6px;border-radius:3px;\">").Append(overall.Symbol).Append(' ').Append(Encode(overall.Label)).Append("</span> ").Append(Encode(summary)).Append("</td></tr><tr>");
        foreach (var title in new[] { view.Title ?? labels.ChangeReplica, labels.ChangeState, labels.ChangeFirstSeen, labels.ChangeLastSeen })
            html.Append("<th scope=\"col\" style=\"").Append(styles.Header).Append("\">").Append(Encode(title)).Append("</th>");
        html.Append("</tr></thead>");
        var groups = new List<(string? Group, List<CanopyPropagationWitness> Members)>();
        foreach (var witness in view.Witnesses) {
            var at = groups.FindIndex(group => group.Group == witness.Group);
            if (at < 0) groups.Add((witness.Group, new List<CanopyPropagationWitness> { witness })); else groups[at].Members.Add(witness);
        }

        var shown = 0;
        foreach (var (group, members) in groups) {
            if (shown >= settings.MaxRows) break;
            html.Append("<tbody>");
            if (group != null) {
                var count = CanopyPlural.Pick(view.GroupCount ?? "{count}", members.Count, settings.Culture).Replace("{count}", members.Count.ToString("N0", settings.Culture));
                html.Append("<tr><th scope=\"rowgroup\" colspan=\"4\" style=\"").Append(styles.GroupHeading).Append("\">").Append(Encode(group))
                    .Append(" <span style=\"").Append(styles.MutedText).Append("\">· ").Append(Encode(count)).Append("</span></th></tr>");
            }

            foreach (var witness in members) {
                if (shown >= settings.MaxRows) break;
                shown++;
                var state = CanopyChangeFormat.State(witness.State, labels);
                html.Append("<tr><th scope=\"row\" style=\"").Append(styles.Cell).Append("text-align:left;font-weight:600;\">").Append(Encode(witness.Label));
                if (witness.Source) html.Append(" <span style=\"").Append(styles.Badge(CanopyTone.Neutral)).Append("\">").Append(Encode(labels.ChangeSource)).Append("</span>");
                if (witness.Secondary != null) html.Append("<br><span style=\"").Append(styles.MutedText).Append("\">").Append(Encode(witness.Secondary)).Append("</span>");
                html.Append("</th><td style=\"").Append(styles.Cell).Append(StateStyle(witness.State, styles)).Append("white-space:nowrap;\">").Append(state.Symbol).Append(' ').Append(Encode(state.Label));
                if (witness.Note != null) html.Append("<br><span style=\"").Append(styles.MutedText).Append("\">").Append(Encode(witness.Note)).Append("</span>");
                html.Append("</td><td style=\"").Append(styles.Cell).Append("white-space:nowrap;\">");
                if (witness.FirstSeen.HasValue) {
                    html.Append(Encode(CanopyChangeFormat.HumanTime(witness.FirstSeen.Value, labels, settings.Culture)));
                    if (start != default && !witness.Source) html.Append(" <span style=\"").Append(styles.MutedText).Append("\">")
                        .Append(Encode(labels.ChangeDelay.Replace("{duration}", CanopyChangeFormat.Duration(witness.FirstSeen.Value - start, labels, settings.Culture)))).Append("</span>");
                } else {
                    html.Append("<span style=\"").Append(styles.MutedText).Append("\">").Append(Encode(labels.ChangeNotSeen)).Append("</span>");
                }

                html.Append("</td><td style=\"").Append(styles.Cell).Append("white-space:nowrap;\">").Append(witness.LastSeen.HasValue ? Encode(CanopyChangeFormat.HumanTime(witness.LastSeen.Value, labels, settings.Culture)) : string.Empty).Append("</td></tr>");
            }

            html.Append("</tbody>");
        }

        if (shown < view.Witnesses.Count) { html.Append("<tbody>"); AppendOverflow(html, shown, view.Witnesses.Count, 4, settings, styles, labels); html.Append("</tbody>"); }
        return html.Append("</table>").ToString();
    }

    /// <summary>A state's look: a tint where the change is late or failed, the tone's colour for the others.</summary>
    private static string StateStyle(CanopyPropagationState state, CanopyStaticStyles styles) =>
        styles.StateText(CanopyChangeFormat.State(state, new CanopyLabels()).Tone, state == CanopyPropagationState.Fault || state == CanopyPropagationState.Propagating);
}
