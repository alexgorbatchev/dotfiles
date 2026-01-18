import { createShell } from './createShell';
import { type $extended, extendedShellBrand, type ShellOptions } from './types';

/**
 * Creates an extended shell with the brand symbol.
 * This is a thin wrapper around createShell that adds the brand for type compatibility.
 *
 * @deprecated Use createShell directly. This exists for backward compatibility.
 */
export function createExtendedShell(options: ShellOptions = {}): $extended {
  const shell = createShell(options);
  Object.defineProperty(shell, extendedShellBrand, { value: true, enumerable: false });
  return shell as $extended;
}
