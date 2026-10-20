using System;

namespace CanopyX.Data;

/// <summary>Argument checks of the texts the flow's server answers carry.</summary>
internal static class CanopyFlowText {
    internal static string Require(string? value, string name) =>
        value != null && CanopyFlowValues.HasVisibleText(value) ? value : throw new ArgumentException("The text needs something visible.", name);

    internal static string? Optional(string? value, string name) => value == null ? null : Require(value, name);
}