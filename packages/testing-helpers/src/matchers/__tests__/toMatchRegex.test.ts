import { describe, expect, it } from "bun:test";
// oxlint-disable-next-line import/no-unassigned-import
import "../toMatchRegex";

describe("toMatchRegex", () => {
  describe("basic matching", () => {
    it("matches single-line string with regex", () => {
      expect("hello world").toMatchRegex(/hello/);
    });

    it("matches pattern anywhere in string", () => {
      expect("prefix hello world suffix").toMatchRegex(/hello world/);
    });

    it("fails when pattern not found", () => {
      expect(() => {
        expect("hello world").toMatchRegex(/goodbye/);
      }).toThrow();
    });
  });

  describe("version patterns", () => {
    it("matches semantic version", () => {
      expect("version 1.2.3").toMatchRegex(/\d+\.\d+\.\d+/);
    });

    it("matches version with prefix", () => {
      expect("v1.0.0-beta").toMatchRegex(/v\d+\.\d+\.\d+/);
    });
  });

  describe("newline rejection", () => {
    it("fails when input contains newline", () => {
      expect(() => {
        expect("line1\nline2").toMatchRegex(/line1/);
      }).toThrow(/toMatchLooseInlineSnapshot/);
    });

    it("fails when input has multiple newlines", () => {
      expect(() => {
        expect("line1\nline2\nline3").toMatchRegex(/line/);
      }).toThrow(/toMatchLooseInlineSnapshot/);
    });

    it("fails with trailing newline", () => {
      expect(() => {
        expect("content\n").toMatchRegex(/content/);
      }).toThrow(/toMatchLooseInlineSnapshot/);
    });

    it("fails with leading newline", () => {
      expect(() => {
        expect("\ncontent").toMatchRegex(/content/);
      }).toThrow(/toMatchLooseInlineSnapshot/);
    });
  });

  describe("type validation", () => {
    it("fails when input is not a string", () => {
      expect(() => {
        expect(123).toMatchRegex(/\d+/);
      }).toThrow(/Expected a string/);
    });

    it("fails when input is null", () => {
      expect(() => {
        expect(null).toMatchRegex(/test/);
      }).toThrow(/Expected a string/);
    });

    it("fails when input is undefined", () => {
      expect(() => {
        expect(undefined).toMatchRegex(/test/);
      }).toThrow(/Expected a string/);
    });
  });

  describe("negation", () => {
    it("supports .not modifier", () => {
      expect("hello world").not.toMatchRegex(/goodbye/);
    });

    it("negation fails when pattern matches", () => {
      expect(() => {
        expect("hello world").not.toMatchRegex(/hello/);
      }).toThrow();
    });
  });
});
