  class CalculationFailure extends Error {}
  function calculationDate(value) {
    const failure = () => { throw new CalculationFailure("date"); };
    if (typeof value !== "string") return failure();
    const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,7}))?)?(Z|[+-]\d{2}:\d{2}))?$/.exec(value);
    if (!match) return failure();
    const [year, month, day, hour, minute, second] = match.slice(1, 7).map(item => Number(item || 0)),
      calendar = new Date(0); calendar.setUTCFullYear(year, month - 1, day); calendar.setUTCHours(hour, minute, second, 0);
    if (year < 1 || calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day || hour > 23 || minute > 59 || second > 59) return failure();
    const zone = match[8], offset = zone && zone !== "Z" ? Number(zone.slice(1, 3)) * 60 + Number(zone.slice(4)) : 0;
    if (offset > 840 || zone && zone !== "Z" && (Number(zone.slice(1, 3)) > 14 || Number(zone.slice(4)) > 59)) return failure();
    const instant = calendar.getTime() + Number((match[7] || "").padEnd(3, "0").slice(0, 3)) - (zone?.[0] === "-" ? -offset : offset) * 60000,
      result = new Date(instant);
    return result.getUTCFullYear() < 1 || result.getUTCFullYear() > 9999 ? failure() : result;
  }
  function calculationEvaluate(program, resolver) {
    const failure = code => { throw new CalculationFailure(code); },
      finite = value => Number.isFinite(value) ? value === 0 ? 0 : value : failure("number-range"),
      number = value => typeof value === "number" ? finite(value) : failure("type"),
      text = value => { const result = value === null ? "" : String(value); return result.length <= 4096 ? result : failure("text-limit"); },
      scalar = value => {
        if (value?.calculationError) failure(value.calculationError);
        if (value == null) return null;
        if (typeof value === "number") return finite(value);
        if (typeof value === "string") return text(value);
        if (typeof value === "boolean") return value;
        return failure("type");
      },
      date = calculationDate;
    function evaluate(node) {
      const { op, args } = node;
      if (op === "literal") return node.value;
      if (op === "column") return scalar(resolver(node.value));
      if (op === "IF") { const condition = evaluate(args[0]); if (condition !== null && typeof condition !== "boolean") failure("type"); return evaluate(args[condition ? 1 : 2]); }
      if (op === "COALESCE") { for (const arg of args) { const value = evaluate(arg); if (value !== null) return value; } return null; }
      const values = args.map(evaluate), [a, b, c] = values;
      if (op === "CONCAT") return text(values.map(text).join(""));
      if (op === "=" || op === "==" || op === "!=" || op === "<>") {
        if (a !== null && b !== null && typeof a !== typeof b) failure("type");
        return op === "!=" || op === "<>" ? a !== b : a === b;
      }
      if (values.some(value => value === null)) return null;
      if (["<", "<=", ">", ">="].includes(op)) {
        if (typeof a !== typeof b) failure("type");
        return op === "<" ? a < b : op === "<=" ? a <= b : op === ">" ? a > b : a >= b;
      }
      if (op === "DATEPART" || op === "DATEDIFF") {
        if (typeof a !== "string") failure("type");
        const unit = a.toLowerCase(), start = date(b);
        if (op === "DATEDIFF") {
          const units = { day: 86400000, hour: 3600000, minute: 60000, second: 1000, millisecond: 1 };
          if (!Object.hasOwn(units, unit)) return failure("date");
          return finite((date(c).getTime() - start.getTime()) / units[unit]);
        }
        switch (unit) {
          case "year": return start.getUTCFullYear(); case "quarter": return Math.floor(start.getUTCMonth() / 3) + 1;
          case "month": return start.getUTCMonth() + 1; case "day": return start.getUTCDate(); case "hour": return start.getUTCHours();
          case "minute": return start.getUTCMinutes(); case "second": return start.getUTCSeconds(); case "weekday": return (start.getUTCDay() + 6) % 7 + 1;
          default: return failure("date");
        }
      }
      const x = number(a);
      if (op === "positive") return x; if (op === "negative") return finite(-x);
      const y = number(b);
      if (op === "ROUND") {
        if (!Number.isInteger(y) || y < -12 || y > 12) failure("type");
        const scale = 10 ** y, scaled = finite(x * scale);
        return finite(Math.round(scaled) / scale);
      }
      if ((op === "/" || op === "%") && y === 0) failure("divide-by-zero");
      return finite(op === "+" ? x + y : op === "-" ? x - y : op === "*" ? x * y : op === "/" ? x / y : x % y);
    }
    try { return { value: evaluate(program.root), error: null }; }
    catch (error) { if (!(error instanceof CalculationFailure)) throw error; return { value: null, error: error.message }; }
  }
