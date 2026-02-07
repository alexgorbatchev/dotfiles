---
targets:
  - '*'
root: false
---

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
