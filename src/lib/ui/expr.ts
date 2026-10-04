/**
 * Tiny arithmetic evaluator for `metric` blocks. Numbers, control ids, + - * / ( ), and min/max/round.
 * Hand-written parser: model-supplied formulas are never passed to eval or Function.
 */

type Token = { t: "num"; v: number } | { t: "id"; v: string } | { t: "op"; v: string };

function tokenize(src: string): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
    } else if (/[0-9.]/.test(c)) {
      const m = /^[0-9]*\.?[0-9]+(?:e[+-]?\d+)?|^[0-9]+\.?/i.exec(src.slice(i));
      if (!m) return null;
      tokens.push({ t: "num", v: Number(m[0]) });
      i += m[0].length;
    } else if (/[a-z_]/i.test(c)) {
      const m = /^[a-z_][a-z0-9_]*/i.exec(src.slice(i))!;
      tokens.push({ t: "id", v: m[0] });
      i += m[0].length;
    } else if ("+-*/(),".includes(c)) {
      tokens.push({ t: "op", v: c });
      i++;
    } else {
      return null;
    }
  }
  return tokens;
}

const FUNCS: Record<string, (args: number[]) => number> = {
  min: (a) => Math.min(...a),
  max: (a) => Math.max(...a),
  round: (a) => Math.round(a[0]),
};

export function evaluate(formula: string, vars: Record<string, number>): number {
  const parsed = tokenize(formula);
  if (!parsed) return NaN;
  const tokens: Token[] = parsed;
  let pos = 0;
  const peek = () => tokens[pos];
  const isOp = (v: string) => peek()?.t === "op" && (peek() as { v: string }).v === v;

  function expr(): number {
    let left = term();
    while (isOp("+") || isOp("-")) {
      const op = (tokens[pos++] as { v: string }).v;
      const right = term();
      left = op === "+" ? left + right : left - right;
    }
    return left;
  }
  function term(): number {
    let left = factor();
    while (isOp("*") || isOp("/")) {
      const op = (tokens[pos++] as { v: string }).v;
      const right = factor();
      left = op === "*" ? left * right : right === 0 ? NaN : left / right;
    }
    return left;
  }
  function factor(): number {
    const tok = peek();
    if (!tok) return NaN;
    if (tok.t === "op" && tok.v === "-") {
      pos++;
      return -factor();
    }
    if (tok.t === "num") {
      pos++;
      return tok.v;
    }
    if (tok.t === "id") {
      pos++;
      if (isOp("(")) {
        pos++;
        const args: number[] = [];
        if (!isOp(")")) {
          args.push(expr());
          while (isOp(",")) {
            pos++;
            args.push(expr());
          }
        }
        if (!isOp(")")) return NaN;
        pos++;
        const fn = Object.prototype.hasOwnProperty.call(FUNCS, tok.v.toLowerCase()) ? FUNCS[tok.v.toLowerCase()] : undefined;
        return fn && args.length ? fn(args) : NaN;
      }
      return Object.prototype.hasOwnProperty.call(vars, tok.v) ? vars[tok.v] : NaN;
    }
    if (tok.t === "op" && tok.v === "(") {
      pos++;
      const v = expr();
      if (!isOp(")")) return NaN;
      pos++;
      return v;
    }
    return NaN;
  }

  const result = expr();
  return pos === tokens.length ? result : NaN;
}
