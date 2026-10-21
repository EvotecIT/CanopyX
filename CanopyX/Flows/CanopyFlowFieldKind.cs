namespace CanopyX;

/// <summary>The type of a flow field (<see cref="CanopyFlowField.Kind"/>), which decides its editor and its value.</summary>
public enum CanopyFlowFieldKind {
    /// <summary>A single line of text; the value is a string.</summary>
    Text,

    /// <summary>A number, read as the page language writes it; the value is a number.</summary>
    Number,

    /// <summary>A calendar date; the value is <c>yyyy-MM-dd</c>.</summary>
    Date,

    /// <summary>A date and time in the flow's time zone; the value is ISO 8601 UTC.</summary>
    DateTime,

    /// <summary>A time of day; the value is <c>HH:mm</c>.</summary>
    Time,

    /// <summary>A drop-down for short lists; the value is an option value.</summary>
    Select,

    /// <summary>A switch; the value is true or false.</summary>
    Toggle,

    /// <summary>A combobox that suggests options as the reader types; the value is an option value.</summary>
    Lookup,

    /// <summary>A radio group or choice cards; the value is an option value.</summary>
    Choice,

    /// <summary>Check boxes; the value is an array of option values.</summary>
    MultiChoice,

    /// <summary>Several lines of text; the value is a string.</summary>
    TextArea,

    /// <summary>One text value per row; the value is an array of strings.</summary>
    List,

    /// <summary>A masked input whose value never leaves the input except to the host's submit handler.</summary>
    Secret,

    /// <summary>A number and a unit; the value is an ISO 8601 duration such as <c>PT15M</c>.</summary>
    Duration,

    /// <summary>An editor a browser plugin or the host registers (<see cref="CanopyFlowField.EditorName"/>).</summary>
    Custom,

    /// <summary>Rows of typed cells edited as a small table (<see cref="CanopyFlowField.Columns"/>); the value is a list of objects by column id.</summary>
    Records,

    /// <summary>The answer of a pick step (<see cref="CanopyFlowPicker"/>): the chosen records as <c>{ id, label }</c>. Created by <see cref="CanopyFlow.Pick(string, string, CanopyDataGridView, System.Action{CanopyFlowPicker})"/>.</summary>
    Pick
}