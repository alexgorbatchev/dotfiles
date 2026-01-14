import type { Resolvable } from './types';

/**
 * Resolves a Resolvable value to its actual value.
 *
 * Handles three cases:
 * - Static value: returns the value directly
 * - Sync function: calls the function and returns the result
 * - Async function: calls the function and awaits the result
 *
 * @template TParams - The type of parameters passed to the resolver function
 * @template TReturn - The type of the resolved value
 * @param params - Parameters to pass to the resolver function if it's a function
 * @param resolvable - The value to resolve (static, sync function, or async function)
 * @returns A promise that resolves to the unwrapped value
 */
export async function resolveValue<TParams, TReturn>(
  params: TParams,
  resolvable: Resolvable<TParams, TReturn>,
): Promise<TReturn> {
  if (typeof resolvable === 'function') {
    const fn = resolvable as (params: TParams) => TReturn | Promise<TReturn>;
    return await fn(params);
  }
  return resolvable;
}
