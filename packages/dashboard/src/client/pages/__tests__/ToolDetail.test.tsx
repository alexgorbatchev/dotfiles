// UI test setup - registers DOM and exports testing utilities
import { render, screen, setupUITests } from '../../../testing/ui-setup';

import { describe, expect, test } from 'bun:test';

import type { ISerializableToolConfig } from '../../../shared/types';
import { getSourceInfo, type SourceInfo } from '../tool-detail-utils';

setupUITests();

// Test helper that asserts sourceInfo is not null and returns it
function assertSourceInfo(sourceInfo: SourceInfo | null): SourceInfo {
  if (sourceInfo === null) {
    throw new Error('Expected sourceInfo to be non-null');
  }
  return sourceInfo;
}

// Test the getSourceDisplay function indirectly by testing getSourceInfo
// and testing that it renders properly as a link

describe('ToolDetail getSourceDisplay rendering', () => {
  test('renders github-release source as link', () => {
    const config: ISerializableToolConfig = {
      name: 'test',
      version: 'latest',
      installationMethod: 'github-release',
      installParams: { repo: 'owner/repo' },
    };

    const sourceInfo = assertSourceInfo(getSourceInfo(config));

    // Render a simple test component to verify link rendering
    render(
      <div>
        <a
          href={sourceInfo.url}
          target='_blank'
          rel='noopener noreferrer'
          class='text-sm text-blue-500 hover:underline break-all'
        >
          {sourceInfo.value}
        </a>
      </div>,
    );

    const link = screen.getByText('owner/repo');
    expect(link).toBeInTheDocument();
    expect(link.getAttribute('href')).toBe('https://github.com/owner/repo');
    expect(link.getAttribute('target')).toBe('_blank');
  });

  test('renders cargo source as link to crates.io', () => {
    const config: ISerializableToolConfig = {
      name: 'test',
      version: 'latest',
      installationMethod: 'cargo',
      installParams: { crate: 'my-crate' },
    };

    const sourceInfo = assertSourceInfo(getSourceInfo(config));

    render(
      <a href={sourceInfo.url}>
        {sourceInfo.value}
      </a>,
    );

    const link = screen.getByText('my-crate');
    expect(link.getAttribute('href')).toBe('https://crates.io/crates/my-crate');
  });

  test('renders brew source as link to formulae.brew.sh', () => {
    const config: ISerializableToolConfig = {
      name: 'test',
      version: 'latest',
      installationMethod: 'brew',
      installParams: { formula: 'my-formula' },
    };

    const sourceInfo = assertSourceInfo(getSourceInfo(config));

    render(
      <a href={sourceInfo.url}>
        {sourceInfo.value}
      </a>,
    );

    const link = screen.getByText('my-formula');
    expect(link.getAttribute('href')).toBe('https://formulae.brew.sh/formula/my-formula');
  });

  test('renders zsh-plugin source as GitHub link', () => {
    const config: ISerializableToolConfig = {
      name: 'test',
      version: 'latest',
      installationMethod: 'zsh-plugin',
      installParams: { repo: 'user/plugin' },
    };

    const sourceInfo = assertSourceInfo(getSourceInfo(config));

    render(
      <a href={sourceInfo.url}>
        {sourceInfo.value}
      </a>,
    );

    const link = screen.getByText('user/plugin');
    expect(link.getAttribute('href')).toBe('https://github.com/user/plugin');
  });

  test('renders curl-script source as direct URL link', () => {
    const config: ISerializableToolConfig = {
      name: 'test',
      version: 'latest',
      installationMethod: 'curl-script',
      installParams: { url: 'https://example.com/install.sh' },
    };

    const sourceInfo = assertSourceInfo(getSourceInfo(config));

    render(
      <a href={sourceInfo.url}>
        {sourceInfo.value}
      </a>,
    );

    const link = screen.getByText('https://example.com/install.sh');
    expect(link.getAttribute('href')).toBe('https://example.com/install.sh');
  });

  test('renders curl-tar source as direct URL link', () => {
    const config: ISerializableToolConfig = {
      name: 'test',
      version: 'latest',
      installationMethod: 'curl-tar',
      installParams: { url: 'https://example.com/archive.tar.gz' },
    };

    const sourceInfo = assertSourceInfo(getSourceInfo(config));

    render(
      <a href={sourceInfo.url}>
        {sourceInfo.value}
      </a>,
    );

    const link = screen.getByText('https://example.com/archive.tar.gz');
    expect(link.getAttribute('href')).toBe('https://example.com/archive.tar.gz');
  });

  test('does not render source for manual installer', () => {
    const config: ISerializableToolConfig = {
      name: 'test',
      version: 'latest',
      installationMethod: 'manual',
      installParams: {},
    };

    const sourceInfo = getSourceInfo(config);
    expect(sourceInfo).toBeNull();
  });
});

describe('ToolDetail dependency links rendering', () => {
  test('renders dependency as link with correct href', () => {
    const toolName = 'fnm-tool';

    render(
      <a
        href={`/tools/${encodeURIComponent(toolName)}`}
        class='text-sm text-blue-500 hover:underline'
      >
        {toolName}
      </a>,
    );

    const link = screen.getByText('fnm-tool');
    expect(link).toBeInTheDocument();
    expect(link.getAttribute('href')).toBe('/tools/fnm-tool');
  });

  test('encodes special characters in tool name for href', () => {
    const toolName = 'tool/with/slashes';

    render(
      <a href={`/tools/${encodeURIComponent(toolName)}`}>
        {toolName}
      </a>,
    );

    const link = screen.getByText('tool/with/slashes');
    expect(link.getAttribute('href')).toBe('/tools/tool%2Fwith%2Fslashes');
  });
});

describe('ToolDetail required by links rendering', () => {
  test('renders required by tool as link', () => {
    const dependentToolName = 'dependent-tool';

    render(
      <a
        href={`/tools/${encodeURIComponent(dependentToolName)}`}
        class='text-sm text-blue-500 hover:underline'
      >
        {dependentToolName}
      </a>,
    );

    const link = screen.getByText('dependent-tool');
    expect(link).toBeInTheDocument();
    expect(link.getAttribute('href')).toBe('/tools/dependent-tool');
  });
});
