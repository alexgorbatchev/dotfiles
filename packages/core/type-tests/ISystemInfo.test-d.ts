import type { ISystemInfo } from '@gitea/dotfiles';
import { expectType } from 'tsd';

// This test verifies that ISystemInfo uses proper NodeJS types for platform and arch

// Valid: Using proper NodeJS.Platform values
const darwinSystem: ISystemInfo = {
  platform: 'darwin',
  arch: 'arm64',
  homeDir: '/Users/test',
};

const _linuxSystem: ISystemInfo = {
  platform: 'linux',
  arch: 'x64',
  homeDir: '/home/test',
};

const _win32System: ISystemInfo = {
  platform: 'win32',
  arch: 'x64',
  homeDir: 'C:\\Users\\test',
};

// Verify the types are correct
expectType<NodeJS.Platform>(darwinSystem.platform);
expectType<NodeJS.Architecture>(darwinSystem.arch);
