using System;
using System.Globalization;
using System.Numerics;

namespace CanopyX;

/// <summary>Shortest decimal in the exact binary64 rounding interval, with ECMAScript spelling boundaries.</summary>
/// <remarks>Exact integer comparisons avoid legacy CLR round-trip formatting and parser differences.
/// All finite doubles are integers in units of 2^-1074. Midpoint inclusion follows ties-to-even.</remarks>
internal static class CanopyCalculationNumberText {
    internal static string Format(double value) {
        if (value == 0) return "0";
        var negative = value < 0;
        value = Math.Abs(value);
        var bits = BitConverter.DoubleToInt64Bits(value);
        var units = Units(bits);
        var lower = units + Units(bits - 1);
        var upper = units + (bits == 0x7fefffffffffffffL ? BigInteger.One << 2098 : Units(bits + 1));
        var inclusive = (bits & 1) == 0;
        var exponent = (int)Math.Floor(Math.Log10(value));
        var denominator = BigInteger.One << 1074;
        while (ComparePower(units, denominator, exponent) < 0) exponent--;
        while (ComparePower(units, denominator, exponent + 1) >= 0) exponent++;
        for (var precision = 1; precision <= 17; precision++) {
            var power = exponent - precision + 1;
            var numerator = units;
            var divisor = denominator;
            if (power < 0) numerator *= BigInteger.Pow(10, -power);
            else divisor *= BigInteger.Pow(10, power);
            var coefficient = BigInteger.DivRem(numerator, divisor, out var remainder);
            var midpoint = (remainder << 1).CompareTo(divisor);
            if (midpoint > 0 || midpoint == 0 && !coefficient.IsEven) coefficient++;
            var candidate = power >= 0 ? coefficient * BigInteger.Pow(10, power) : coefficient;
            var candidateDivisor = power >= 0 ? BigInteger.One : BigInteger.Pow(10, -power);
            var twice = candidate << 1075;
            var fromLower = twice.CompareTo(lower * candidateDivisor);
            var fromUpper = twice.CompareTo(upper * candidateDivisor);
            if ((fromLower > 0 || inclusive && fromLower == 0) && (fromUpper < 0 || inclusive && fromUpper == 0)) {
                var digits = coefficient.ToString(CultureInfo.InvariantCulture);
                while (digits.Length > 1 && digits[digits.Length - 1] == '0') { digits = digits.Substring(0, digits.Length - 1); power++; }
                var point = digits.Length + power;
                string text;
                if (point > 0 && point <= 21) text = point >= digits.Length ? digits + new string('0', point - digits.Length) : digits.Insert(point, ".");
                else if (point <= 0 && point > -6) text = "0." + new string('0', -point) + digits;
                else {
                    var e = point - 1;
                    text = digits.Substring(0, 1) + (digits.Length > 1 ? "." + digits.Substring(1) : string.Empty) +
                        "e" + (e < 0 ? "-" : "+") + Math.Abs(e).ToString(CultureInfo.InvariantCulture);
                }
                return negative ? "-" + text : text;
            }
        }
        throw new InvalidOperationException("A finite binary64 number requires at most 17 decimal digits.");
    }

    private static int ComparePower(BigInteger numerator, BigInteger denominator, int power) => power < 0 ?
        (numerator * BigInteger.Pow(10, -power)).CompareTo(denominator) : numerator.CompareTo(denominator * BigInteger.Pow(10, power));

    private static BigInteger Units(long bits) {
        var exponent = (int)(bits >> 52);
        BigInteger coefficient = bits & 0x000fffffffffffffL;
        if (exponent == 0) return coefficient;
        return (coefficient + (1L << 52)) << (exponent - 1);
    }
}
