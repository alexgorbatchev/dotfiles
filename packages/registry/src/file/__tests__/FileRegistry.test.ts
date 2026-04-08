import { TestLogger } from "@dotfiles/logger";
import { RegistryDatabase } from "@dotfiles/registry-database";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { FileRegistry } from "../FileRegistry";

describe("SqliteFileRegistry", () => {
  let logger: TestLogger;
  let registry: FileRegistry;
  let registryDatabase: RegistryDatabase;
  let dbPath: string;

  beforeEach(async () => {
    logger = new TestLogger();
    dbPath = path.join("/tmp", `test-registry-${randomUUID()}.db`);
    registryDatabase = new RegistryDatabase(logger, dbPath);
    registry = new FileRegistry(logger, registryDatabase.getConnection());
  });

  afterEach(async () => {
    await registry.close();
    registryDatabase.close();
    try {
      await unlink(dbPath);
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("recordOperation", () => {
    it("should record a file operation", async () => {
      const operation = {
        toolName: "nodejs",
        operationType: "writeFile" as const,
        filePath: "/usr/local/bin/node",
        fileType: "shim" as const,
        operationId: randomUUID(),
        sizeBytes: 1024,
      };

      await registry.recordOperation(operation);

      const operations = await registry.getOperations({ toolName: "nodejs" });
      expect(operations).toHaveLength(1);
      expect(operations[0]).toMatchObject({
        toolName: "nodejs",
        operationType: "writeFile",
        filePath: "/usr/local/bin/node",
        fileType: "shim",
        sizeBytes: 1024,
      });
    });

    it("should record symlink operation with target path", async () => {
      const operation = {
        toolName: "nodejs",
        operationType: "symlink" as const,
        filePath: "/usr/local/bin/node",
        targetPath: "/home/user/.generated/bin/node",
        fileType: "symlink" as const,
        operationId: randomUUID(),
      };

      await registry.recordOperation(operation);

      const operations = await registry.getOperations();
      expect(operations[0]).toMatchObject({
        targetPath: "/home/user/.generated/bin/node",
      });
    });

    it("should record operation with metadata", async () => {
      const metadata = { version: "18.0.0", source: "github" };
      const operation = {
        toolName: "nodejs",
        operationType: "writeFile" as const,
        filePath: "/usr/local/bin/node",
        fileType: "binary" as const,
        operationId: randomUUID(),
        metadata,
      };

      await registry.recordOperation(operation);

      const operations = await registry.getOperations();
      expect(operations[0]?.metadata).toEqual(metadata);
    });
  });

  describe("getOperations", () => {
    beforeEach(async () => {
      const opId1 = randomUUID();
      const opId2 = randomUUID();

      await registry.recordOperation({
        toolName: "nodejs",
        operationType: "writeFile",
        filePath: "/usr/local/bin/node",
        fileType: "shim",
        operationId: opId1,
      });

      await registry.recordOperation({
        toolName: "python",
        operationType: "writeFile",
        filePath: "/usr/local/bin/python",
        fileType: "binary",
        operationId: opId2,
      });

      await registry.recordOperation({
        toolName: "nodejs",
        operationType: "writeFile",
        filePath: "/usr/local/bin/node",
        fileType: "shim",
        operationId: opId1,
      });
    });

    it("should get all operations", async () => {
      const operations = await registry.getOperations();
      expect(operations).toHaveLength(3);
    });

    it("should filter by tool name", async () => {
      const operations = await registry.getOperations({ toolName: "nodejs" });
      expect(operations).toHaveLength(2);
      expect(operations.every((op) => op.toolName === "nodejs")).toBe(true);
    });

    it("should filter by operation type", async () => {
      const operations = await registry.getOperations({ operationType: "writeFile" });
      expect(operations).toHaveLength(3);
      expect(operations.every((op) => op.operationType === "writeFile")).toBe(true);
    });

    it("should filter by file type", async () => {
      const operations = await registry.getOperations({ fileType: "shim" });
      expect(operations).toHaveLength(2);
      expect(operations.every((op) => op.fileType === "shim")).toBe(true);
    });

    it("should filter by file path", async () => {
      const operations = await registry.getOperations({ filePath: "/usr/local/bin/node" });
      expect(operations).toHaveLength(2);
      expect(operations.every((op) => op.filePath === "/usr/local/bin/node")).toBe(true);
    });

    it("should return operations in reverse chronological order", async () => {
      const operations = await registry.getOperations({ toolName: "nodejs" });
      expect(operations[0]?.operationType).toBe("writeFile"); // Most recent first
      expect(operations[1]?.operationType).toBe("writeFile");
    });
  });

  describe("getFileStatesForTool", () => {
    it("should compute current file states for a tool", async () => {
      const opId = randomUUID();

      // Create file
      await registry.recordOperation({
        toolName: "nodejs",
        operationType: "writeFile",
        filePath: "/usr/local/bin/node",
        fileType: "shim",
        operationId: opId,
        sizeBytes: 1024,
      });

      // Update file
      await registry.recordOperation({
        toolName: "nodejs",
        operationType: "writeFile",
        filePath: "/usr/local/bin/node",
        fileType: "shim",
        operationId: opId,
        sizeBytes: 2048,
      });

      const states = await registry.getFileStatesForTool("nodejs");
      expect(states).toHaveLength(1);
      expect(states[0]).toMatchObject({
        filePath: "/usr/local/bin/node",
        toolName: "nodejs",
        fileType: "shim",
        lastOperation: "writeFile",
        sizeBytes: 2048,
      });
    });

    it("should exclude deleted files from current state", async () => {
      const opId = randomUUID();

      // Create and then delete file
      await registry.recordOperation({
        toolName: "nodejs",
        operationType: "writeFile",
        filePath: "/usr/local/bin/node",
        fileType: "shim",
        operationId: opId,
      });

      await registry.recordOperation({
        toolName: "nodejs",
        operationType: "rm",
        filePath: "/usr/local/bin/node",
        fileType: "shim",
        operationId: opId,
      });

      const states = await registry.getFileStatesForTool("nodejs");
      expect(states).toHaveLength(0);
    });
  });

  describe("getFileState", () => {
    it("should return current state of a specific file", async () => {
      const opId = randomUUID();
      const filePath = "/usr/local/bin/node";

      await registry.recordOperation({
        toolName: "nodejs",
        operationType: "writeFile",
        filePath,
        fileType: "shim",
        operationId: opId,
        sizeBytes: 1024,
      });

      const state = await registry.getFileState(filePath);
      expect(state).toMatchObject({
        filePath,
        toolName: "nodejs",
        fileType: "shim",
        lastOperation: "writeFile",
        sizeBytes: 1024,
      });
    });

    it("should return null for deleted files", async () => {
      const opId = randomUUID();
      const filePath = "/usr/local/bin/node";

      await registry.recordOperation({
        toolName: "nodejs",
        operationType: "writeFile",
        filePath,
        fileType: "shim",
        operationId: opId,
      });

      await registry.recordOperation({
        toolName: "nodejs",
        operationType: "rm",
        filePath,
        fileType: "shim",
        operationId: opId,
      });

      const state = await registry.getFileState(filePath);
      expect(state).toBeNull();
    });

    it("should return null for non-existent files", async () => {
      const state = await registry.getFileState("/non/existent/file");
      expect(state).toBeNull();
    });
  });

  describe("getRegisteredTools", () => {
    it("should return list of registered tools", async () => {
      await registry.recordOperation({
        toolName: "nodejs",
        operationType: "writeFile",
        filePath: "/usr/local/bin/node",
        fileType: "shim",
        operationId: randomUUID(),
      });

      await registry.recordOperation({
        toolName: "python",
        operationType: "writeFile",
        filePath: "/usr/local/bin/python",
        fileType: "binary",
        operationId: randomUUID(),
      });

      const tools = await registry.getRegisteredTools();
      expect(tools).toEqual(["nodejs", "python"]);
    });

    it("should exclude tools whose tracked files were removed", async () => {
      const removedToolOperationId = randomUUID();

      await registry.recordOperation({
        toolName: "nodejs",
        operationType: "writeFile",
        filePath: "/usr/local/bin/node",
        fileType: "shim",
        operationId: removedToolOperationId,
      });

      await registry.recordOperation({
        toolName: "nodejs",
        operationType: "rm",
        filePath: "/usr/local/bin/node",
        fileType: "shim",
        operationId: removedToolOperationId,
      });

      await registry.recordOperation({
        toolName: "python",
        operationType: "writeFile",
        filePath: "/usr/local/bin/python",
        fileType: "binary",
        operationId: randomUUID(),
      });

      const tools = await registry.getRegisteredTools();
      expect(tools).toEqual(["python"]);
    });
  });

  describe("removeToolOperations", () => {
    it("should remove all operations for a specific tool", async () => {
      const opId1 = randomUUID();
      const opId2 = randomUUID();

      await registry.recordOperation({
        toolName: "nodejs",
        operationType: "writeFile",
        filePath: "/usr/local/bin/node",
        fileType: "shim",
        operationId: opId1,
      });

      await registry.recordOperation({
        toolName: "python",
        operationType: "writeFile",
        filePath: "/usr/local/bin/python",
        fileType: "binary",
        operationId: opId2,
      });

      await registry.removeToolOperations("nodejs");

      const allOps = await registry.getOperations();
      expect(allOps).toHaveLength(1);
      expect(allOps[0]?.toolName).toBe("python");
    });
  });

  describe("getStats", () => {
    it("should return registry statistics", async () => {
      await registry.recordOperation({
        toolName: "nodejs",
        operationType: "writeFile",
        filePath: "/usr/local/bin/node",
        fileType: "shim",
        operationId: randomUUID(),
      });

      await registry.recordOperation({
        toolName: "python",
        operationType: "writeFile",
        filePath: "/usr/local/bin/python",
        fileType: "binary",
        operationId: randomUUID(),
      });

      const stats = await registry.getStats();
      expect(stats.totalOperations).toBe(2);
      expect(stats.totalFiles).toBe(2);
      expect(stats.totalTools).toBe(2);
      expect(stats.oldestOperation).toBeGreaterThan(0);
      expect(stats.newestOperation).toBeGreaterThan(0);
    });

    it("should return zero stats for empty registry", async () => {
      const stats = await registry.getStats();
      expect(stats.totalOperations).toBe(0);
      expect(stats.totalFiles).toBe(0);
      expect(stats.totalTools).toBe(0);
      expect(stats.oldestOperation).toBe(0);
      expect(stats.newestOperation).toBe(0);
    });
  });

  describe("validate", () => {
    it("should validate registry integrity", async () => {
      await registry.recordOperation({
        toolName: "nodejs",
        operationType: "writeFile",
        filePath: "/usr/local/bin/node",
        fileType: "shim",
        operationId: randomUUID(),
      });

      const result = await registry.validate();
      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
      expect(result.repaired).toHaveLength(0);
    });
  });
});
