# 11. UI Design System

[← Back to Index](00-index.md) | [Previous: System Enhancements](10-system-enhancements.md) | [Next: Implementation Phases →](12-implementation-phases.md)

---

## 11.1 Technology Stack

| Layer    | Technology            | Rationale                                |
| -------- | --------------------- | ---------------------------------------- |
| Runtime  | Bun                   | Native project runtime, fast HTTP server |
| Frontend | Preact                | Lightweight (3KB), React-compatible      |
| Routing  | preact-iso            | URL-driven state, SSR-ready, lightweight |
| Styling  | Tailwind CSS          | Utility-first, rapid development         |
| State    | Preact Signals        | Simple, reactive state management        |
| Graphs   | D3.js or Cytoscape.js | Flexible visualization                   |
| Icons    | Lucide                | Modern, consistent icons                 |
| Build    | Bun bundler           | Native, fast                             |

### Routing Requirements

- **Library:** `preact-iso` (required, no alternatives)
- **URL-Driven State:** All views, modals, dialogs, and panel states must have unique URLs
- **Browser Refresh:** User must land on exact same screen after refresh
- **Deep Linking:** All UI states must be shareable via URL
- **Back/Forward:** Full browser history navigation support

---

## 11.2 Color Palette

### Status Colors

| Purpose  | Light Mode            | Dark Mode             | Usage                      |
| -------- | --------------------- | --------------------- | -------------------------- |
| Success  | `#10b981` (green-500) | `#34d399` (green-400) | Installed, passed, healthy |
| Warning  | `#f59e0b` (amber-500) | `#fbbf24` (amber-400) | Updates, warnings, pending |
| Error    | `#ef4444` (red-500)   | `#f87171` (red-400)   | Failed, critical, broken   |
| Info     | `#3b82f6` (blue-500)  | `#60a5fa` (blue-400)  | Links, actions, highlights |
| Disabled | `#9ca3af` (gray-400)  | `#6b7280` (gray-500)  | Inactive, disabled         |

### Installation Method Colors

| Method         | Color       | Hex       |
| -------------- | ----------- | --------- |
| GitHub Release | Blue        | `#2563eb` |
| Homebrew       | Orange      | `#f97316` |
| Cargo          | Rust Orange | `#c2410c` |
| Curl           | Violet      | `#7c3aed` |
| Manual         | Slate       | `#64748b` |

### File Type Colors

| Type         | Color  | Hex       |
| ------------ | ------ | --------- |
| Binary       | Violet | `#8b5cf6` |
| Shim         | Cyan   | `#06b6d4` |
| Symlink      | Pink   | `#ec4899` |
| Completion   | Teal   | `#14b8a6` |
| Shell Script | Lime   | `#a3e635` |

---

## 11.3 Typography

**Primary Font (entire UI):**

```css
font-family: 'Maple Mono Normal NF', 'JetBrainsMono Nerd Font', 'Cascadia Code', 'Consolas', monospace;
```

The entire UI uses a monospace font for consistency and information density. This is a developer tool—monospace is appropriate throughout.

| Element        | Size    | Weight        |
| -------------- | ------- | ------------- |
| Headings       | 18-24px | Bold (700)    |
| Body           | 13-14px | Regular (400) |
| Labels         | 11-12px | Medium (500)  |
| Code/Data      | 12-13px | Regular (400) |
| Compact Tables | 11px    | Regular (400) |

---

## 11.4 Component Library

### Core Components

| Component    | Purpose            | Third-Party |
| ------------ | ------------------ | ----------- |
| Button       | Primary actions    | Custom      |
| Card         | Content containers | Custom      |
| Table        | Tabular data       | Custom      |
| Tree         | Hierarchical data  | Custom      |
| Tabs         | Section navigation | Custom      |
| Modal        | Overlays           | Custom      |
| Dropdown     | Select menus       | Custom      |
| Badge        | Status indicators  | Custom      |
| Tooltip      | Contextual help    | Custom      |
| Progress Bar | Loading states     | Custom      |
| Spinner      | Loading indicator  | Custom      |
| Alert        | Notifications      | Custom      |

### Specialized Components

| Component       | Purpose                  | Third-Party           |
| --------------- | ------------------------ | --------------------- |
| Code Block      | Syntax highlighting      | Shiki or Prism        |
| Chart           | Data visualization       | Recharts or Chart.js  |
| Graph           | Dependency visualization | Cytoscape.js or D3.js |
| Virtual List    | Large lists              | react-window          |
| Command Palette | Quick actions            | Custom                |
| File Tree       | File explorer            | Custom                |

---

## 11.5 Information Density Principles

**Core Philosophy:** Compact, information-dense UI. Show more data, less chrome. Avoid pagination wherever possible.

### Design Guidelines

| Principle               | Implementation                                                            |
| ----------------------- | ------------------------------------------------------------------------- |
| **No Pagination**       | Use virtual scrolling for large lists instead of page controls            |
| **Dense Tables**        | Compact row height (28-32px), smaller fonts (11-12px)                     |
| **Minimal Whitespace**  | Tight padding (4-8px), reduced margins                                    |
| **All Details Visible** | Expand sections by default, collapse is opt-in                            |
| **Data Over Chrome**    | Minimize decorative elements, maximize data display                       |
| **Single-Screen Views** | Design each view to show complete context without scrolling when possible |

### Layout Density

| Element           | Compact Value                |
| ----------------- | ---------------------------- |
| Card padding      | 8-12px                       |
| Table row height  | 28-32px                      |
| List item height  | 24-28px                      |
| Section gap       | 12-16px                      |
| Form field height | 28px                         |
| Button height     | 28px (small), 32px (default) |

### Virtual Scrolling

For lists exceeding 50 items, use virtual scrolling (react-window or similar) instead of pagination:

- Tool catalog: Virtual grid/list
- File explorer: Virtual tree
- Operation history: Virtual timeline
- Log viewer: Virtual log lines

## 11.6 Responsive Breakpoints

| Breakpoint | Width  | Layout Changes                    |
| ---------- | ------ | --------------------------------- |
| `sm`       | 640px  | Single column, collapsed sidebar  |
| `md`       | 768px  | 2-column grid, sidebar toggle     |
| `lg`       | 1024px | 3-column grid, persistent sidebar |
| `xl`       | 1280px | 4-column grid, expanded details   |

---

## 11.7 Component Patterns

### Cards

```
┌────────────────────────────────────┐
│  TITLE                    [Action] │
│  ──────────────────────────────── │
│  Content area with data            │
│                                    │
│  Footer with metadata              │
└────────────────────────────────────┘
```

### Status Badges

| State   | Visual               |
| ------- | -------------------- |
| Success | `✓` Green background |
| Warning | `⚠` Amber background |
| Error   | `✗` Red background   |
| Info    | `ℹ` Blue background  |
| Pending | `○` Gray background  |
| Running | `●` Blue with pulse  |

### Tool Cards

```
┌───────────────────┐
│      🔍 fzf       │  ← Icon + Name
│   ────────────    │
│   v0.55.0    ✓    │  ← Version + Status
│   github-release  │  ← Method badge
│                   │
│ [Details] [···]   │  ← Actions
└───────────────────┘
```

---

## 11.8 Motion & Animation

| Animation       | Duration   | Easing      | Usage                 |
| --------------- | ---------- | ----------- | --------------------- |
| Hover           | 150ms      | ease-out    | Buttons, cards        |
| Expand/Collapse | 200ms      | ease-in-out | Panels, accordions    |
| Modal           | 200ms      | ease-out    | Opening overlays      |
| Progress        | Continuous | linear      | Progress bars         |
| Pulse           | 2s         | ease-in-out | Active/running states |

---

## 11.9 Dark Mode

- Full dark theme support
- System preference detection (`prefers-color-scheme`)
- Manual toggle available
- All charts/graphs themed appropriately
- Proper contrast ratios maintained

### Color Mapping

| Element        | Light      | Dark       |
| -------------- | ---------- | ---------- |
| Background     | `gray-50`  | `gray-900` |
| Card           | `white`    | `gray-800` |
| Text Primary   | `gray-900` | `gray-100` |
| Text Secondary | `gray-600` | `gray-400` |
| Border         | `gray-200` | `gray-700` |

---

## 11.10 Accessibility

- WCAG 2.1 AA compliance
- Keyboard navigation throughout
- Focus indicators on all interactive elements
- Screen reader compatible
- Proper heading hierarchy
- ARIA labels on icons/buttons
- High contrast mode support
- Reduced motion option

---

[← Back to Index](00-index.md) | [Previous: System Enhancements](10-system-enhancements.md) | [Next: Implementation Phases →](12-implementation-phases.md)
