import { describe, expect, test } from "bun:test";
import { frontMatterFieldsFor, isScalarField } from "./frontmatter-fields.ts";

describe("frontMatterFieldsFor", () => {
  test("dewlab requires year and offers a live/archived status", () => {
    const fields = frontMatterFieldsFor("dewlab");
    const byKey = Object.fromEntries(fields.map((f) => [f.key, f]));
    expect(byKey["year"]?.required).toBe(true);
    expect(byKey["status"]?.required).toBe(false);
    expect(byKey["status"]?.options?.map((o) => o.value)).toEqual(["live", "archived"]);
    // Lists/mappings never get a row.
    expect(byKey["packages"]).toBeUndefined();
    expect(byKey["covers"]).toBeUndefined();
  });

  test("dewstack has no year field and offers a live/draft status", () => {
    const fields = frontMatterFieldsFor("dewstack");
    const byKey = Object.fromEntries(fields.map((f) => [f.key, f]));
    expect(byKey["year"]).toBeUndefined();
    expect(byKey["status"]?.options?.map((o) => o.value)).toEqual(["live", "draft"]);
  });

  test("plain markdown has no fixed field list at all", () => {
    expect(frontMatterFieldsFor("plain")).toEqual([]);
  });
});

describe("isScalarField", () => {
  test("true for string, number, and boolean values", () => {
    const fields = { title: "x", year: 2026, ok: true };
    expect(isScalarField(fields, "title")).toBe(true);
    expect(isScalarField(fields, "year")).toBe(true);
    expect(isScalarField(fields, "ok")).toBe(true);
  });

  test("false for a list, a mapping, or a missing key", () => {
    const fields = { packages: ["sympy"], covers: { a: "b" } };
    expect(isScalarField(fields, "packages")).toBe(false);
    expect(isScalarField(fields, "covers")).toBe(false);
    expect(isScalarField(fields, "missing")).toBe(false);
  });
});
