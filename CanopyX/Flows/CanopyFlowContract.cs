using System;
using System.Collections.Generic;

namespace CanopyX;

/// <summary>Typed access to parsed contract JSON (<see cref="Json.CanopyJsonReader"/>) that rejects unknown properties and wrong types.</summary>
internal static class CanopyFlowContract {
    private static readonly object?[] Empty = new object?[0];

    /// <summary>The node as an object whose properties are all among <paramref name="allowed"/>.</summary>
    internal static Dictionary<string, object?> Object(object? node, string what, params string[] allowed) {
        if (!(node is Dictionary<string, object?> map)) throw new InvalidOperationException(what + " must be an object.");
        foreach (var name in map.Keys) {
            if (Array.IndexOf(allowed, name) < 0) throw new InvalidOperationException(what + " has the unknown property '" + name + "'.");
        }

        return map;
    }

    internal static bool Has(Dictionary<string, object?> map, string name) => map.ContainsKey(name);

    /// <summary>An optional text property; null when it is missing.</summary>
    internal static string? Text(Dictionary<string, object?> map, string name, string what) {
        if (!map.TryGetValue(name, out var value)) return null;
        return value as string ?? throw new InvalidOperationException(what + " needs text in '" + name + "'.");
    }

    internal static string RequiredText(Dictionary<string, object?> map, string name, string what) =>
        Text(map, name, what) ?? throw new InvalidOperationException(what + " needs '" + name + "'.");

    /// <summary>An optional boolean property; null when it is missing.</summary>
    internal static bool? Boolean(Dictionary<string, object?> map, string name, string what) {
        if (!map.TryGetValue(name, out var value)) return null;
        return value is bool flag ? flag : throw new InvalidOperationException(what + " needs true or false in '" + name + "'.");
    }

    /// <summary>An optional whole number property within <see cref="int"/>; null when it is missing.</summary>
    internal static int? Integer(Dictionary<string, object?> map, string name, string what) {
        if (!map.TryGetValue(name, out var value)) return null;
        if (value is long whole && whole >= int.MinValue && whole <= int.MaxValue) return (int)whole;
        throw new InvalidOperationException(what + " needs a whole number in '" + name + "'.");
    }

    /// <summary>An optional finite number property; null when it is missing.</summary>
    internal static double? Number(Dictionary<string, object?> map, string name, string what) {
        if (!map.TryGetValue(name, out var value)) return null;
        if (value is long whole) return whole;
        if (value is double real) return real;
        throw new InvalidOperationException(what + " needs a number in '" + name + "'.");
    }

    /// <summary>An optional array property of at most <paramref name="max"/> items; empty when it is missing.</summary>
    internal static IList<object?> Items(Dictionary<string, object?> map, string name, string what, int max) {
        if (!map.TryGetValue(name, out var value)) return Empty;
        if (!(value is List<object?> list)) throw new InvalidOperationException(what + " needs an array in '" + name + "'.");
        if (list.Count > max) throw new InvalidOperationException(what + " holds more than " + max + " items in '" + name + "'.");
        return list;
    }

    /// <summary>Picks the enum member whose wire name is the text.</summary>
    internal static T Choose<T>(string? text, string what, string name, params (string Wire, T Value)[] members) {
        foreach (var member in members) if (member.Wire == text) return member.Value;
        throw new InvalidOperationException(what + " has an unknown value in '" + name + "'.");
    }
}
