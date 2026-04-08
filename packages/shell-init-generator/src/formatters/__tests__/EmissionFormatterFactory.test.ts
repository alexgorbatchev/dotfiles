import { describe, expect, it } from "bun:test";
import { BashEmissionFormatter } from "../BashEmissionFormatter";
import { createEmissionFormatter } from "../EmissionFormatterFactory";
import { PowerShellEmissionFormatter } from "../PowerShellEmissionFormatter";
import { ZshEmissionFormatter } from "../ZshEmissionFormatter";

describe("EmissionFormatterFactory", () => {
  const config = {};

  it("should create ZshEmissionFormatter for zsh", () => {
    const formatter = createEmissionFormatter("zsh", config);
    expect(formatter).toBeInstanceOf(ZshEmissionFormatter);
    expect(formatter.fileExtension).toBe(".zsh");
  });

  it("should create BashEmissionFormatter for bash", () => {
    const formatter = createEmissionFormatter("bash", config);
    expect(formatter).toBeInstanceOf(BashEmissionFormatter);
    expect(formatter.fileExtension).toBe(".bash");
  });

  it("should create PowerShellEmissionFormatter for powershell", () => {
    const formatter = createEmissionFormatter("powershell", config);
    expect(formatter).toBeInstanceOf(PowerShellEmissionFormatter);
    expect(formatter.fileExtension).toBe(".ps1");
  });

  it("should throw for unsupported shell type", () => {
    // @ts-expect-error Testing invalid shell type
    expect(() => createEmissionFormatter("fish", config)).toThrow("Unsupported shell type: fish");
  });
});
