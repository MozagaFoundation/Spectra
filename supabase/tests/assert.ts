export function assert(
  condition: unknown,
  message = "assertion failed",
): asserts condition {
  if (!condition) throw new Error(message);
}

export function assertEquals<T>(
  actual: T,
  expected: T,
  message = "values differ",
): void {
  if (stableJson(actual) !== stableJson(expected)) {
    throw new Error(
      `${message}\nexpected: ${stableJson(expected)}\nactual:   ${
        stableJson(actual)
      }`,
    );
  }
}

export function assertMatch(
  actual: string,
  expected: RegExp,
  message = "value did not match",
): void {
  if (!expected.test(actual)) {
    throw new Error(`${message}: ${JSON.stringify(actual)}`);
  }
}

export async function assertRejects(
  action: () => unknown | Promise<unknown>,
  expected?: RegExp,
): Promise<Error> {
  try {
    await action();
  } catch (error) {
    const caught = error instanceof Error ? error : new Error(String(error));
    if (expected && !expected.test(caught.message)) {
      throw new Error(`unexpected error: ${caught.message}`);
    }
    return caught;
  }
  throw new Error("expected action to reject");
}

export function assertThrows(action: () => unknown, expected?: RegExp): Error {
  try {
    action();
  } catch (error) {
    const caught = error instanceof Error ? error : new Error(String(error));
    if (expected && !expected.test(caught.message)) {
      throw new Error(`unexpected error: ${caught.message}`);
    }
    return caught;
  }
  throw new Error("expected action to throw");
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortValue(nested)]),
    );
  }
  return value;
}
