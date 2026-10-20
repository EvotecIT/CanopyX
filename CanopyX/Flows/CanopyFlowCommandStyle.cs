namespace CanopyX;

/// <summary>How an equivalent command writes its parameters (<see cref="CanopyFlowCommand.Style"/>), as ConsoleMonster's command styles do.</summary>
public enum CanopyFlowCommandStyle {
    /// <summary><c>-Name value</c>, values in single quotes when needed, <c>-Switch:$false</c>. The default.</summary>
    PowerShell,

    /// <summary><c>--name value</c> (<c>-n</c> for one letter), values in single quotes when needed, <c>--no-switch</c>.</summary>
    Posix,

    /// <summary><c>/name:value</c>, values in double quotes when needed, <c>/no-switch</c>.</summary>
    Windows
}