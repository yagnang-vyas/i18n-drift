// A thin wrapper around the translations Laravel shares with Inertia.
export function t(key: string, replacements: Record<string, string | number> = {}): string {
  let text = (window as unknown as { translations: Record<string, string> }).translations[key] ?? key;
  for (const [name, value] of Object.entries(replacements)) {
    text = text.replace(`:${name}`, String(value));
  }
  return text;
}
