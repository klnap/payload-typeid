import { expect, test } from "bun:test";
import { releaseOutcome } from "../scripts/release-outcome.js";

const skipped = {
  version: "skipped",
  pack: "skipped",
  publish: "skipped",
  published: "",
  verify: "skipped",
} as const;

test("reports no-release without claiming publication", () => {
  expect(releaseOutcome({ prepare: "success", mode: "none", ...skipped })).toBe("no-release");
});

test("reports versioning without claiming publication", () => {
  expect(
    releaseOutcome({
      prepare: "success",
      mode: "version",
      ...skipped,
      version: "success",
    }),
  ).toBe("versioned");
});

test("reports publication only after the pack, publish, and verification jobs pass", () => {
  expect(
    releaseOutcome({
      prepare: "success",
      mode: "publish",
      version: "skipped",
      pack: "success",
      publish: "success",
      published: "true",
      verify: "success",
    }),
  ).toBe("published");
});

test("fails when preparation, versioning, packing, publishing, or verification fails", () => {
  expect(() => releaseOutcome({ prepare: "skipped", mode: "", ...skipped })).toThrow();
  expect(() => releaseOutcome({ prepare: "success", mode: "version", ...skipped })).toThrow();
  expect(() =>
    releaseOutcome({
      prepare: "success",
      mode: "publish",
      version: "skipped",
      pack: "failure",
      publish: "skipped",
      published: "",
      verify: "skipped",
    }),
  ).toThrow();
  expect(() =>
    releaseOutcome({
      prepare: "success",
      mode: "publish",
      version: "skipped",
      pack: "success",
      publish: "failure",
      published: "",
      verify: "skipped",
    }),
  ).toThrow();
  expect(() =>
    releaseOutcome({
      prepare: "success",
      mode: "publish",
      version: "skipped",
      pack: "success",
      publish: "success",
      published: "true",
      verify: "failure",
    }),
  ).toThrow();
});

test("fails closed when a publish retry reports no newly published package", () => {
  expect(() =>
    releaseOutcome({
      prepare: "success",
      mode: "publish",
      version: "skipped",
      pack: "success",
      publish: "success",
      published: "false",
      verify: "skipped",
    }),
  ).toThrow("inspect npm and repair release metadata");
});
