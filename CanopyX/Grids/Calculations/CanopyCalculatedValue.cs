namespace CanopyX;

/// <summary>A scalar calculation result or a stable row-level error.</summary>
public sealed class CanopyCalculatedValue {
    /// <summary>Creates a successful scalar result. Values are normalized when read by a calculation.</summary>
    /// <param name="value">A number, string, boolean, date, or null.</param>
    public CanopyCalculatedValue(object? value) { Value = value; }

    private CanopyCalculatedValue(string error, bool _) { Error = error; }

    /// <summary>Gets the scalar result, or null for an error.</summary>
    public object? Value { get; }

    /// <summary>Gets the stable error code, or null for success.</summary>
    public string? Error { get; }

    /// <summary>Gets whether this result carries an error.</summary>
    public bool IsError => Error != null;

    /// <summary>Creates an error that can propagate through dependent calculations.</summary>
    /// <param name="error">One of type, divide-by-zero, number-range, text-limit, date, or reference.</param>
    /// <returns>A result without a scalar value.</returns>
    /// <exception cref="System.ArgumentException">The error code is unsupported.</exception>
    public static CanopyCalculatedValue FromError(string error) {
        switch (error) {
            case "type": case "divide-by-zero": case "number-range": case "text-limit": case "date": case "reference":
                return new CanopyCalculatedValue(error, true);
            default: throw new System.ArgumentException("Unknown calculation error code.", nameof(error));
        }
    }
}
