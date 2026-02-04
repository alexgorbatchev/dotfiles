// UI test setup - registers DOM and exports testing utilities
import { fireEvent, render, screen, setupUITests } from '../../../testing/ui-setup';

import { describe, expect, test } from 'bun:test';

setupUITests();

import type { IToolDetail } from '../../../shared/types';
import { ToolsTreeView } from '../ToolsTreeView';

function createTool(
  name: string,
  configFilePath: string,
  status: 'installed' | 'not-installed' | 'error' = 'installed',
): IToolDetail {
  return {
    config: {
      name,
      version: '1.0.0',
      installationMethod: 'github-release',
      installParams: {},
      configFilePath,
    },
    runtime: {
      status,
      installedVersion: status === 'installed' ? '1.0.0' : null,
      installedAt: status === 'installed' ? '2024-01-01' : null,
      installPath: status === 'installed' ? '/path/to/tool' : null,
      binaryPaths: [],
      hasUpdate: false,
    },
    files: [],
  };
}

describe('ToolsTreeView', () => {
  test('renders empty state when no tools', () => {
    render(<ToolsTreeView tools={[]} />);

    expect(screen.getByText('No tool files found')).toBeInTheDocument();
  });

  test('renders card with title', () => {
    const tools = [createTool('fzf', '/home/user/tools/fzf.tool.ts')];
    render(<ToolsTreeView tools={tools} />);

    expect(screen.getByText('Tool Files')).toBeInTheDocument();
  });

  test('renders tool file in tree', () => {
    const tools = [createTool('fzf', '/home/user/tools/fzf.tool.ts')];
    render(<ToolsTreeView tools={tools} />);

    expect(screen.getByText('fzf.tool.ts')).toBeInTheDocument();
  });

  test('renders nested folder structure', () => {
    const tools = [
      createTool('fzf', '/home/user/tools/dev/fzf.tool.ts'),
      createTool('bat', '/home/user/tools/dev/bat.tool.ts'),
    ];
    render(<ToolsTreeView tools={tools} />);

    expect(screen.getByText('dev')).toBeInTheDocument();
    expect(screen.getByText('fzf.tool.ts')).toBeInTheDocument();
    expect(screen.getByText('bat.tool.ts')).toBeInTheDocument();
  });

  test('renders multiple folders', () => {
    const tools = [
      createTool('fzf', '/home/user/tools/dev/fzf.tool.ts'),
      createTool('docker', '/home/user/tools/infra/docker.tool.ts'),
    ];
    render(<ToolsTreeView tools={tools} />);

    expect(screen.getByText('dev')).toBeInTheDocument();
    expect(screen.getByText('infra')).toBeInTheDocument();
    expect(screen.getByText('fzf.tool.ts')).toBeInTheDocument();
    expect(screen.getByText('docker.tool.ts')).toBeInTheDocument();
  });

  test('renders deeply nested structure', () => {
    const tools = [
      createTool('neovim', '/home/user/tools/editors/terminal/neovim.tool.ts'),
    ];
    render(<ToolsTreeView tools={tools} />);

    expect(screen.getByText('editors')).toBeInTheDocument();
    expect(screen.getByText('terminal')).toBeInTheDocument();
    expect(screen.getByText('neovim.tool.ts')).toBeInTheDocument();
  });

  test('skips tools without configFilePath', () => {
    const tools = [
      createTool('fzf', '/home/user/tools/fzf.tool.ts'),
      { ...createTool('bat', ''), config: { ...createTool('bat', '').config, configFilePath: undefined } },
    ];
    render(<ToolsTreeView tools={tools} />);

    expect(screen.getByText('fzf.tool.ts')).toBeInTheDocument();
    expect(screen.queryByText('bat.tool.ts')).not.toBeInTheDocument();
  });

  test('navigates to tool detail on file click', () => {
    const originalLocation = window.location.href;
    const tools = [createTool('fzf', '/home/user/tools/fzf.tool.ts')];
    render(<ToolsTreeView tools={tools} />);

    // Mock window.location
    Object.defineProperty(window, 'location', {
      value: { href: '' },
      writable: true,
    });

    fireEvent.click(screen.getByText('fzf.tool.ts'));

    expect(window.location.href).toBe('/tools/fzf');

    // Restore
    Object.defineProperty(window, 'location', {
      value: { href: originalLocation },
      writable: true,
    });
  });

  test('sorts folders before files', () => {
    const tools = [
      createTool('zzz-file', '/home/user/tools/zzz-file.tool.ts'),
      createTool('aaa-nested', '/home/user/tools/aaa-folder/nested.tool.ts'),
    ];
    const { container } = render(<ToolsTreeView tools={tools} />);

    const items = container.querySelectorAll('[class*="flex items-center py-1"]');
    const texts = [...items].map((item) => item.textContent?.trim());

    // Folder should come before file
    const folderIndex = texts.findIndex((t) => t?.includes('aaa-folder'));
    const fileIndex = texts.findIndex((t) => t?.includes('zzz-file'));
    expect(folderIndex).toBeLessThan(fileIndex);
  });
});
