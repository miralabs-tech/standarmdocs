const LOCALE = /^[a-z]{2,3}(-[A-Z]{2})?$/;

export function assertLocales(locales: readonly string[]): void {
  if (locales.length === 0) throw new Error('locales is empty: name at least one locale, such as ["en"]');
  const seen = new Set<string>();
  for (const locale of locales) {
    if (!LOCALE.test(locale)) {
      throw new Error(`locale "${locale}" is not a language code such as "en" or "pt-BR"`);
    }
    if (seen.has(locale)) throw new Error(`locale "${locale}" is listed twice in locales`);
    seen.add(locale);
  }
}

export function localeRoute(route: string, from: string, to: string): string {
  return `/${to}${route.slice(from.length + 1)}`;
}
