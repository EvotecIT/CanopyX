using System;
using System.Collections.Generic;
using System.Globalization;

namespace CanopyX;

/// <summary>A captured, dependency-ordered set of at most 32 calculated flat-grid columns.</summary>
/// <remarks>The set captures column identities, kinds and immutable programs. Applying it never mutates host rows or cells.</remarks>
public sealed class CanopyCalculationSet {
    private readonly List<Program> _programs = new List<Program>();
    internal bool IsEmpty => _programs.Count == 0;

    /// <summary>Captures calculations and validates their declared dependencies.</summary>
    /// <param name="columns">All declared columns, including ordinary inputs.</param>
    /// <exception cref="ArgumentNullException">The columns collection is null.</exception>
    /// <exception cref="InvalidOperationException">Identities, dependencies, editability or the calculation limit are invalid.</exception>
    public CanopyCalculationSet(IEnumerable<CanopyColumn> columns) {
        if (columns == null) throw new ArgumentNullException(nameof(columns));
        var declared = new HashSet<string>(StringComparer.Ordinal);
        var calculated = new Dictionary<string, Program>(StringComparer.Ordinal);
        foreach (var column in columns) {
            if (column == null || !declared.Add(column.Id))
                throw new InvalidOperationException("Calculation columns require unique declared identities.");
            if (column.Calculation == null) continue;
            if (column.Editable) throw new InvalidOperationException("Calculated column '" + column.Id + "' cannot be editable.");
            if (!Enum.IsDefined(typeof(CanopyColumnKind), column.Kind)) throw new InvalidOperationException("Unknown calculated column kind.");
            calculated.Add(column.Id, new Program(column.Id, column.Kind, column.Calculation));
            if (calculated.Count > 32) throw new InvalidOperationException("A grid supports at most 32 calculated columns.");
        }
        var states = new Dictionary<string, bool>(StringComparer.Ordinal);
        void Visit(Program program) {
            if (states.TryGetValue(program.Id, out var complete)) {
                if (!complete) throw new InvalidOperationException("Calculated columns contain a dependency cycle at '" + program.Id + "'.");
                return;
            }
            states.Add(program.Id, false);
            foreach (var dependency in program.Calculation.Dependencies) {
                if (!declared.Contains(dependency)) throw new InvalidOperationException("Calculated column '" + program.Id + "' references undeclared column '" + dependency + "'.");
                if (calculated.TryGetValue(dependency, out var upstream)) Visit(upstream);
            }
            states[program.Id] = true;
            _programs.Add(program);
        }
        foreach (var program in calculated.Values) Visit(program);
    }

    /// <summary>Returns a new row with calculated cells replacing any supplied values for those columns.</summary>
    /// <param name="row">The source row. Ordinary cells, detail and record fields are borrowed without modification.</param>
    /// <param name="labels">Optional translated error tooltip template.</param>
    /// <returns>A copy retaining the identity, tone, classes, detail and record fields.</returns>
    /// <exception cref="ArgumentNullException">The row is null.</exception>
    public CanopyGridRow Apply(CanopyGridRow row, CanopyLabels? labels = null) {
        if (row == null) throw new ArgumentNullException(nameof(row));
        var copy = new CanopyGridRow(row.Id) { Tone = row.Tone, ClassName = row.ClassName, Detail = row.Detail };
        foreach (var cell in row.Cells) copy.Cells.Add(cell);
        if (row.HasFields) foreach (var field in row.Fields) copy.Fields.Add(field);
        var results = new Dictionary<string, CanopyCalculatedValue>(StringComparer.Ordinal);
        foreach (var program in _programs) {
            object? Resolve(string id) => results.TryGetValue(id, out var result) ? result :
                row.Cells.TryGetValue(id, out var cell) ? cell?.Value : null;
            var value = EnforceKind(program.Calculation.Evaluate(Resolve), program.Kind);
            results.Add(program.Id, value);
            copy.Cells[program.Id] = value.IsError
                ? new CanopyCell { Text = "#ERROR", Title = (labels ?? new CanopyLabels()).GridCalculationError.Replace("{error}", value.Error!) }
                : Cell(value.Value);
        }
        return copy;
    }

    /// <summary>Lazily returns copies of source rows with calculated cells materialized in dependency order.</summary>
    /// <param name="rows">Source rows, enumerated once.</param>
    /// <param name="labels">Optional translated error tooltip template.</param>
    /// <returns>Calculated rows, preserving source order.</returns>
    /// <exception cref="ArgumentNullException">The rows collection is null.</exception>
    public IEnumerable<CanopyGridRow> Apply(IEnumerable<CanopyGridRow> rows, CanopyLabels? labels = null) {
        if (rows == null) throw new ArgumentNullException(nameof(rows));
        return ApplyRows(rows, labels);
    }

    private IEnumerable<CanopyGridRow> ApplyRows(IEnumerable<CanopyGridRow> rows, CanopyLabels? labels) {
        foreach (var row in rows) yield return Apply(row, labels);
    }

    private static CanopyCalculatedValue EnforceKind(CanopyCalculatedValue result, CanopyColumnKind kind) {
        if (result.IsError || result.Value == null) return result;
        var value = result.Value;
        if (kind == CanopyColumnKind.Number) {
            if (!(value is long || value is double || value is decimal)) return CanopyCalculatedValue.FromError("type");
            return Math.Abs(Convert.ToDouble(value, CultureInfo.InvariantCulture)) <= 9007199254740991d ? result : CanopyCalculatedValue.FromError("number-range");
        }
        if (kind == CanopyColumnKind.DateTime) {
            if (value is DateTime moment) return new CanopyCalculatedValue(MillisecondUtc(moment));
            if (value is DateTimeOffset offset) return new CanopyCalculatedValue(MillisecondUtc(offset.UtcDateTime));
            if (value is string text && CanopyCalculationDates.TryRead(text, out var date)) return new CanopyCalculatedValue(date);
            return CanopyCalculatedValue.FromError("date");
        }
        return value is string || value is bool ? result : CanopyCalculatedValue.FromError("type");
    }

    private static DateTime MillisecondUtc(DateTime value) {
        var utc = value.Kind == DateTimeKind.Local ? value.ToUniversalTime() : value;
        return new DateTime(utc.Ticks - utc.Ticks % TimeSpan.TicksPerMillisecond, DateTimeKind.Utc);
    }

    private static CanopyCell Cell(object? value) => value switch {
        null => new CanopyCell(),
        string text => new CanopyCell(text),
        bool flag => new CanopyCell(flag),
        DateTime date => new CanopyCell(date),
        DateTimeOffset date => new CanopyCell(date),
        long number => new CanopyCell(number),
        decimal number => new CanopyCell(number),
        _ => new CanopyCell(Convert.ToDouble(value, CultureInfo.InvariantCulture))
    };

    private sealed class Program {
        internal Program(string id, CanopyColumnKind kind, CanopyCalculation calculation) { Id = id; Kind = kind; Calculation = calculation; }
        internal string Id { get; }
        internal CanopyColumnKind Kind { get; }
        internal CanopyCalculation Calculation { get; }
    }
}
