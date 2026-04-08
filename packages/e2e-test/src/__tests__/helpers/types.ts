import type { Architecture, Platform } from "@dotfiles/core";

export interface ITestTarget {
  platform: Platform;
  architecture: Architecture;
  name: string;
}
