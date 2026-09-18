import { defineTool } from "@alexgorbatchev/dotfiles";
import { expectError } from "tsd";

// This test verifies that IKnownBinNameRegistry module augmentation works: it is the
// mechanism a project's generated tool-types.d.ts uses to list its configured binary
// names. The augmentation below adds 'foo' and 'bar', so only those should be valid.

// Augment the registry with test values
declare module "@alexgorbatchev/dotfiles" {
  export interface z_internal_IKnownBinNameRegistry {
    foo: never;
    bar: never;
  }
}

// Valid: 'foo' is in the registry
defineTool((install) => install().dependsOn("foo"));

// Valid: 'bar' is in the registry
defineTool((install) => install().dependsOn("bar"));

// Invalid: 'invalid-dependency' is not in the registry
expectError(defineTool((install) => install().dependsOn("invalid-dependency")));
