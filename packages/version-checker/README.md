# @dotfiles/version-checker

Version checking utilities using semver for comparing and validating semantic versions.

## Features

- Version comparison (newer available, up-to-date, ahead of latest)
- Semantic version validation
- Support for version prefixes (e.g., 'v1.2.3')

## Usage

```typescript
import { VersionChecker, VersionComparisonStatus } from "@dotfiles/version-checker";

const checker = new VersionChecker(logger, githubClient);

// Check version status
const status = await checker.checkVersionStatus("1.0.0", "1.1.0");
// Returns: VersionComparisonStatus.NEWER_AVAILABLE

// Get latest version from GitHub
const latestVersion = await checker.getLatestToolVersion("owner", "repo");
```
