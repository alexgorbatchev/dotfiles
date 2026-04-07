import { Architecture, Platform, type z_internal_ISystemInfo } from '@alexgorbatchev/dotfiles';
import { expectType } from 'tsd';

type ISystemInfo = z_internal_ISystemInfo;

// This test verifies that ISystemInfo uses Platform and Architecture enum types

// Valid: Using Platform and Architecture enum values
const macosSystem: ISystemInfo = {
  platform: Platform.MacOS,
  arch: Architecture.Arm64,
  homeDir: '/Users/test',
  hostname: 'test-host',
};

const _linuxSystem: ISystemInfo = {
  platform: Platform.Linux,
  arch: Architecture.X86_64,
  homeDir: '/home/test',
  hostname: 'test-host',
};

const _windowsSystem: ISystemInfo = {
  platform: Platform.Windows,
  arch: Architecture.X86_64,
  homeDir: 'C:\\Users\\test',
  hostname: 'test-host',
};

// Verify the types are correct
expectType<Platform>(macosSystem.platform);
expectType<Architecture>(macosSystem.arch);
