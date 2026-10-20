namespace CanopyX;

/// <summary>How a choice field draws its options (<see cref="CanopyFlowField.Display"/>).</summary>
public enum CanopyFlowChoiceDisplay {
    /// <summary>Choice cards for up to five options, a radio list for more. The default.</summary>
    Auto,

    /// <summary>Choice cards with a title, description, badge and disabled reason.</summary>
    Cards,

    /// <summary>A plain radio list.</summary>
    List
}