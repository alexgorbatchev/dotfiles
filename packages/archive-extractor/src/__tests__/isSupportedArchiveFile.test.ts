import { describe, expect, it } from "bun:test";
import { isSupportedArchiveFile, SUPPORTED_ARCHIVE_FORMATS } from "../isSupportedArchiveFile";

describe("isSupportedArchiveFile", (): void => {
  describe("tar.gz format", (): void => {
    it("should return true for .tar.gz extension", (): void => {
      expect(isSupportedArchiveFile("tool-v1.0.0.tar.gz")).toBe(true);
    });

    it("should return true for .tgz extension", (): void => {
      expect(isSupportedArchiveFile("tool-v1.0.0.tgz")).toBe(true);
    });
  });

  describe("tar.bz2 format", (): void => {
    it("should return true for .tar.bz2 extension", (): void => {
      expect(isSupportedArchiveFile("tool-v1.0.0.tar.bz2")).toBe(true);
    });

    it("should return true for .tbz2 extension", (): void => {
      expect(isSupportedArchiveFile("tool-v1.0.0.tbz2")).toBe(true);
    });

    it("should return true for .tbz extension", (): void => {
      expect(isSupportedArchiveFile("tool-v1.0.0.tbz")).toBe(true);
    });
  });

  describe("tar.xz format", (): void => {
    it("should return true for .tar.xz extension", (): void => {
      expect(isSupportedArchiveFile("tool-v1.0.0.tar.xz")).toBe(true);
    });

    it("should return true for .txz extension", (): void => {
      expect(isSupportedArchiveFile("tool-v1.0.0.txz")).toBe(true);
    });
  });

  describe("other supported formats", (): void => {
    it("should return true for .tar extension", (): void => {
      expect(isSupportedArchiveFile("tool-v1.0.0.tar")).toBe(true);
    });

    it("should return true for .zip extension", (): void => {
      expect(isSupportedArchiveFile("tool-v1.0.0.zip")).toBe(true);
    });

    it("should return true for .gz extension (single-file gzip)", (): void => {
      expect(isSupportedArchiveFile("hermit-darwin-arm64.gz")).toBe(true);
    });
  });

  describe("unsupported formats", (): void => {
    it("should return false for .rar extension (not implemented)", (): void => {
      expect(isSupportedArchiveFile("tool-v1.0.0.rar")).toBe(false);
    });

    it("should return false for .7z extension (not implemented)", (): void => {
      expect(isSupportedArchiveFile("tool-v1.0.0.7z")).toBe(false);
    });

    it("should return false for .deb extension (not implemented)", (): void => {
      expect(isSupportedArchiveFile("tool-v1.0.0.deb")).toBe(false);
    });

    it("should return false for .rpm extension (not implemented)", (): void => {
      expect(isSupportedArchiveFile("tool-v1.0.0.rpm")).toBe(false);
    });

    it("should return false for .dmg extension (not implemented)", (): void => {
      expect(isSupportedArchiveFile("tool-v1.0.0.dmg")).toBe(false);
    });
  });

  describe("non-archive files", (): void => {
    it("should return false for .exe extension", (): void => {
      expect(isSupportedArchiveFile("tool.exe")).toBe(false);
    });

    it("should return false for plain binary with no extension", (): void => {
      expect(isSupportedArchiveFile("tool-linux-amd64")).toBe(false);
    });

    it("should return false for .txt extension", (): void => {
      expect(isSupportedArchiveFile("README.txt")).toBe(false);
    });
  });

  describe("case insensitivity", (): void => {
    it("should handle uppercase extensions", (): void => {
      expect(isSupportedArchiveFile("tool-v1.0.0.TAR.GZ")).toBe(true);
      expect(isSupportedArchiveFile("tool-v1.0.0.ZIP")).toBe(true);
      expect(isSupportedArchiveFile("tool-v1.0.0.TBZ")).toBe(true);
    });

    it("should handle mixed case extensions", (): void => {
      expect(isSupportedArchiveFile("tool-v1.0.0.Tar.Gz")).toBe(true);
      expect(isSupportedArchiveFile("tool-v1.0.0.TBz2")).toBe(true);
    });
  });

  describe("paths with directories", (): void => {
    it("should work with full paths", (): void => {
      expect(isSupportedArchiveFile("/downloads/tool-v1.0.0.tar.gz")).toBe(true);
      expect(isSupportedArchiveFile("/downloads/tool-v1.0.0.tbz")).toBe(true);
    });
  });
});

describe("SUPPORTED_ARCHIVE_FORMATS", (): void => {
  it("should include expected formats", (): void => {
    expect(SUPPORTED_ARCHIVE_FORMATS).toEqual(["tar.gz", "tar.bz2", "tar.xz", "tar", "zip", "gzip"]);
  });
});
