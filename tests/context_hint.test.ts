import { contextHintFromModelName, lowerContextHint } from "../src/core/llm/context-hint";

describe("contextHintFromModelName", () => {
  it("liest das Suffix -ctxNNNk", () => {
    expect(contextHintFromModelName("gpt-oss:120b-ctx128k")).toBe(131072);
    expect(contextHintFromModelName("gemma4:31b-ctx128k")).toBe(131072);
    expect(contextHintFromModelName("qwen3-ctx32k")).toBe(32768);
    expect(contextHintFromModelName("Model-CTX8K")).toBe(8192);
  });
  it("kein Suffix, kein Hinweis", () => {
    expect(contextHintFromModelName("verdigado-think")).toBeNull();
    expect(contextHintFromModelName("qwen/qwen3.8-27b")).toBeNull();
    expect(contextHintFromModelName("")).toBeNull();
    expect(contextHintFromModelName(undefined)).toBeNull();
  });
  it("erfindet nichts aus aehnlichen Namen", () => {
    expect(contextHintFromModelName("ctx128k")).toBeNull(); // kein fuehrender Bindestrich
    expect(contextHintFromModelName("m-ctx128kb")).toBeNull();
    expect(contextHintFromModelName("m-ctx0k")).toBeNull();
    expect(contextHintFromModelName("m-ctxk")).toBeNull();
  });
});

describe("lowerContextHint", () => {
  it("warnt nur nach unten", () => {
    expect(lowerContextHint(260000, [131072])).toBe(131072);
    expect(lowerContextHint(131072, [131072])).toBeNull();
    expect(lowerContextHint(128000, [131072])).toBeNull();
    expect(lowerContextHint(8192, [131072])).toBeNull();
  });
  it("nimmt den kleinsten unter mehreren Hinweisen und ignoriert null", () => {
    expect(lowerContextHint(260000, [null, 131072, 65536, undefined])).toBe(65536);
    expect(lowerContextHint(260000, [null, undefined])).toBeNull();
  });
});
