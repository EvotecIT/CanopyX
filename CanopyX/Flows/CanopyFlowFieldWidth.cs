namespace CanopyX;

/// <summary>How wide a flow field is on a wide form (<see cref="CanopyFlowField.Width"/>).</summary>
public enum CanopyFlowFieldWidth {
    /// <summary>The whole form column. The default.</summary>
    Full,

    /// <summary>Half the form column: two half fields share a row.</summary>
    Half
}