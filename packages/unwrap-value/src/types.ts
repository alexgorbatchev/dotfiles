/**
 * A value that can be resolved from a static value, sync function, or async function.
 *
 * @template TParams - The type of parameters passed to the resolver function
 * @template TReturn - The type of the resolved value
 */
export type Resolvable<TParams, TReturn> =
  | TReturn
  | ((params: TParams) => TReturn)
  | ((params: TParams) => Promise<TReturn>);
