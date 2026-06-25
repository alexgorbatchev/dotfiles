import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { fetchApi } from "../../api";

type FetchApiNamePayload = {
  name: string;
};

type UseFetchToolsPayload = {
  tools: FetchApiNamePayload[];
};

describe("useFetch", () => {
  let mockFetch: ReturnType<typeof spyOn>;

  beforeEach(() => {
    mockFetch = spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    mockFetch.mockRestore();
  });

  describe("fetchApi", () => {
    it("should call fetch with correct URL prefix", async () => {
      mockFetch.mockResolvedValue(new Response(JSON.stringify({ success: true, data: { name: "test" } })));

      const result = await fetchApi<FetchApiNamePayload>("/test-endpoint");

      expect(result).toEqual({ name: "test" });
    });

    it("should throw error when API returns success: false", async () => {
      mockFetch.mockResolvedValue(new Response(JSON.stringify({ success: false, error: "Something went wrong" })));

      await expect(fetchApi("/test-endpoint")).rejects.toThrow("Something went wrong");
    });

    it("should throw default error when API returns success: false without message", async () => {
      mockFetch.mockResolvedValue(new Response(JSON.stringify({ success: false })));

      await expect(fetchApi("/test-endpoint")).rejects.toThrow("API error");
    });

    it("should extract data from successful response", async () => {
      const expectedData = { tools: [{ name: "fzf" }, { name: "ripgrep" }] };
      mockFetch.mockResolvedValue(new Response(JSON.stringify({ success: true, data: expectedData })));

      const result = await fetchApi<UseFetchToolsPayload>("/tools");

      expect(result).toEqual(expectedData);
    });
  });
});
