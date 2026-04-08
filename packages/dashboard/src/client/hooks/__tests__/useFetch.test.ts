import { FetchMockHelper } from "@dotfiles/testing-helpers";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { fetchApi } from "../../api";

describe("useFetch", () => {
  const fetchMock = new FetchMockHelper();

  beforeEach(() => {
    fetchMock.setup();
  });

  afterEach(() => {
    fetchMock.restore();
  });

  describe("fetchApi", () => {
    it("should call fetch with correct URL prefix", async () => {
      fetchMock.mockJsonResponseOnce({ success: true, data: { name: "test" } });

      const result = await fetchApi<{ name: string }>("/test-endpoint");

      expect(result).toEqual({ name: "test" });
    });

    it("should throw error when API returns success: false", async () => {
      fetchMock.mockJsonResponseOnce({ success: false, error: "Something went wrong" });

      await expect(fetchApi("/test-endpoint")).rejects.toThrow("Something went wrong");
    });

    it("should throw default error when API returns success: false without message", async () => {
      fetchMock.mockJsonResponseOnce({ success: false });

      await expect(fetchApi("/test-endpoint")).rejects.toThrow("API error");
    });

    it("should extract data from successful response", async () => {
      const expectedData = { tools: [{ name: "fzf" }, { name: "ripgrep" }] };
      fetchMock.mockJsonResponseOnce({ success: true, data: expectedData });

      const result = await fetchApi<{ tools: { name: string }[] }>("/tools");

      expect(result).toEqual(expectedData);
    });
  });
});
