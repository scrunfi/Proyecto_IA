type InfoTooltipProps = {
  text: string;
  label?: string;
  align?: "left" | "right";
};

export function InfoTooltip({ text, label = "Mostrar ayuda", align = "left" }: InfoTooltipProps) {
  const alignClass = align === "right" ? "right-0" : "left-0";

  return (
    <span className="group relative hidden md:inline-flex md:items-center">
      <button
        type="button"
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-line text-[10px] font-semibold leading-none text-zinc-600 transition-colors hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        aria-label={label}
      >
        i
      </button>
      <span
        role="tooltip"
        className={`pointer-events-none absolute top-full z-20 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-line bg-surface px-3 py-2 text-xs leading-relaxed text-zinc-700 shadow-lg opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 ${alignClass}`}
      >
        {text}
      </span>
    </span>
  );
}
