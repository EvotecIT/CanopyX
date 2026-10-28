  // Bounded scalar expression grammar. The C# parser and shared vectors use the same tokens and limits.
  function calculationParse(expression) {
    if (typeof expression !== "string" || !expression.trim() || expression.length > 2048) throw new Error("CanopyX: calculation expression must contain 1 to 2048 characters.");
    let at = 0, nodes = 0, nesting = 0;
    const dependencies = [], fail = () => { throw new Error("CanopyX: invalid calculation at " + at + "."); },
      space = () => { while (/\s/.test(expression[at] || "") && at < expression.length) at++; },
      make = (op, args = [], value) => {
        const depth = 1 + Math.max(0, ...args.map(node => node.depth));
        if (++nodes > 256 || depth > 32) fail();
        return { op, args, value, depth };
      },
      take = token => { space(); if (expression.startsWith(token, at)) { at += token.length; return true; } return false; };
    function primary() {
      space(); if (++nesting > 32) fail();
      try {
        if (take("(")) { const node = comparison(); if (!take(")")) fail(); return node; }
        if (take("[")) {
          const end = expression.indexOf("]", at); if (end < 0) fail();
          const id = expression.slice(at, end); requireIdentifier(id, "calculation column"); at = end + 1;
          if (!dependencies.includes(id)) dependencies.push(id);
          if (dependencies.length > 64) fail();
          return make("column", [], id);
        }
        if (expression[at] === '"') {
          const start = at++; let escaped = false;
          while (at < expression.length) {
            const char = expression[at++];
            if (char === '"' && !escaped) {
              let value; try { value = JSON.parse(expression.slice(start, at)); } catch (_) { fail(); }
              return make("literal", [], value);
            }
            escaped = char === "\\" && !escaped;
          }
          fail();
        }
        const number = /^(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(expression.slice(at));
        if (number) { at += number[0].length; const value = Number(number[0]); if (!Number.isFinite(value)) fail(); return make("literal", [], value); }
        const name = /^[a-zA-Z]+/.exec(expression.slice(at)); if (!name) fail();
        at += name[0].length; const upper = name[0].toUpperCase();
        if (["TRUE", "FALSE", "NULL"].includes(upper)) return make("literal", [], upper === "NULL" ? null : upper === "TRUE");
        const arity = { IF: [3, 3], COALESCE: [1, 32], ROUND: [2, 2], CONCAT: [1, 32], DATEPART: [2, 2], DATEDIFF: [3, 3] }[upper];
        if (!arity || !take("(")) fail();
        const args = [];
        if (!take(")")) { do { if (args.length === 32) fail(); args.push(comparison()); } while (take(",")); if (!take(")")) fail(); }
        if (args.length < arity[0] || args.length > arity[1]) fail();
        return make(upper, args);
      } finally { nesting--; }
    }
    function unary() { if (take("+")) return make("positive", [unaryBounded()]); if (take("-")) return make("negative", [unaryBounded()]); return primary(); }
    function unaryBounded() { if (++nesting > 32) fail(); try { return unary(); } finally { nesting--; } }
    function product() { let node = unary(); for (;;) { space(); const op = expression[at]; if (!"*/%".includes(op || " ")) return node; at++; node = make(op, [node, unary()]); } }
    function sum() { let node = product(); for (;;) { space(); const op = expression[at]; if (op !== "+" && op !== "-") return node; at++; node = make(op, [node, product()]); } }
    function comparison() {
      let node = sum();
      for (;;) {
        space(); const op = /^(?:<=|>=|!=|<>|==|=|<|>)/.exec(expression.slice(at)); if (!op) return node;
        at += op[0].length; node = make(op[0], [node, sum()]);
      }
    }
    const root = comparison(); space(); if (at !== expression.length) fail();
    return Object.freeze({ expression, dependencies: Object.freeze(dependencies), root });
  }
