export interface Labels {
  readonly documentation: string;
  readonly theme: string;
  readonly density: string;
  readonly auto: string;
  readonly light: string;
  readonly dark: string;
  readonly desktop: string;
  readonly touch: string;
  readonly onThisPage: string;
  readonly seeAlso: string;
  readonly showCode: string;
  readonly hideCode: string;
  readonly prop: string;
  readonly type: string;
  readonly notes: string;
  readonly answered: string;
  readonly pending: string;
  readonly language: string;
  readonly localeName: string;
  readonly redirect: string;
  readonly propsName: string;
  readonly staticChrome: string;
}

export const LABELS: Readonly<Record<"en" | "fr", Labels>> = {
  en: {
    documentation: "Documentation",
    theme: "Theme",
    density: "Density",
    auto: "Auto",
    light: "Light",
    dark: "Dark",
    desktop: "Desktop",
    touch: "Touch",
    onThisPage: "On this page",
    seeAlso: "See also",
    showCode: "Show code",
    hideCode: "Hide code",
    prop: "Prop",
    type: "Type",
    notes: "Notes",
    answered: "Answered",
    pending: "Pending",
    language: "Language",
    localeName: "English",
    redirect: "Continue to the documentation",
    propsName: "Name",
    staticChrome: "Rendered with the static chrome: @standardoc/ui is not installed.",
  },
  fr: {
    documentation: "Documentation",
    theme: "Thème",
    density: "Densité",
    auto: "Auto",
    light: "Clair",
    dark: "Sombre",
    desktop: "Bureau",
    touch: "Tactile",
    onThisPage: "Sur cette page",
    seeAlso: "Voir aussi",
    showCode: "Afficher le code",
    hideCode: "Masquer le code",
    prop: "Prop",
    type: "Type",
    notes: "Notes",
    answered: "Répondu",
    pending: "En attente",
    language: "Langue",
    localeName: "Français",
    redirect: "Continuer vers la documentation",
    propsName: "Nom",
    staticChrome: "Rendu avec le chrome statique : @standardoc/ui n'est pas installé.",
  },
};

function dictionaryOf(locale: string): Labels | undefined {
  const primary = locale.split("-")[0] ?? locale;
  return Object.hasOwn(LABELS, primary) ? LABELS[primary as keyof typeof LABELS] : undefined;
}

export function labelsFor(locale: string, overrides?: Partial<Labels>): Labels {
  return { ...(dictionaryOf(locale) ?? LABELS.en), ...overrides };
}

export function localeName(locale: string, overrides?: Partial<Labels>): string {
  return overrides?.localeName ?? dictionaryOf(locale)?.localeName ?? locale;
}
