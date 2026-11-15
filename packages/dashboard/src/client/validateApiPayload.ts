import { z } from "zod";
import type { IFileTreeEntry } from "../shared/types";

const capabilitySchema = z.object({ enabled: z.boolean(), reason: z.string() });

const toolSchema = z.object({
  metadata: z.object({
    applicability: z.enum(["active", "disabled", "different-host", "inactive-platform"]),
    reason: z.string(),
    kind: z.enum(["installable", "configuration-only", "invalid"]),
    requestedVersion: z.string(),
    updateMode: z.enum(["update", "reinstall"]),
    actions: z.object({
      install: capabilitySchema,
      check: capabilitySchema,
      update: capabilitySchema,
      reinstall: capabilitySchema,
    }),
  }),
  config: z.object({
    name: z.string(),
    version: z.string().optional(),
    installationMethod: z.string().optional(),
    installParams: z
      .object({
        repo: z.string().optional(),
        ghCli: z.boolean().optional(),
        crate: z.string().optional(),
        formula: z.string().optional(),
        url: z.string().optional(),
      })
      .optional(),
    binaries: z.array(z.union([z.string(), z.object({ name: z.string() })])).optional(),
    dependencies: z.array(z.string()).optional(),
    hostname: z.string().optional(),
  }),
  runtime: z.object({
    status: z.enum(["installed", "not-installed", "error"]),
    installedVersion: z.string().nullable(),
    installedAt: z.string().nullable(),
    installPath: z.string().nullable(),
    binaryPaths: z.array(z.string()).nullable(),
  }),
  files: z.array(z.object({ filePath: z.string(), toolName: z.string(), fileType: z.string() })),
  binaryDiskSize: z.number(),
  usage: z.object({
    totalCount: z.number(),
    binaries: z.array(z.object({ binaryName: z.string(), count: z.number(), lastUsedAt: z.string().nullable() })),
  }),
  drift: z
    .array(
      z.object({
        toolName: z.string(),
        filePath: z.string(),
        blockId: z.string().optional(),
        type: z.enum(["symlink", "copy", "template", "block"]),
        state: z.enum(["new", "in-sync", "unmanaged", "missing", "upstream-update", "local-drift", "conflict"]),
        diff: z.string().optional(),
        currentContent: z.string().optional(),
        desiredContent: z.string().optional(),
      }),
    )
    .optional(),
});

const treeEntrySchema: z.ZodType<IFileTreeEntry> = z.lazy(() =>
  z.object({
    name: z.string(),
    path: z.string(),
    type: z.enum(["file", "directory"]),
    children: z.array(treeEntrySchema).optional(),
    toolName: z.string().optional(),
  }),
);

const schemas: Record<string, z.ZodType> = {
  "/tools": z.array(toolSchema),
  "/config": z.object({
    configFilePath: z.string(),
    dotfilesDir: z.string(),
    generatedDir: z.string(),
    binariesDir: z.string(),
    targetDir: z.string(),
    toolConfigsDir: z.union([z.string(), z.array(z.string())]),
    version: z.string().optional(),
  }),
  "/health": z.object({
    overall: z.enum(["healthy", "warning", "unhealthy"]),
    lastCheck: z.string(),
    checks: z.array(
      z.object({
        id: z.string(),
        findings: z.array(
          z.object({
            kind: z.enum(["missing-binary", "missing-installation", "unused-version"]),
            toolName: z.string(),
            path: z.string(),
            severity: z.enum(["warning", "error"]),
            configured: z.boolean(),
          }),
        ),
        name: z.string(),
        status: z.enum(["pass", "warn", "fail"]),
        message: z.string(),
        details: z.array(z.string()).optional(),
      }),
    ),
  }),
  "/recent-tools": z.object({
    tools: z.array(
      z.object({
        name: z.string(),
        configFilePath: z.string(),
        relativeTime: z.string(),
        timestampSource: z.enum(["git", "mtime"]),
      }),
    ),
  }),
  "/tool-configs-tree": z.object({
    roots: z.array(z.object({ label: z.string(), path: z.string(), entries: z.array(treeEntrySchema) })),
  }),
  history: z.object({
    entries: z.array(
      z.object({
        id: z.number(),
        operationType: z.string(),
        fileType: z.string(),
        filePath: z.string(),
        relativeTime: z.string(),
      }),
    ),
    totalCount: z.number(),
    installedAt: z.string().nullable(),
    dotfilesDir: z.string(),
  }),
  source: z.object({ content: z.string(), filePath: z.string() }),
  readme: z.object({ content: z.string() }),
};

const checkStatusSchema = z.enum(["up-to-date", "update-available", "ahead-of-latest", "unsupported", "not-installed"]);
const postSchemas: Record<string, z.ZodType> = {
  install: z.discriminatedUnion("installed", [
    z.object({ installed: z.literal(true), version: z.string(), alreadyInstalled: z.boolean().optional() }),
    z.object({ installed: z.literal(false), error: z.string().optional() }),
  ]),
  update: z.object({
    updated: z.boolean(),
    oldVersion: z.string(),
    newVersion: z.string(),
    status: checkStatusSchema,
    latestVersion: z.string(),
    reinstalled: z.boolean(),
  }),
  "check-update": z.object({
    status: checkStatusSchema,
    currentVersion: z.string(),
    latestVersion: z.string(),
    error: z.string().optional(),
  }),
};

type RequestMethod = "GET" | "POST";

/** Check consumed fields without stripping additional server fields or changing the wire contract. */
export function validateApiPayload(endpoint: string, data: unknown, method: RequestMethod = "GET"): void {
  const pathname = endpoint.split("?")[0] ?? endpoint;
  const toolPanel = /^\/tools\/[^/]+\/(history|source|readme)$/.exec(pathname)?.[1];
  const operation = /^\/tools\/[^/]+\/(install|update|check-update)$/.exec(pathname)?.[1];
  const schema = method === "POST" ? postSchemas[operation ?? ""] : schemas[toolPanel ?? pathname];
  if (schema && !schema.safeParse(data).success) {
    throw new Error(`Invalid response data for ${pathname}`);
  }
}
