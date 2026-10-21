namespace CanopyX;

/// <summary>What a flow step holds (<see cref="CanopyFlowStep.Kind"/>).</summary>
public enum CanopyFlowStepKind {
    /// <summary>Fields and sections the reader answers. The default.</summary>
    Form,

    /// <summary>Text only: a title and a description, without fields.</summary>
    Info,

    /// <summary>The review page with change links and the submit button. A flow has at most one, and it is the last step.</summary>
    Review,

    /// <summary>A record picker: a grid or tree view whose selection is the answer of the step's one field (<see cref="CanopyFlowStep.Picker"/>).</summary>
    Pick
}