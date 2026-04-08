import { describe, expect, test } from "bun:test";

import { formatBytes } from "../format";

describe("formatBytes", () => {
  test("formats zero bytes", () => {
    expect(formatBytes(0)).toBe("0 B");
  });

  test("formats bytes under 1KB", () => {
    expect(formatBytes(500)).toBe("500 B");
    expect(formatBytes(1023)).toBe("1023 B");
  });

  test("formats kilobytes", () => {
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(10240)).toBe("10 KB");
  });

  test("formats megabytes", () => {
    expect(formatBytes(1048576)).toBe("1.0 MB");
    expect(formatBytes(1572864)).toBe("1.5 MB");
    expect(formatBytes(10485760)).toBe("10 MB");
  });

  test("formats gigabytes", () => {
    expect(formatBytes(1073741824)).toBe("1.0 GB");
    expect(formatBytes(1610612736)).toBe("1.5 GB");
    expect(formatBytes(10737418240)).toBe("10 GB");
  });

  test("caps at gigabytes for very large values", () => {
    expect(formatBytes(1099511627776)).toBe("1024 GB");
  });
});
