export type ScoreTheme = {
  name: "high" | "medium" | "low";
  color: string;
  softBackground: string;
  chipClassName: string;
  borderClassName: string;
};

export function getScoreTheme(score: number): ScoreTheme {
  if (score >= 65) {
    return {
      name: "high",
      color: "#0d6a72",
      softBackground: "#e7f6f3",
      chipClassName: "bg-emerald-100 text-emerald-800",
      borderClassName: "border-emerald-200",
    };
  }

  if (score >= 50) {
    return {
      name: "medium",
      color: "#c9861b",
      softBackground: "#fff4df",
      chipClassName: "bg-amber-100 text-amber-800",
      borderClassName: "border-amber-200",
    };
  }

  return {
    name: "low",
    color: "#b93f2c",
    softBackground: "#fee8e5",
    chipClassName: "bg-rose-100 text-rose-800",
    borderClassName: "border-rose-200",
  };
}
