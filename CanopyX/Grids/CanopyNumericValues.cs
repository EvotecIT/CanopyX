using System;
using System.Globalization;
using System.Numerics;

namespace CanopyX;

/// <summary>The binary64 value a browser reads from a raw numeric cell.</summary>
internal static class CanopyNumericValues {
    internal static double ToDouble(object value) => value is decimal number ? DecimalToDouble(number) : Convert.ToDouble(value, CultureInfo.InvariantCulture);

    /// <summary>Rounds the exact decimal coefficient once, to nearest binary64 with ties to even.</summary>
    /// <remarks>Older CLR decimal casts and floating-point parsers can double round. Decimal has a bounded 96-bit
    /// coefficient and scale 0–28; every nonzero decimal is a normal binary64 value, so subnormal/overflow paths are unnecessary.</remarks>
    internal static double DecimalToDouble(decimal value) {
        if (value >= -9007199254740991m && value <= 9007199254740991m && decimal.Truncate(value) == value) return (double)(long)value;
        var bits = decimal.GetBits(value);
        var numerator = ((BigInteger)(uint)bits[2] << 64) | ((BigInteger)(uint)bits[1] << 32) | (uint)bits[0];
        if (numerator.IsZero) return 0;
        var denominator = BigInteger.Pow(10, (bits[3] >> 16) & 0xff);
        var exponent = BitLength(numerator) - BitLength(denominator);
        if ((exponent < 0 ? numerator << -exponent : numerator).CompareTo(exponent < 0 ? denominator : denominator << exponent) < 0) exponent--;
        var shift = 52 - exponent;
        if (shift >= 0) numerator <<= shift;
        else denominator <<= -shift;
        var significand = BigInteger.DivRem(numerator, denominator, out var remainder);
        var midpoint = (remainder << 1).CompareTo(denominator);
        if (midpoint > 0 || midpoint == 0 && !significand.IsEven) significand++;
        if (significand == (BigInteger.One << 53)) { significand >>= 1; exponent++; }
        var result = ((long)(exponent + 1023) << 52) | ((long)significand & 0x000fffffffffffffL);
        if (bits[3] < 0) result |= long.MinValue;
        return BitConverter.Int64BitsToDouble(result);
    }

    /// <summary>Formats finite binary64 values using JavaScript's fixed/exponent spelling boundaries.</summary>
    internal static string FormatNumber(double number) {
        if (number == 0) return "0";
        if (Math.Abs(number) < 1e21 && Math.Abs(number) >= 1e-6) {
            var fixedText = number.ToString("R", CultureInfo.InvariantCulture);
            if (fixedText.IndexOf('E') < 0) return fixedText;
            return decimal.Parse(fixedText, NumberStyles.Float, CultureInfo.InvariantCulture).ToString(CultureInfo.InvariantCulture);
        }
        var text = number.ToString("R", CultureInfo.InvariantCulture);
        var e = text.IndexOf('E');
        if (e < 0) return text;
        var exponent = int.Parse(text.Substring(e + 1), NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture);
        return text.Substring(0, e) + "e" + (exponent < 0 ? "-" : "+") + Math.Abs(exponent).ToString(CultureInfo.InvariantCulture);
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
