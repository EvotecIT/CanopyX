using System;
using System.Globalization;
using System.Text.Json;

namespace CanopyX.Data;

public static partial class CanopyRequestParser {
    /// <summary>Legacy JSON readers can misround decimal tokens. Correct only exact decimal representations;
    /// other JSON numbers retain the platform parser, including values below decimal's range.</summary>
    private static bool TryNumber(JsonElement value, out double number) {
        if (!value.TryGetDouble(out number)) return false;
#if NETFRAMEWORK || NETSTANDARD2_0
        if (value.TryGetDecimal(out var exact) && SameDecimal(value.GetRawText(), exact)) number = CanopyNumericValues.DecimalToDouble(exact);
#endif
        return true;
    }

#if NETFRAMEWORK || NETSTANDARD2_0
    private static bool SameDecimal(string text, decimal value) =>
        DecimalShape(text, out var digits, out var scale, out var negative) &&
        DecimalShape(value.ToString(CultureInfo.InvariantCulture), out var exactDigits, out var exactScale, out var exactNegative) &&
        digits == exactDigits && scale == exactScale && (digits.Length == 0 || negative == exactNegative);

    /// <summary>Compares already-valid JSON decimal spellings, retaining at most the decimal coefficient's 29 digits.
    /// Trimming zeros and tracking the power of ten detects parse rounding and underflow without parsing arbitrary precision.</summary>
    private static bool DecimalShape(string text, out string digits, out long scale, out bool negative) {
        digits = string.Empty; scale = 0; negative = text[0] == '-';
        var coefficient = new char[29]; var count = 0; var zeros = 0; var fraction = false; var fractionalDigits = 0;
        var index = negative ? 1 : 0;
        for (; index < text.Length && text[index] != 'e' && text[index] != 'E'; index++) {
            var unit = text[index];
            if (unit == '.') { fraction = true; continue; }
            if (fraction) fractionalDigits++;
            if (unit == '0') { if (count != 0) zeros++; continue; }
            if ((long)count + zeros + 1 > coefficient.Length) return false;
            while (zeros > 0) { coefficient[count++] = '0'; zeros--; }
            coefficient[count++] = unit;
        }
        var exponent = 0;
        if (index < text.Length) {
            index++; var minus = text[index] == '-';
            if (minus || text[index] == '+') index++;
            for (; index < text.Length; index++) {
                var digit = text[index] - '0';
                if (exponent > (int.MaxValue - digit) / 10) return false;
                exponent = exponent * 10 + digit;
            }
            if (minus) exponent = -exponent;
        }
        if (count == 0) return true;
        digits = new string(coefficient, 0, count); scale = (long)fractionalDigits - exponent - zeros;
        return true;
    }
#endif
}
