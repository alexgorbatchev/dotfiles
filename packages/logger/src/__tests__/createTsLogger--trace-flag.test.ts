import { describe, expect, it } from 'bun:test';
import { createTsLogger } from '../createTsLogger';
import { LogLevel } from '../LogLevel';

describe('createTsLogger - trace flag', () => {
  it('should include file path with line when trace is enabled at DEFAULT log level', () => {
    const logger = createTsLogger({
      name: 'test',
      level: LogLevel.DEFAULT,
      trace: true,
    });

    // Access the internal settings to verify prettyLogTemplate includes file path
    const settings = (logger as unknown as { settings: { prettyLogTemplate: string; }; }).settings;
    expect(settings.prettyLogTemplate).toContain('{{filePathWithLine}}');
  });

  it('should NOT include file path with line when trace is disabled at DEFAULT log level', () => {
    const logger = createTsLogger({
      name: 'test',
      level: LogLevel.DEFAULT,
      trace: false,
    });

    const settings = (logger as unknown as { settings: { prettyLogTemplate: string; }; }).settings;
    expect(settings.prettyLogTemplate).not.toContain('{{filePathWithLine}}');
  });

  it('should NOT include file path with line when trace is not specified at DEFAULT log level', () => {
    const logger = createTsLogger({
      name: 'test',
      level: LogLevel.DEFAULT,
    });

    const settings = (logger as unknown as { settings: { prettyLogTemplate: string; }; }).settings;
    expect(settings.prettyLogTemplate).not.toContain('{{filePathWithLine}}');
  });

  it('should include file path with line when trace is enabled at VERBOSE log level', () => {
    const logger = createTsLogger({
      name: 'test',
      level: LogLevel.VERBOSE,
      trace: true,
    });

    const settings = (logger as unknown as { settings: { prettyLogTemplate: string; }; }).settings;
    expect(settings.prettyLogTemplate).toContain('{{filePathWithLine}}');
  });

  it('should include file path with line when trace is enabled at QUIET log level', () => {
    // Even at quiet level, if trace is enabled, the template is set (though no logs show)
    const logger = createTsLogger({
      name: 'test',
      level: LogLevel.QUIET,
      trace: true,
    });

    const settings = (logger as unknown as { settings: { prettyLogTemplate: string; }; }).settings;
    expect(settings.prettyLogTemplate).toContain('{{filePathWithLine}}');
  });

  it('should NOT include file path with line at VERBOSE level without trace flag', () => {
    const logger = createTsLogger({
      name: 'test',
      level: LogLevel.VERBOSE,
    });

    const settings = (logger as unknown as { settings: { prettyLogTemplate: string; }; }).settings;
    expect(settings.prettyLogTemplate).not.toContain('{{filePathWithLine}}');
  });
});
