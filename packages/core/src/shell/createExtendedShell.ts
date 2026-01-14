import type { $ } from 'dax-sh';
import { type $extended, extendedShellBrand } from './extendedShell.types';

/**
 * Creates an extended shell from a plain dax shell by adding the brand symbol.
 * This is a minimal wrapper that doesn't add logging - use createLoggingShell for that.
 * Used when you need an $extended shell but don't want logging at this layer.
 */
export function createExtendedShell($shell: typeof $): $extended {
  const extended = Object.assign(
    (first: TemplateStringsArray | string, ...expressions: unknown[]) => {
      if (typeof first === 'string') {
        return ($shell as $extended)(first);
      }
      // @ts-expect-error: dax-sh typing for template expressions
      return $shell(first, ...expressions);
    },
    $shell,
  );
  Object.defineProperty(extended, extendedShellBrand, { value: true, enumerable: false });
  return extended as unknown as $extended;
}
