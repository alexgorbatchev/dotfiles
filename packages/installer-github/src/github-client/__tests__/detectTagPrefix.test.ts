import { describe, expect, it } from "bun:test";
import { detectTagPrefix } from "../detectTagPrefix";

describe("detectTagPrefix", () => {
  describe("common v-prefix tags", () => {
    it('should detect v prefix in "v2.24.0"', () => {
      const result = detectTagPrefix("v2.24.0");
      expect(result).toBe("v");
    });

    it('should detect v prefix in "v1.0.0"', () => {
      const result = detectTagPrefix("v1.0.0");
      expect(result).toBe("v");
    });

    it('should detect v prefix in two-part version "v2.24"', () => {
      const result = detectTagPrefix("v2.24");
      expect(result).toBe("v");
    });
  });

  describe("tool-name prefix tags", () => {
    it('should detect jq- prefix in "jq-1.8.1"', () => {
      const result = detectTagPrefix("jq-1.8.1");
      expect(result).toBe("jq-");
    });

    it('should detect fd- prefix in "fd-9.0.0"', () => {
      const result = detectTagPrefix("fd-9.0.0");
      expect(result).toBe("fd-");
    });

    it('should detect tool-v prefix in "tool-v1.2.3"', () => {
      const result = detectTagPrefix("tool-v1.2.3");
      expect(result).toBe("tool-v");
    });
  });

  describe("no prefix tags", () => {
    it('should return empty string for "15.1.0"', () => {
      const result = detectTagPrefix("15.1.0");
      expect(result).toBe("");
    });

    it('should return empty string for "1.0.0"', () => {
      const result = detectTagPrefix("1.0.0");
      expect(result).toBe("");
    });

    it('should return empty string for two-part version "15.1"', () => {
      const result = detectTagPrefix("15.1");
      expect(result).toBe("");
    });
  });

  describe("prerelease tags", () => {
    it('should detect prefix in "v2.0.0-beta.1"', () => {
      const result = detectTagPrefix("v2.0.0-beta.1");
      expect(result).toBe("v");
    });

    it('should detect prefix in "v1.0.0-rc1"', () => {
      const result = detectTagPrefix("v1.0.0-rc1");
      expect(result).toBe("v");
    });

    it('should handle prerelease without v prefix "1.0.0-alpha"', () => {
      const result = detectTagPrefix("1.0.0-alpha");
      expect(result).toBe("");
    });
  });

  describe("edge cases", () => {
    it("should return empty string for non-version tag", () => {
      const result = detectTagPrefix("latest");
      expect(result).toBe("");
    });

    it("should return empty string for empty string", () => {
      const result = detectTagPrefix("");
      expect(result).toBe("");
    });

    it("should handle single number (not a valid version)", () => {
      const result = detectTagPrefix("v1");
      // "v1" doesn't match semver pattern (needs at least major.minor)
      expect(result).toBe("");
    });

    it('should handle complex prefixes like "release-v1.0.0"', () => {
      const result = detectTagPrefix("release-v1.0.0");
      expect(result).toBe("release-v");
    });
  });
});
