import { z } from "zod";
import { commonToolConfigPropertiesSchema } from "./commonToolConfigPropertiesSchema";

/**
 * Base properties for tool configurations. This is the foundation schema that all plugin-specific
 * tool configs extend from.
 *
 * Note: platformConfigs are NOT included here because they are a composition concern handled by
 * the plugin system, not individual plugin schemas. Platform configurations are added at the
 * ToolConfig union level in the installer-plugin-system package.
 */
export const baseToolConfigPropertiesSchema = commonToolConfigPropertiesSchema
  .extend({
    /** The unique name of the tool, as defined by `c.name()`. */
    name: z.string().min(1),
    /** The desired version of the tool, defined by `c.version()`. Defaults to 'latest'. */
    version: z.string(),
    /** The absolute path to the tool configuration file that defined this configuration. */
    configFilePath: z.string().optional(),
  })
  .strict();
