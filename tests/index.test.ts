import { expect, test } from "bun:test";
import { greet } from "../src/index.js";

test("greets the supplied name", () => {
  expect(greet("Ada")).toBe("Hello, Ada!");
});

const greeting: string = greet("Ada");
void greeting;

// @ts-expect-error Names must be strings.
greet(42);
