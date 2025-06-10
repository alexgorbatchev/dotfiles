/**
 * @file generator/src/testing-helpers/createMockClientLogger.ts
 * @description Shared testing helper for creating a mock ConsolaInstance (client logger).
 */

import type { ConsolaInstance, ConsolaOptions, LogType, InputLogObject, ConsolaReporter } from 'consola'; // Removed LogObject
import { mock, type Mock } from 'bun:test';

// Define a local type for LogFn as it's not directly exported by Consola in a way we can use for mocks.
// This type represents the structure of methods like `consola.info`, `consola.warn`, etc.
type LocalLogFn = {
  (...args: any[]): void;
  raw: (...args: any[]) => void;
};

// Helper type for a mocked LogFn (callable + .raw) using Bun's Mock
type LoggerMethodMock = Mock<LocalLogFn['prototype']> & { raw: Mock<LocalLogFn['raw']> };
// For methods like box that return string but still have .raw
type LoggerMethodReturningStringMock = Mock<(...args: any[]) => string> & { raw: Mock<(...args: any[]) => void> };
// For other specific return types
type LoggerMethodReturningPromiseMock = Mock<(...args: any[]) => Promise<any>>;
type LoggerMethodReturningInstanceMock = Mock<(...args: any[]) => ConsolaInstance>;
type LoggerMethodReturningInstanceOrReportersMock = Mock<(...args: any[]) => ConsolaInstance | ConsolaReporter[]>;

// Helper function to create a mock LogFn (callable + .raw)
const createBunMockLogFn = (): LoggerMethodMock => {
  const fn = mock((..._args: any[]) => {}) as LoggerMethodMock;
  fn.raw = mock((..._args: any[]) => {});
  return fn;
};

const createBunMockLogFnReturningString = (): LoggerMethodReturningStringMock => {
  const fn = mock((..._args: any[]) => '') as LoggerMethodReturningStringMock;
  fn.raw = mock((..._args: any[]) => {});
  return fn;
};

export interface MockClientLoggerOptions {
  debug?: LoggerMethodMock;
  info?: LoggerMethodMock;
  log?: LoggerMethodMock;
  warn?: LoggerMethodMock;
  error?: LoggerMethodMock;
  success?: LoggerMethodMock;
  fatal?: LoggerMethodMock;
  trace?: LoggerMethodMock;
  verbose?: LoggerMethodMock;
  fail?: LoggerMethodMock;
  ready?: LoggerMethodMock;
  start?: LoggerMethodMock;
  silent?: LoggerMethodMock;

  box?: LoggerMethodReturningStringMock;

  prompt?: LoggerMethodReturningPromiseMock;

  setReporters?: Mock<(reporters: ConsolaReporter[]) => ConsolaInstance>;
  addReporter?: LoggerMethodReturningInstanceMock;
  removeReporter?: LoggerMethodReturningInstanceOrReportersMock;

  // For simplicity, assume these don't need .raw or use a simpler mock if they do.
  // If they need full LogFn structure, they should use LoggerMethodMock.
  wrapConsole?: Mock<(...args: any[]) => void>;
  restoreConsole?: Mock<(...args: any[]) => void>;
  wrapStd?: Mock<(...args: any[]) => void>;
  restoreStd?: Mock<(...args: any[]) => void>;
  wrapAll?: Mock<(...args: any[]) => void>;
  restoreAll?: Mock<(...args: any[]) => void>;

  pauseLogs?: Mock<(...args: any[]) => void>;
  resumeLogs?: Mock<(...args: any[]) => void>;
  // Correct signature for mockTypes based on ConsolaInstance
  mockTypes?: Mock<ConsolaInstance['mockTypes']>;

  create?: LoggerMethodReturningInstanceMock;
  // withScope removed as it's not standard on ConsolaInstance
  withTag?: LoggerMethodReturningInstanceMock;
  withDefaults?: Mock<(defaults: Partial<InputLogObject>) => ConsolaInstance>;

  formatWithOptions?: Mock<(...args: any[]) => string>; // No .raw typically
  throttle?: Mock<(...args: any[]) => void>; // Simpler mock, or LoggerMethodMock if .raw needed

  _restoreStream?: Mock<(...args: any[]) => void>;
  _wrapLogFn?: Mock<(...args: any[]) => any>;
  _logFn?: LoggerMethodMock; // Assumed to be LogFn-like
  _log?: LoggerMethodMock;   // Assumed to be LogFn-like
  _wrapStream?: Mock<(...args: any[]) => any>;
}

export type LoggerMocks = {
  // Make all properties of MockClientLoggerOptions required and non-nullable for the loggerMocks object
  [K in keyof MockClientLoggerOptions]-?: NonNullable<MockClientLoggerOptions[K]>;
};

export interface CreateMockClientLoggerResult {
  mockClientLogger: ConsolaInstance;
  loggerMocks: LoggerMocks;
}

const defaultLogTypes: Record<LogType, InputLogObject> = {
  silent: { level: -1 },
  fatal: { level: 0 },
  error: { level: 0 },
  warn: { level: 1 },
  log: { level: 2 },
  info: { level: 3 },
  success: { level: 3 },
  debug: { level: 4 },
  trace: { level: 5 },
  verbose: { level: Infinity },
  fail: { level: 0 },
  ready: { level: 3 },
  start: { level: 3 },
  box: { level: 2 },
};

export function createMockClientLogger(
  optionsParam: MockClientLoggerOptions = {}
): CreateMockClientLoggerResult {
  let mockClientLoggerInstance: ConsolaInstance; // Late-initialized

  const loggerMocksInternal = {
    debug: optionsParam.debug ?? createBunMockLogFn(),
    info: optionsParam.info ?? createBunMockLogFn(),
    log: optionsParam.log ?? createBunMockLogFn(),
    warn: optionsParam.warn ?? createBunMockLogFn(),
    error: optionsParam.error ?? createBunMockLogFn(),
    success: optionsParam.success ?? createBunMockLogFn(),
    fatal: optionsParam.fatal ?? createBunMockLogFn(),
    trace: optionsParam.trace ?? createBunMockLogFn(),
    verbose: optionsParam.verbose ?? createBunMockLogFn(),
    fail: optionsParam.fail ?? createBunMockLogFn(),
    ready: optionsParam.ready ?? createBunMockLogFn(),
    start: optionsParam.start ?? createBunMockLogFn(),
    silent: optionsParam.silent ?? createBunMockLogFn(),

    box: optionsParam.box ?? createBunMockLogFnReturningString(),
    prompt: optionsParam.prompt ?? mock(async () => 'mocked prompt answer'),

    wrapConsole: optionsParam.wrapConsole ?? mock(() => {}),
    restoreConsole: optionsParam.restoreConsole ?? mock(() => {}),
    wrapStd: optionsParam.wrapStd ?? mock(() => {}),
    restoreStd: optionsParam.restoreStd ?? mock(() => {}),
    wrapAll: optionsParam.wrapAll ?? mock(() => {}),
    restoreAll: optionsParam.restoreAll ?? mock(() => {}),

    pauseLogs: optionsParam.pauseLogs ?? mock(() => {}),
    resumeLogs: optionsParam.resumeLogs ?? mock(() => {}),
    // Default mock for mockTypes matching Consola's signature
    mockTypes: optionsParam.mockTypes ?? mock((() => {}) as ConsolaInstance['mockTypes']),

    formatWithOptions: optionsParam.formatWithOptions ?? mock(() => 'formatted string'),
    throttle: optionsParam.throttle ?? mock(() => {}),

    _restoreStream: optionsParam._restoreStream ?? mock(() => {}),
    _wrapLogFn: optionsParam._wrapLogFn ?? mock(() => ({} as any)),
    _logFn: optionsParam._logFn ?? createBunMockLogFn(),
    _log: optionsParam._log ?? createBunMockLogFn(),
    _wrapStream: optionsParam._wrapStream ?? mock(() => ({} as any)),

    // Methods returning `this` (ConsolaInstance)
    // Initialize with a temporary mock, will be replaced by one returning mockClientLoggerInstance
    addReporter: optionsParam.addReporter ?? mock((..._args: any[]) => undefined as unknown as ConsolaInstance),
    removeReporter: optionsParam.removeReporter ?? mock((..._args: any[]) => undefined as unknown as ConsolaInstance),
    create: optionsParam.create ?? mock((..._args: any[]) => undefined as unknown as ConsolaInstance),
    withTag: optionsParam.withTag ?? mock((..._args: any[]) => undefined as unknown as ConsolaInstance),
    setReporters: optionsParam.setReporters ?? mock((..._args: any[]) => undefined as unknown as ConsolaInstance),
    withDefaults: optionsParam.withDefaults ?? mock((..._args: any[]) => undefined as unknown as ConsolaInstance),
  };

  mockClientLoggerInstance = {
    ...(loggerMocksInternal as any), // Cast to any to allow spreading, will be type-checked by ConsolaInstance

    // --- Properties of ConsolaInstance ---
    level: 3, // Default level
    options: { // Default options
      level: 3,
      types: defaultLogTypes,
      reporters: [] as ConsolaReporter[],
      stdout: process.stdout,
      stderr: process.stderr,
      defaults: {},
      throttle: 1000,
      throttleMin: 1,
      formatOptions: { colors: false, date: false, compact: true } as ConsolaOptions['formatOptions'],
    } as ConsolaOptions,
    stdout: process.stdout,
    stderr: process.stderr,
    paused: false,
    _lastLog: {
      serialized: undefined,
      object: undefined,
      count: undefined,
      time: undefined,
      timeout: undefined,
    } as ConsolaInstance['_lastLog'],
  } as ConsolaInstance;

  // Now, correctly set up mocks that return the instance itself
  loggerMocksInternal.addReporter.mockImplementation(() => mockClientLoggerInstance);
  loggerMocksInternal.removeReporter.mockImplementation(() => mockClientLoggerInstance); // Default to instance
  loggerMocksInternal.create.mockImplementation(() => mockClientLoggerInstance);
  loggerMocksInternal.withTag.mockImplementation(() => mockClientLoggerInstance);
  loggerMocksInternal.setReporters.mockImplementation(() => mockClientLoggerInstance);
  loggerMocksInternal.withDefaults.mockImplementation(() => mockClientLoggerInstance);
  
  // Re-assign to the instance after mockImplementations are set
  mockClientLoggerInstance.addReporter = loggerMocksInternal.addReporter;
  mockClientLoggerInstance.removeReporter = loggerMocksInternal.removeReporter;
  mockClientLoggerInstance.create = loggerMocksInternal.create;
  mockClientLoggerInstance.withTag = loggerMocksInternal.withTag;
  mockClientLoggerInstance.setReporters = loggerMocksInternal.setReporters;
  mockClientLoggerInstance.withDefaults = loggerMocksInternal.withDefaults;


  return {
    mockClientLogger: mockClientLoggerInstance,
    loggerMocks: loggerMocksInternal as LoggerMocks, // Cast to the exported LoggerMocks type
  };
}
