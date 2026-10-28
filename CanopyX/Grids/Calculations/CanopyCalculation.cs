using System;
using System.Collections.Generic;

namespace CanopyX;

/// <summary>An immutable, bounded expression program interpreted without generated code.</summary>
/// <remarks>Programs contain at most 256 nodes, depth 32, 64 dependencies, and 32 arguments per function.
/// Expressions contain at most 2048 UTF-16 code units; source and result strings contain at most 4096.</remarks>
public sealed class CanopyCalculation {
    private readonly CanopyCalculationNode _root;

    private CanopyCalculation(string expression, CanopyCalculationNode root, IReadOnlyList<string> dependencies) {
        Expression = expression;
        _root = root;
        Dependencies = dependencies;
    }

    /// <summary>Gets the original expression, including whitespace.</summary>
    public string Expression { get; }

    /// <summary>Gets distinct column identifiers in first encounter order, including lazy branches.</summary>
    public IReadOnlyList<string> Dependencies { get; }

    /// <summary>Parses an expression into an immutable program.</summary>
    /// <param name="expression">Literals, bracketed column references, arithmetic, comparisons, or supported functions.</param>
    /// <returns>The compiled expression.</returns>
    /// <exception cref="ArgumentException">Syntax, function arity, or a program limit is invalid.</exception>
    public static CanopyCalculation Parse(string expression) {
        if (expression == null || expression.Length == 0 || expression.Length > 2048)
            throw new ArgumentException("Expressions require 1 to 2048 UTF-16 code units.", nameof(expression));
        var parser = new CanopyCalculationParser(expression);
        var root = parser.Parse();
        return new CanopyCalculation(expression, root, Array.AsReadOnly(parser.Dependencies.ToArray()));
    }

    /// <summary>Evaluates against a host resolver. Missing columns should resolve to null.</summary>
    /// <param name="resolver">Resolves a column to a scalar or a <see cref="CanopyCalculatedValue"/>.
    /// Host exceptions propagate. Calculations do not cache row values or invoke unused lazy branches.</param>
    /// <returns>A scalar result or a stable error code for an ordinary row error.</returns>
    /// <exception cref="ArgumentNullException">The resolver is null.</exception>
    public CanopyCalculatedValue Evaluate(Func<string, object?> resolver) {
        if (resolver == null) throw new ArgumentNullException(nameof(resolver));
        return _root.Evaluate(resolver);
    }
}
