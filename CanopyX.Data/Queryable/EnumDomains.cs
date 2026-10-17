using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;

namespace CanopyX.Data;

/// <summary>The finite text domain of an enum, including unnamed combinations of a bounded flag set.</summary>
internal static class EnumDomains {
    // At most 256 members keep SQL IN/rank expressions below ordinary parameter limits.
    private const int MaximumFlagBits = 8;
    private static readonly ConcurrentDictionary<Type, object[]> Cache = new ConcurrentDictionary<Type, object[]>();

    internal static object[] Members(Type type) => Cache.GetOrAdd(type, Build);

    private static object[] Build(Type type) {
        var defined = Enum.GetValues(type).Cast<object>().Distinct().ToArray();
        if (!type.IsDefined(typeof(FlagsAttribute), false)) return defined;
        var underlying = Enum.GetUnderlyingType(type);
        var signed = underlying == typeof(sbyte) || underlying == typeof(short) || underlying == typeof(int) || underlying == typeof(long);
        var width = underlying == typeof(byte) || underlying == typeof(sbyte) ? 8
            : underlying == typeof(short) || underlying == typeof(ushort) ? 16
            : underlying == typeof(int) || underlying == typeof(uint) ? 32 : 64;
        var mask = width == 64 ? ulong.MaxValue : (1UL << width) - 1;
        var bits = defined.Aggregate(0UL, (current, member) => current |
            (signed ? unchecked((ulong)Convert.ToInt64(member, CultureInfo.InvariantCulture)) : Convert.ToUInt64(member, CultureInfo.InvariantCulture)) & mask);
        var flags = new List<ulong>();
        for (var i = 0; i < width; i++) if ((bits & (1UL << i)) != 0) flags.Add(1UL << i);
        if (flags.Count > MaximumFlagBits)
            throw new ArgumentException("Flag enumerations mapped as text may use at most eight bits; project larger flag sets to a string column.");
        var members = new object[1 << flags.Count];
        for (var combination = 0; combination < members.Length; combination++) {
            var value = 0UL;
            for (var bit = 0; bit < flags.Count; bit++) if ((combination & (1 << bit)) != 0) value |= flags[bit];
            members[combination] = Enum.ToObject(type, value);
        }
        return members;
    }
}
