/**
 * Augments the 'commander' module with extra typings.
 *
 * @remarks
 * This is necessary to provide strong typing for commander when using it
 * with TypeScript. It re-exports all typings from
 * `@commander-js/extra-typings`.
 */
declare module 'commander' {
  export * from '@commander-js/extra-typings';
}
