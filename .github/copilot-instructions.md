Please also reference the following documents as needed. In this case, `@` stands for the project root directory.

<Documents>
  <Document>
    <Path>@.github/instructions/general--code-quality.instructions.md</Path>
    <Description>Universal code quality standards for LLM assistance.</Description>
  </Document>
  <Document>
    <Path>@.github/instructions/general--rules.instructions.md</Path>
    <Description>Universal development rules for LLM assistance</Description>
  </Document>
  <Document>
    <Path>@.github/instructions/general--tooling.instructions.md</Path>
    <Description>Tool-agnostic development practices for LLM assistance.</Description>
  </Document>
  <Document>
    <Path>@.github/instructions/project--file-structure.instructions.md</Path>
    <Description>file-structure</Description>
  </Document>
  <Document>
    <Path>@.github/instructions/project--logging.instructions.md</Path>
    <Description>Project logging requirements.</Description>
  </Document>
  <Document>
    <Path>@.github/instructions/project--testing.instructions.md</Path>
    <Description>Project testing requirements.</Description>
  </Document>
  <Document>
    <Path>@.github/instructions/project--tooling.instructions.md</Path>
    <Description>Project tooling requirements.</Description>
  </Document>
  <Document>
    <Path>@.github/instructions/project--workflow.instructions.md</Path>
    <Description>Project development workflow requirements.</Description>
  </Document>
  <Document>
    <Path>@.github/instructions/typescript--code-quality.instructions.md</Path>
    <Description>TypeScript specific code quality requirements.</Description>
  </Document>
  <Document>
    <Path>@.github/instructions/typescript--testing.instructions.md</Path>
    <Description>TypeScript specific testing rules.</Description>
  </Document>
</Documents>

# Additional Conventions Beyond the Built-in Functions

As this project's AI coding tool, you must follow the additional conventions below, in addition to the built-in functions.

# Dotfiles Generator Project

## Overview

This project is a dotfiles management system that replaces traditional shell-based approaches with a programmatic solution. It automates the installation of CLI tools, generates executable shims for system-wide tool availability, and manages shell configurations and symbolic links for dotfiles.

## Purpose

The project solves key problems developers face with dotfiles management:

- **Inconsistent Environments**: Provides a single source of truth for tool installations and configurations, ensuring consistency across machines
- **Tedious Setup**: Automates the entire setup process with a single command
- **Tool Accessibility Issues**: Makes user-installed CLI tools available to all applications, not just the shell
- **Complex Shell Initialization**: Replaces scattered configuration files with a consolidated approach
- **Manual Maintenance**: Automates tool updates and version tracking

## Core Capabilities

### Tool Management

- Install tools from multiple sources (GitHub releases, package managers, scripts)
- Automatically select appropriate binaries for the current platform
- Track installed versions and check for updates
- Cache downloads to avoid repeated fetches

### System Integration

- Generate executable shims that make tools globally accessible
- Create consolidated shell initialization files
- Manage symbolic links for configuration files
- Handle shell completion files

### Configuration

- Define tool configurations in structured, version-controlled files
- Support platform-specific overrides
- Provide environment-based customization

## Goals

1. **Consistency**: Identical development environments across different machines
2. **Automation**: Single command setup and maintenance of entire dotfiles system
3. **Performance**: Fast tool access without slowing shell startup
4. **Maintainability**: Clear, structured approach to configuration management
5. **Reliability**: Robust error handling and comprehensive testing

## Success Criteria

- New systems can be fully configured with a single command
- Tools are accessible to all applications, not just the shell
- Shell performance is maintained or improved
- All configuration changes are version controlled and trackable
- The system handles edge cases and errors gracefully