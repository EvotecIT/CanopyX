namespace CanopyX;

/// <summary>How a formatting condition reads cell values and operands before it compares them.</summary>
public enum CanopyFormatValueType {
    /// <summary>The column's kind: numbers for number columns, instants for date columns, text or booleans otherwise.</summary>
    Auto = 0,
    /// <summary>Text; booleans read as <c>true</c> and <c>false</c>.</summary>
    Text,
    /// <summary>Numbers; text is parsed, with the condition's culture when it has one.</summary>
    Number,
    /// <summary>Booleans; text reads <c>true</c>, <c>yes</c>, <c>on</c> and <c>1</c> as true, and their opposites as false.</summary>
    Boolean,
    /// <summary>Instants; text is parsed as an ISO 8601 date.</summary>
    Date
}
