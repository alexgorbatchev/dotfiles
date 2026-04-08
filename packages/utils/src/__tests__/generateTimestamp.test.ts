import { describe, expect, it } from "bun:test";
import { generateTimestamp } from "../generateTimestamp";

describe("generateTimestamp", () => {
  it("should generate timestamp in correct format", () => {
    const testDate = new Date("2024-08-13T16:45:23.123Z");
    const timestamp = generateTimestamp(testDate);

    expect(timestamp).toBe("2024-08-13-16-45-23");
  });

  it("should pad single digits with zeros", () => {
    const testDate = new Date("2024-01-05T09:07:03.456Z");
    const timestamp = generateTimestamp(testDate);

    expect(timestamp).toBe("2024-01-05-09-07-03");
  });

  it("should generate different timestamps for different times", () => {
    const date1 = new Date("2024-08-13T16:45:23.000Z");
    const date2 = new Date("2024-08-13T16:45:24.000Z");

    const timestamp1 = generateTimestamp(date1);
    const timestamp2 = generateTimestamp(date2);

    expect(timestamp1).not.toBe(timestamp2);
    expect(timestamp1).toBe("2024-08-13-16-45-23");
    expect(timestamp2).toBe("2024-08-13-16-45-24");
  });

  it("should generate timestamp for current date when no date provided", () => {
    const timestamp = generateTimestamp();

    // Should match the pattern YYYY-MM-DD-HH-MM-SS
    expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}$/);
  });
});
