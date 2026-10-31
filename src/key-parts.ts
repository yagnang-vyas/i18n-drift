/** A piece of a translation key expression: known text, or a part only known at runtime. */
export type KeyPart = { literal: string } | { dynamic: true };

export const DYNAMIC_PART: KeyPart = { dynamic: true };

export type ResolvedKey = { dynamic: false; key: string } | { dynamic: true; pattern?: string };

/**
 * Collapses key parts into either one static key or a dynamic key with a `*` wildcard pattern.
 * A pattern is only reported when at least some static text surrounds the wildcard.
 */
export function resolveParts(parts: readonly KeyPart[]): ResolvedKey {
  if (parts.every((part) => 'literal' in part)) {
    return {
      dynamic: false,
      key: parts.map((part) => ('literal' in part ? part.literal : '')).join(''),
    };
  }
  let pattern = '';
  for (const part of parts) {
    if ('literal' in part) {
      pattern += part.literal;
    } else if (!pattern.endsWith('*')) {
      pattern += '*';
    }
  }
  const hasStaticText = pattern.replace(/\*/g, '') !== '';
  return hasStaticText ? { dynamic: true, pattern } : { dynamic: true };
}

/** Appends `suffix` parts onto `parts`, merging adjacent dynamic parts. */
export function concatParts(left: readonly KeyPart[], right: readonly KeyPart[]): KeyPart[] {
  return [...left, ...right];
}
