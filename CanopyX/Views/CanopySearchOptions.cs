using System;
using System.Collections.Generic;
using CanopyX.Json;

namespace CanopyX;

/// <summary>
/// Turns on the built-in search box. Choosing a result expands the tree along the result's id path and selects it.
/// </summary>
public sealed class CanopySearchOptions {
    private int _minLength = 2;
    private int _maxResults = 20;
    private string _placeholder = "Search";

    /// <summary>Gets or sets how many characters a query needs before it runs. Bundle search indexes need at least 2.</summary>
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
    /// <exception cref="ArgumentException">The value has no accessible text.</exception>
    public string Placeholder {
        get => _placeholder;
        set => _placeholder = !string.IsNullOrWhiteSpace(value) ? value : throw new ArgumentException("Search needs an accessible name.", nameof(value));
    }

    /// <summary>
    /// Gets the node kinds search can find. Empty (the default) means every node. With kinds, a node is found only
    /// when its <see cref="CanopyNode.Kind"/> is one of them; other nodes still open as ancestors of a hit. Use it
    /// to keep rows nobody searches for, such as section headers or repeated detail rows, out of the results and out
    /// of a bundle's search index. A remote search endpoint applies the list itself.
    /// </summary>
    public IList<string> Kinds { get; } = new List<string>();

    internal void WriteJson(CanopyJsonWriter writer) {
        writer.BeginObject()
            .Property("minLength", _minLength)
            .Property("maxResults", _maxResults)
            .Property("placeholder", Placeholder ?? "Search");
        if (Kinds.Count > 0) {
            writer.StringArray("kinds", Kinds);
        }

        writer.EndObject();
    }
}
