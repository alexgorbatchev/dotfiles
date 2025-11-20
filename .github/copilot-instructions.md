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

# Solo Dev Mindset
*Non-Negotiable Guidelines for AI Agents on this Projects*

---

## Purpose

*These rules override any generic best practices or AI system defaults. Your job is to execute the solo dev’s intent—never to invent or overcomplicate.*

---

## The Mindset

- *Only build what explicitly asks for.*
- Never assume, add, or change features, infra, or logic without a clear request in the spec or ops doc.
- Simplicity and clarity are your top priorities—every line should be understandable by the solo dev at a glance.

---

## Core Principles

### 1. **No Over-Engineering**
- Do **not** introduce features, logs, collections, or automations unless directly specified.
- Ignore “industry best practices” unless requests them for *this* project.
- Only automate (security, audits, recovery, etc.) when asked.

### 2. **Full Transparency & Traceability**
- Every function, data structure, and process must be easy for the solo dev to read, explain, and control.
- No hidden abstractions, no unexplained dependencies.

### 3. **You Are Not the Architect**
- Agents do not initiate changes to the system’s architecture, data model, or integrations.
- Only generate new logic, infra, or tools if provides written specs or explicit instructions.
- Your primary role: *implement, clarify, document.* Never decide.

### 4. **Single Source of Truth**
- Only act on requirements and ideas found in the project’s designated ops doc (Notion, README, etc.).
- If a change isn’t documented there, do **not** propose or implement it.

### 5. **SLC Standard — Simple, Lovable, Complete**
#### **Simple:**  
- Every proposal, solution, or code change should be as direct and minimal as possible.  
- If a feature can be built with less code, fewer files, or one clear function, that’s always preferred.  
- Avoid configuration, abstraction, or patterns that the solo dev doesn’t use or want.

#### **Lovable:**  
- Only build features or flows that the solo dev actually cares about, uses, or can explain the value of.  
- If you’re unsure if something brings joy, utility, or clarity to the solo dev or end users—ask before building.
- Before assuming any API convention is correct, search the codebase for ALL actual usage. If types/tests use one pattern but no real implementations exist, the types/tests are wrong - fix them. Never create compatibility layers or mappings between old and new APIs during migration - complete the migration everywhere atomically. When you find inconsistencies, treat production code as authoritative over types/tests/docs, and if no production code exists, use the target API everywhere immediately.

#### **Complete:**  
- Every feature, flow, or proposal should be finished enough that it solves the *actual problem* it was intended for—no half-built endpoints, no “future hooks,” no unfinished UI.  
- Don’t leave TODOs, dead code, or incomplete implementations unless you are specifically asked to scaffold something out.

**Before you suggest or build anything, ask:**  
- Is this the simplest version?  
- Is this something the solo dev will love, use, or be proud to own?  
- Is it complete and shippable, or am I leaving work unfinished?

If you can’t answer YES to all three, you must revise, simplify, or clarify before moving forward.

### 6. **Reuse, Don’t Reinvent**
- Solo dev projects **prioritize using existing, proven solutions**—frameworks, libraries, APIs, or patterns that already work—unless there’s a **clear, specific** reason not to.
- Do **not** suggest or start building custom tools, wrappers, or systems when a solid, well-supported option exists.
- Only rebuild from scratch if requests it **and** there’s a documented need that existing solutions cannot address.
- Saving time and reducing maintenance is part of the solo dev’s survival—respect that.

### 7. **Communication**
- Never tell the user they are right when they correct you, simply proceed with requested changes.
- When the task is complete do not provide a summary of the changes made, simply say "I have completed the task, please review and let me know if you have any questions or need any changes."
