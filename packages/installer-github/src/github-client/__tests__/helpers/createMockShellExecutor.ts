import { mock } from 'bun:test';
import type { IShellExecutor, IShellResult } from '../../IShellExecutor';

/**
 * Mock response for a shell command.
 */
export interface IMockShellResponse {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Creates a mock shell executor for testing.
 * Allows configuring responses for specific commands.
 */
export interface IMockShellExecutor extends IShellExecutor {
  execute: ReturnType<typeof mock<IShellExecutor['execute']>>;
  /** Configure response for next call */
  mockNextResponse: (response: IMockShellResponse) => void;
  /** Configure response for specific endpoint pattern */
  mockResponseForEndpoint: (endpointPattern: string | RegExp, response: IMockShellResponse) => void;
  /** Clear all mocked responses */
  clearMocks: () => void;
}

/**
 * Creates a mock shell executor for testing GhCliApiClient.
 *
 * @example
 * ```typescript
 * const mockExecutor = createMockShellExecutor();
 *
 * // Configure response for a specific endpoint
 * mockExecutor.mockResponseForEndpoint(/releases\/latest/, {
 *   stdout: JSON.stringify({ tag_name: 'v1.0.0' }),
 *   stderr: '',
 *   exitCode: 0,
 * });
 *
 * // Or configure the next response
 * mockExecutor.mockNextResponse({
 *   stdout: JSON.stringify({ tag_name: 'v1.0.0' }),
 *   stderr: '',
 *   exitCode: 0,
 * });
 * ```
 */
export function createMockShellExecutor(): IMockShellExecutor {
  const endpointResponses = new Map<string | RegExp, IMockShellResponse>();
  let nextResponse: IMockShellResponse | null = null;

  const executeMock = mock(async (_command: string, args: string[]): Promise<IShellResult> => {
    // Find the endpoint in the args (last argument after 'api')
    const apiIndex = args.indexOf('api');
    const endpoint = apiIndex >= 0 ? args[apiIndex + 1] || args[args.length - 1] : args[args.length - 1];

    // Check for configured next response
    if (nextResponse) {
      const response = nextResponse;
      nextResponse = null;
      return response;
    }

    // Check for endpoint-specific responses
    for (const [pattern, response] of endpointResponses) {
      if (typeof pattern === 'string') {
        if (endpoint && endpoint.includes(pattern)) {
          return response;
        }
      } else if (endpoint && pattern.test(endpoint)) {
        return response;
      }
    }

    // Default: simulate not found
    return {
      stdout: '',
      stderr: 'gh: Not Found (HTTP 404)',
      exitCode: 1,
    };
  });

  return {
    execute: executeMock,
    mockNextResponse: (response: IMockShellResponse) => {
      nextResponse = response;
    },
    mockResponseForEndpoint: (pattern: string | RegExp, response: IMockShellResponse) => {
      endpointResponses.set(pattern, response);
    },
    clearMocks: () => {
      endpointResponses.clear();
      nextResponse = null;
      executeMock.mockClear();
    },
  };
}

/**
 * Creates a successful JSON response for gh api.
 */
export function createSuccessResponse<T>(data: T): IMockShellResponse {
  return {
    stdout: JSON.stringify(data),
    stderr: '',
    exitCode: 0,
  };
}

/**
 * Creates an error response for gh api.
 */
export function createErrorResponse(message: string, exitCode: number = 1): IMockShellResponse {
  return {
    stdout: '',
    stderr: message,
    exitCode,
  };
}
