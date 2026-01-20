# 3. User Personas & Jobs

[← Back to Index](00-index.md) | [Previous: Project Context](02-project-context.md) | [Next: Objectives & Metrics →](04-objectives-metrics.md)

---

## 3.1 Primary: Power User Developer

**Profile:** Manages 20-50+ tools via dotfiles, uses multiple machines with shared configuration

**Jobs to be Done:**

- See environment health at a glance without reading logs
- Understand exactly what the system is doing during installations
- Troubleshoot installation failures independently
- Keep tools current with minimal friction
- Understand what changed on the system

**Pain Points:**

- Overwhelmed by CLI output during complex operations
- Hard to debug failures from log files alone
- Can't see dependency relationships clearly
- Unsure what files were created/changed

---

## 3.2 Secondary: New Adopter

**Profile:** Migrating from manual tool management, learning the system

**Jobs to be Done:**

- Build confidence through visual feedback
- Learn how the system works through exploration
- Understand what shims do and why they exist
- Verify installations succeeded

**Pain Points:**

- System behavior feels opaque
- Doesn't understand terminology (shims, hooks, registries)
- Can't tell if things are working correctly

---

## 3.3 Tertiary: Team Lead / Platform Engineer

**Profile:** Standardizes team development environments, validates configurations

**Jobs to be Done:**

- Validate configurations before deployment
- Monitor installation patterns across profiles
- Generate reports for audit/compliance
- Optimize installation order for faster builds

**Pain Points:**

- No centralized view of system state
- Can't export audit trails easily
- Limited visibility into file permissions

---

## 3.4 User Stories

### Daily User Stories

> "As a developer, I want to see a dashboard showing my environment health so I can quickly verify everything is working."

> "As a developer, I want to see real-time progress during long installations so I know the system isn't stuck."

> "As a developer, I want to understand why a tool installation failed so I can fix it without digging through logs."

### Power User Stories

> "As a power user, I want to see the dependency graph so I understand why tools install in a certain order."

> "As a power user, I want to preview what files will change before running `generate` so I can avoid surprises."

> "As a power user, I want to batch update multiple tools at once with changelog previews."

### Team Lead Stories

> "As a team lead, I want to export a health report so I can audit the development environment setup."

> "As a team lead, I want to see which tools have available updates across the team's configuration."

---

[← Back to Index](00-index.md) | [Previous: Project Context](02-project-context.md) | [Next: Objectives & Metrics →](04-objectives-metrics.md)
