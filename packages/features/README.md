# Features Package

Feature services for the dotfiles tool installer.

## Readme Service

Service for fetching, caching, and generating tool README files from GitHub repositories.

### Features

- Fetches README.md files from GitHub using raw URLs
- Version-specific README caching per tool
- Combined README generation from installed tools
- No GitHub API rate limits (uses raw.githubusercontent.com)

### Usage

```typescript
import { ReadmeService } from '@dotfiles/features';

const readmeService = new ReadmeService(logger, downloader, registry);

// Fetch README for specific version
const readme = await readmeService.fetchReadmeForVersion('owner', 'repo', 'v1.2.3');

// Generate combined README
const combinedReadme = await readmeService.generateCombinedReadme();
```