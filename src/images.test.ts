import { describe, expect, test } from "bun:test";
import { assetPathFor, freeAssetName, imageTypeOf, isImageName, isLocalAsset } from "./images.ts";

describe("isLocalAsset", () => {
  test("a bare name is the document's own", () => {
    expect(isLocalAsset("diagram.svg")).toBe(true);
    expect(isLocalAsset("../assets/shared.png")).toBe(true);
  });

  test("anything with a scheme is not", () => {
    for (const src of ["https://example.com/x.png", "data:image/png;base64,AAA", "//cdn/x.png", "#anchor"]) {
      expect(isLocalAsset(src)).toBe(false);
    }
  });
});

describe("assetPathFor", () => {
  test("resolves against the folder the markdown sits in", () => {
    expect(assetPathFor("tutorials/grid/grid.md", "diagram.svg")).toBe("tutorials/grid/diagram.svg");
  });

  test("honours a step up, for an asset shared between tutorials", () => {
    expect(assetPathFor("tutorials/grid/grid.md", "../shared/x.png")).toBe("tutorials/shared/x.png");
  });

  test("a document at the root resolves beside itself", () => {
    expect(assetPathFor("home.md", "x.png")).toBe("x.png");
  });
});

describe("imageTypeOf", () => {
  test("names the type a browser needs", () => {
    expect(imageTypeOf("a.svg")).toBe("image/svg+xml");
    expect(imageTypeOf("A.PNG")).toBe("image/png");
    expect(imageTypeOf("a.jpg")).toBe("image/jpeg");
  });

  test("an unknown extension gets no type rather than a wrong one", () => {
    expect(imageTypeOf("a.txt")).toBe("");
    expect(isImageName("a.txt")).toBe(false);
  });
});

describe("freeAssetName", () => {
  test("keeps a name that is free", () => {
    expect(freeAssetName([], "Diagram One.PNG")).toBe("diagram-one.png");
  });

  test("numbers a name that is taken, rather than overwriting it", () => {
    expect(freeAssetName(["x.png"], "x.png")).toBe("x-2.png");
    expect(freeAssetName(["x.png", "x-2.png"], "x.png")).toBe("x-3.png");
  });
});
