/**
 * Schema-only exports for the CLI package.
 * This file is used by the build process to generate the schemas.d.ts bundle.
 */

import type {
  YamlConfig as ConfigYamlConfig,
  YamlConfigPartial as ConfigYamlConfigPartial,
  YamlConfigPaths as ConfigYamlConfigPaths,
} from '@dotfiles/config';
import type { always as coreAlways, once as coreOnce } from '@dotfiles/core';

type PlatformOverrides = NonNullable<ConfigYamlConfig['platform']>;
type MatchCriteria = PlatformOverrides[number]['match'][number];
type ExtractString<T> = T extends string ? T : never;

// Re-export core-derived types used in schemas
export type Architecture = ExtractString<MatchCriteria['arch']>;
export type Platform = ExtractString<MatchCriteria['os']>;
export type always = typeof coreAlways;
export type once = typeof coreOnce;

// Re-export config types
export type YamlConfig = ConfigYamlConfig;
export type YamlConfigPartial = ConfigYamlConfigPartial;
export type YamlConfigPaths = ConfigYamlConfigPaths;

// Re-export the defineTool function with all plugin augmentations loaded
// biome-ignore lint/plugin: Named export required for selective API exposure
export { defineTool } from './defineToolWithPlugins';
