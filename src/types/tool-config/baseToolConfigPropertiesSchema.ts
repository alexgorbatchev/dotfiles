import { z } from 'zod';
import { commonToolConfigPropertiesSchema } from './commonToolConfigPropertiesSchema';
import { platformConfigEntrySchema } from './platformConfigEntrySchema';

export const baseToolConfigPropertiesSchema = commonToolConfigPropertiesSchema
	.extend({
		/** The unique name of the tool, as defined by `c.name()`. */
		name: z.string().min(1),
		/** The desired version of the tool, defined by `c.version()`. Defaults to 'latest'. */
		version: z.string(),
		/** The absolute path to the tool configuration file that defined this configuration. */
		configFilePath: z.string().optional(),
		/**
		 * An array of platform-specific configurations.
		 * Each entry defines configurations for a specific set of platforms and optionally architectures.
		 */
		platformConfigs: z.array(platformConfigEntrySchema).optional(),
	})
	.strict();

/**
 * Base properties common to all variants of a fully resolved ToolConfig.
 * This represents the internal data structure after the `ToolConfigBuilder` has been processed.
 */
export type BaseToolConfigProperties = z.infer<typeof baseToolConfigPropertiesSchema>;
