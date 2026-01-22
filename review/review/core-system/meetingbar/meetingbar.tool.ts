import { defineTool, Platform } from '@gitea/dotfiles';

/**
 * MeetingBar - A macOS menu bar app that shows upcoming calendar meetings and lets you join with one click.
 *
 * Platforms: macOS (10.15+).
 *
 * https://github.com/leits/MeetingBar
 */
export default defineTool((install, _ctx) =>
  install().platform(Platform.MacOS, (installMac) =>
    installMac('brew', {
      formula: 'meetingbar',
      cask: true,
    }))
);
