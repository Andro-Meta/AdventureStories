// Strip ?cb=NNN from import specifiers via a Node ESM resolve hook.
import { resolve as nodeResolve } from 'node:path';

export function resolve(specifier, context, defaultResolve) {
  if (typeof specifier === 'string') {
    const cleaned = specifier.replace(/\?cb=\d+/g, '');
    if (cleaned !== specifier) {
      return defaultResolve(cleaned, context);
    }
  }
  return defaultResolve(specifier, context);
}
