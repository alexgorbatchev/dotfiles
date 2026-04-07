import fs from 'node:fs';
import path from 'node:path';

import type { IBuildContext } from '../types';

const PUBLIC_ASSET_FILE_NAMES: string[] = ['README.md', 'LICENSE'];

export async function copyPublicPackageAssets(context: IBuildContext): Promise<void> {
  for (const fileName of PUBLIC_ASSET_FILE_NAMES) {
    const sourcePath: string = path.join(context.paths.rootDir, fileName);
    const destinationPath: string = path.join(context.paths.outputDir, fileName);

    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Required public package asset is missing: ${sourcePath}`);
    }

    fs.copyFileSync(sourcePath, destinationPath);
  }
}
