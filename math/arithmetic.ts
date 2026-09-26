/** A deliberately small arithmetic expression parser. It never evaluates JavaScript. */
const MAX_LENGTH = 1_000;
const MAX_TOKENS = 512;
const MAX_DEPTH = 64;

export class ArithmeticError extends Error {}

export function parseArithmetic(expression: string): number {
  if (
    typeof expression !== "string" ||
    !expression.trim() ||
    expression.length > MAX_LENGTH
  ) {
    throw new ArithmeticError("Expression is empty or too long");
  }

  let index = 0;
  let tokens = 0;
  const check = (value: number) => {
    if (!Number.isFinite(value))
      throw new ArithmeticError("Result must be finite");
    return value;
  };
  const skip = () => {
    while (/\s/.test(expression[index] ?? "")) index++;
  };
  const take = (token: string) => {
    skip();
    if (expression.startsWith(token, index)) {
      index += token.length;
      if (++tokens > MAX_TOKENS)
        throw new ArithmeticError("Expression is too complex");
      return true;
    }
    return false;
  };
  const number = () => {
    skip();
    const match = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(
      expression.slice(index),
    );
    if (!match) throw new ArithmeticError("Expected a number");
    index += match[0].length;
    if (++tokens > MAX_TOKENS)
      throw new ArithmeticError("Expression is too complex");
    return check(Number(match[0]));
  };
  const primary = (depth: number): number => {
    if (depth > MAX_DEPTH)
      throw new ArithmeticError("Expression is nested too deeply");
    if (take("(")) {
      const value = additive(depth + 1);
      if (!take(")")) throw new ArithmeticError("Expected closing parenthesis");
      return value;
    }
    return number();
  };
  const power = (depth: number): number => {
    let value = primary(depth);
    if (take("^")) value = check(value ** unary(depth + 1));
    return value;
  };
  const unary = (depth: number): number => {
    if (take("+")) return unary(depth + 1);
    if (take("-")) return check(-unary(depth + 1));
    return power(depth);
  };
  const multiplicative = (depth: number): number => {
    let value = unary(depth);
    while (true) {
      const operator = take("*") ? "*" : take("/") ? "/" : null;
      if (!operator) return value;

      const operand = unary(depth);
      if (operator === "/" && operand === 0)
        throw new ArithmeticError("Cannot divide by zero");
      value = check(operator === "*" ? value * operand : value / operand);
    }
  };
  const additive = (depth: number): number => {
    let value = multiplicative(depth);
    while (true) {
      const operator = take("+") ? "+" : take("-") ? "-" : null;
      if (!operator) return value;
      const operand = multiplicative(depth);
      value = check(operator === "+" ? value + operand : value - operand);
    }
  };

  const value = additive(0);
  skip();
  if (index !== expression.length)
    throw new ArithmeticError("Unexpected character");
  return value;
}
