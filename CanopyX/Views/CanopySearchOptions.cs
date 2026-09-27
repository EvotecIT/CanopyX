using System;
using CanopyX.Json;

namespace CanopyX;

/// <summary>
/// Turns on the built-in search box. Choosing a result expands the tree along the result's id path and selects it.
/// </summary>
public sealed class CanopySearchOptions {
    private int _minLength = 2;
    private int _maxResults = 20;

    /// <summary>Gets or sets how many characters a query needs before it runs. Sharded bundle indexes need at least 2.</summary>
    /// <exception cref="ArgumentOutOfRangeException">The value is below 1 or above 16.</exception>
    public int MinLength {
        get => _minLength;
        set {
            if (value < 1 || value > 16) {
                throw new ArgumentOutOfRangeException(nameof(value), value, "Minimum query length must be between 1 and 16.");
            }

            _minLength = value;
        }
    }

    /// <summary>Gets or sets how many results the search box lists.</summary>
    /// <exception cref="ArgumentOutOfRangeException">The value is below 1 or above 500.</exception>
    public int MaxResults {
        get => _maxResults;
        set {
            if (value < 1 || value > 500) {
                throw new ArgumentOutOfRangeException(nameof(value), value, "Maximum results must be between 1 and 500.");
            }

            _maxResults = value;
        }
    }

    /// <summary>Gets or sets the placeholder and accessible name of the search box.</summary>
    public string Placeholder { get; set; } = "Search";

    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject()
            .Property("minLength", _minLength)
            .Property("maxResults", _maxResults)
            .Property("placeholder", Placeholder ?? "Search")
            .EndObject();
    }
}
