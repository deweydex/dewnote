import { afterEach, describe, expect, test } from "bun:test";
import { availableCommands, clearCommands, fuzzyScore, registerCommand, runCommand } from "./commands.ts";

afterEach(clearCommands);

describe("the registry", () => {
  test("keeps registration order, so a list does not reshuffle between reloads", () => {
    registerCommand({ id: "a", label: "Alpha", section: "Document", run() {} });
    registerCommand({ id: "b", label: "Beta", section: "Workspace", run() {} });
    registerCommand({ id: "c", label: "Gamma", section: "Appearance", run() {} });
    expect(availableCommands().map((command) => command.id)).toEqual(["a", "b", "c"]);
  });

  test("a command that cannot run is left out rather than shown disabled", () => {
    let ready = false;
    registerCommand({ id: "a", label: "Alpha", section: "Document", run() {} });
    registerCommand({ id: "b", label: "Beta", section: "GitHub", available: () => ready, run() {} });
    expect(availableCommands().map((command) => command.id)).toEqual(["a"]);
    ready = true;
    expect(availableCommands().map((command) => command.id)).toEqual(["a", "b"]);
  });

  test("registering the same id again replaces it in place", () => {
    registerCommand({ id: "a", label: "First", section: "Document", run() {} });
    registerCommand({ id: "b", label: "Beta", section: "Document", run() {} });
    registerCommand({ id: "a", label: "Second", section: "Document", run() {} });
    expect(availableCommands().map((command) => command.label)).toEqual(["Second", "Beta"]);
  });

  test("running an id nothing registered is a no-op, not a throw", () => {
    expect(() => runCommand("nothing")).not.toThrow();
  });

  test("running calls the command", () => {
    let ran = 0;
    registerCommand({ id: "a", label: "Alpha", section: "Document", run() { ran += 1; } });
    runCommand("a");
    expect(ran).toBe(1);
  });
});

describe("fuzzyScore", () => {
  test("an empty query matches everything equally, so the list stays in its own order", () => {
    expect(fuzzyScore("", "Anything")).toBe(0);
    expect(fuzzyScore("", "")).toBe(0);
  });

  test("letters must appear in order, gaps allowed", () => {
    expect(fuzzyScore("wamat", "What a Matrix Does to a Picture")).not.toBeNull();
    expect(fuzzyScore("expjup", "Export a Jupyter notebook")).not.toBeNull();
    expect(fuzzyScore("tamw", "What a Matrix")).toBeNull();
  });

  test("a match at the start beats the same letters in the middle", () => {
    // The same length, so the length penalty cannot decide it.
    const start = fuzzyScore("mat", "Matrices of x")!;
    const middle = fuzzyScore("mat", "x of Matrices")!;
    expect(start).toBeGreaterThan(middle);
  });

  test("a match on word starts beats one buried inside words", () => {
    const words = fuzzyScore("gon", "Grid of Numbers")!;
    const buried = fuzzyScore("gon", "Trigonometry")!;
    expect(words).toBeGreaterThan(buried);
  });

  test("a run of adjacent letters beats the same letters scattered", () => {
    const adjacent = fuzzyScore("stor", "Storing")!;
    const scattered = fuzzyScore("stor", "Sets to order")!;
    expect(adjacent).toBeGreaterThan(scattered);
  });

  test("of two texts that both match, the shorter is the closer match", () => {
    const short = fuzzyScore("grid", "Grid of Numbers")!;
    const long = fuzzyScore("grid", "Grid of Numbers and the Long Way Round to Them All")!;
    expect(short).toBeGreaterThan(long);
  });

  test("case never decides a match", () => {
    const lower = fuzzyScore("grid", "grid of numbers");
    expect(lower).not.toBeNull();
    expect(fuzzyScore("GRID", "grid of numbers")).toBe(lower);
    expect(fuzzyScore("grid", "GRID OF NUMBERS")).toBe(lower);
  });
});
