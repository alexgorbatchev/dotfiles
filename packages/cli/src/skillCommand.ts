import { NodeFileSystem } from "@dotfiles/file-system";
import type { TsLogger } from "@dotfiles/logger";
import { exitCli, ExitCode, getCliBinPath } from "@dotfiles/utils";
import { cp } from "node:fs/promises";
import path from "node:path";
import { messages } from "./log-messages";
import type { ICommandCompletionMeta, IGlobalProgram, IGlobalProgramOptions, ServicesFactory } from "./types";

export const SKILL_COMMAND_COMPLETION: ICommandCompletionMeta = {
  name: "skill",
  description: "Copy the dotfiles skill folder to the target directory",
  hasPositionalArg: true,
  positionalArgDescription: "target directory for skill folder",
};

type SkillCommandOptions = { targetPath: string } & IGlobalProgramOptions;

function getSkillPath(): string {
  const cliBinPath = getCliBinPath();
  const scriptPath = cliBinPath.split(" ").pop() ?? cliBinPath;
  const scriptDir = path.dirname(scriptPath);
  return path.join(scriptDir, "skill");
}

async function copySkill(parentLogger: TsLogger, targetPath: string, dryRun: boolean): Promise<ExitCode> {
  const logger = parentLogger.getSubLogger({ name: "copySkill" });

  const nodeFs = new NodeFileSystem();

  const skillSourcePath = getSkillPath();
  const destinationPath = path.join(targetPath, "dotfiles");

  const skillExists = await nodeFs.exists(skillSourcePath);
  if (!skillExists) {
    logger.error(messages.fsItemNotFound("Skill directory", skillSourcePath));
    return ExitCode.ERROR;
  }

  const targetExists = await nodeFs.exists(targetPath);
  if (!targetExists) {
    logger.error(messages.fsItemNotFound("Target directory", targetPath));
    return ExitCode.ERROR;
  }

  const destinationExists = await nodeFs.exists(destinationPath);
  if (destinationExists) {
    logger.info(messages.skillAlreadyExists(destinationPath));
    await nodeFs.rmdir(destinationPath, { recursive: true });
  }

  if (dryRun) {
    logger.info(messages.skillDryRun(destinationPath, skillSourcePath));
    return ExitCode.SUCCESS;
  }

  try {
    await cp(skillSourcePath, destinationPath, { recursive: true });
    logger.info(messages.skillCopied(destinationPath, skillSourcePath));
    return ExitCode.SUCCESS;
  } catch (error) {
    logger.error(messages.skillCopyFailed(destinationPath), error);
    return ExitCode.ERROR;
  }
}

async function skillActionLogic(parentLogger: TsLogger, options: SkillCommandOptions): Promise<void> {
  const logger = parentLogger.getSubLogger({ name: "skillActionLogic" });
  const { targetPath, dryRun } = options;

  logger.debug(messages.commandActionStarted("skill"));

  const exitCode = await copySkill(logger, targetPath, dryRun);
  exitCli(exitCode);
}

export function registerSkillCommand(
  parentLogger: TsLogger,
  program: IGlobalProgram,
  _servicesFactory: ServicesFactory,
): void {
  const logger = parentLogger.getSubLogger({ name: "registerSkillCommand" });

  program
    .command("skill <path>")
    .description("Copy the dotfiles skill folder to the target directory")
    .action(async (targetPath: string) => {
      const combinedOptions: SkillCommandOptions = {
        targetPath: path.resolve(targetPath),
        ...program.opts(),
      };
      await skillActionLogic(logger, combinedOptions);
    });
}
