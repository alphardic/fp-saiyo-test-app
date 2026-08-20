/**
 * Gallup社 ストレングスファインダー(CliftonStrengths)の34資質。
 * 日本語公式表記は誤って伝えるリスクがあるため、英語の公式名称をそのまま使う。
 */
export const STRENGTHS_DOMAINS = [
  {
    domain: "Executing",
    themes: [
      "Achiever",
      "Arranger",
      "Belief",
      "Consistency",
      "Deliberative",
      "Discipline",
      "Focus",
      "Responsibility",
      "Restorative",
    ],
  },
  {
    domain: "Influencing",
    themes: [
      "Activator",
      "Command",
      "Communication",
      "Competition",
      "Maximizer",
      "Self-Assurance",
      "Significance",
      "Woo",
    ],
  },
  {
    domain: "Relationship Building",
    themes: [
      "Adaptability",
      "Connectedness",
      "Developer",
      "Empathy",
      "Harmony",
      "Includer",
      "Individualization",
      "Positivity",
      "Relator",
    ],
  },
  {
    domain: "Strategic Thinking",
    themes: [
      "Analytical",
      "Context",
      "Futuristic",
      "Ideation",
      "Input",
      "Intellection",
      "Learner",
      "Strategic",
    ],
  },
] as const;

export const ALL_STRENGTHS_THEMES = STRENGTHS_DOMAINS.flatMap((d) => d.themes);
