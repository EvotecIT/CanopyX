using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

/// <summary>
/// The equivalent command of a flow (<see cref="CanopyFlow.Command"/>): the review page and the proposal show the answers as a command
/// line, by each field's <see cref="CanopyFlowField.ParameterName"/>, with ConsoleMonster's rules (see "The equivalent command" in
/// docs/flow.md). Secrets that were typed read <c>&lt;secret&gt;</c>, never their value.
/// </summary>
public sealed class CanopyFlowCommand {
    /// <summary>Creates a command.</summary>
    /// <param name="name">The command's name, for example <c>Set-NotificationMail</c>.</param>
    /// <param name="style">How parameters are written.</param>
    public CanopyFlowCommand(string name, CanopyFlowCommandStyle style = CanopyFlowCommandStyle.PowerShell) {
        Name = name;
        Style = style;
    }

    /// <summary>Gets or sets the command's name. Plain text of at most 200 characters, without control characters.</summary>
    public string Name { get; set; }

    /// <summary>Gets or sets how parameters are written.</summary>
    public CanopyFlowCommandStyle Style { get; set; }

    /// <summary>Gets the further forms the host writes (at most 8).</summary>
    public IList<CanopyFlowCommandVariant> Variants { get; } = new List<CanopyFlowCommandVariant>();

    /// <summary>Adds a variant the host writes (<see cref="Variants"/>).</summary>
    /// <param name="id">The id the host's <c>commands</c> hook is keyed by.</param>
    /// <param name="label">The tab's text.</param>
    /// <returns>The command.</returns>
    public CanopyFlowCommand Variant(string id, string label) { Variants.Add(new CanopyFlowCommandVariant(id, label)); return this; }

    internal void Validate() {
        CanopyFlowValues.CheckShort(Name, "The command name", required: true);
        foreach (var ch in Name) if (ch < ' ') throw new InvalidOperationException("The command name has a control character.");
        if (!Enum.IsDefined(typeof(CanopyFlowCommandStyle), Style)) throw new InvalidOperationException("The command has an unknown style.");
        if (Variants.Count > 8) throw new InvalidOperationException("A command has at most 8 variants.");
        var ids = new HashSet<string>(StringComparer.Ordinal) { "command", "patch" };
        foreach (var variant in Variants) {
            if (variant == null || !ids.Add(variant.Id)) throw new InvalidOperationException("The command has a null variant or uses a variant id twice (command and patch are taken).");
            CanopyFlowValues.CheckText(variant.Label, "Command variant " + variant.Id, 60);
            if (variant.Label == null) throw new InvalidOperationException("Command variant " + variant.Id + " needs a label.");
        }
    }

    internal static string StyleName(CanopyFlowCommandStyle style) => style == CanopyFlowCommandStyle.Posix ? "posix" : style == CanopyFlowCommandStyle.Windows ? "windows" : "powershell";

    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject().Property("name", Name);
        if (Style != CanopyFlowCommandStyle.PowerShell) writer.Property("style", StyleName(Style));
        if (Variants.Count > 0) {
            writer.Name("variants").BeginArray();
            foreach (var variant in Variants) writer.BeginObject().Property("id", variant.Id).Property("label", variant.Label).EndObject();
            writer.EndArray();
        }

        writer.EndObject();
    }

    internal static CanopyFlowCommand Read(object? node) {
        const string what = "The command";
        var map = CanopyFlowContract.Object(node, what, "name", "style", "variants");
        var style = CanopyFlowContract.Text(map, "style", what);
        var command = new CanopyFlowCommand(CanopyFlowContract.RequiredText(map, "name", what), style == null ? CanopyFlowCommandStyle.PowerShell :
            CanopyFlowContract.Choose(style, what, "style", ("powershell", CanopyFlowCommandStyle.PowerShell), ("posix", CanopyFlowCommandStyle.Posix), ("windows", CanopyFlowCommandStyle.Windows)));
        foreach (var item in CanopyFlowContract.Items(map, "variants", what, 8)) {
            var variant = CanopyFlowContract.Object(item, what + " (variant)", "id", "label");
            var id = CanopyFlowContract.RequiredText(variant, "id", what);
            if (!CanopyFlowValues.IsIdentifier(id)) throw new InvalidOperationException(what + " has a variant with an invalid id.");
            command.Variants.Add(new CanopyFlowCommandVariant(id, CanopyFlowContract.RequiredText(variant, "label", what)));
        }

        return command;
    }
}