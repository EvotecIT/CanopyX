using System;
using System.Globalization;
using System.Numerics;

namespace CanopyX;

/// <summary>Rounds a validated, unsigned JSON decimal exactly once to binary64, including subnormals.</summary>
/// <remarks>Legacy CLR double parsing can round some decimal literals to the adjacent double.
/// Work is bounded by the expression length; extreme exponents are classified before constructing powers.</remarks>
internal static class CanopyCalculationNumberParser {
    internal static bool TryParse(string text, out double value) {
        value = 0;
        var exponentAt = text.IndexOfAny(new[] { 'e', 'E' });
        var coefficientText = exponentAt < 0 ? text : text.Substring(0, exponentAt);
        var point = coefficientText.IndexOf('.');
        var fraction = point < 0 ? 0 : coefficientText.Length - point - 1;
        var digits = coefficientText.Replace(".", string.Empty).TrimStart('0');
        if (digits.Length == 0) return true;
        var decimalExponent = 0;
        if (exponentAt >= 0) {
            var index = exponentAt + 1;
            var negative = text[index] == '-';
            if (negative || text[index] == '+') index++;
            for (; index < text.Length; index++) decimalExponent = Math.Min(4096, decimalExponent * 10 + text[index] - '0');
            if (negative) decimalExponent = -decimalExponent;
        }
        decimalExponent -= fraction;
        var magnitude = digits.Length + decimalExponent - 1;
        if (magnitude > 308) return false;
        if (magnitude < -324) return true;
        var numerator = BigInteger.Parse(digits, CultureInfo.InvariantCulture);
        var denominator = BigInteger.One;
        if (decimalExponent >= 0) numerator *= BigInteger.Pow(10, decimalExponent);
        else denominator = BigInteger.Pow(10, -decimalExponent);
        var exponent = BitLength(numerator) - BitLength(denominator);
        if ((exponent < 0 ? numerator << -exponent : numerator).CompareTo(exponent < 0 ? denominator : denominator << exponent) < 0) exponent--;
        var subnormal = exponent < -1022;
        var shift = subnormal ? 1074 : 52 - exponent;
        if (shift >= 0) numerator <<= shift;
        else denominator <<= -shift;
        var significand = BigInteger.DivRem(numerator, denominator, out var remainder);
        var midpoint = (remainder << 1).CompareTo(denominator);
        if (midpoint > 0 || midpoint == 0 && !significand.IsEven) significand++;
        if (subnormal) {
            value = BitConverter.Int64BitsToDouble((long)significand);
            return true;
        }
        if (significand == (BigInteger.One << 53)) { significand >>= 1; exponent++; }
        if (exponent > 1023) return false;
        value = BitConverter.Int64BitsToDouble(((long)(exponent + 1023) << 52) | ((long)significand & 0x000fffffffffffffL));
        return true;
    }

    private static int BitLength(BigInteger value) {
        var bytes = value.ToByteArray();
        var last = bytes.Length - 1;
        if (bytes[last] == 0) last--;
        var length = last * 8;
        for (var high = bytes[last]; high != 0; high >>= 1) length++;
        return length;
    }
}
