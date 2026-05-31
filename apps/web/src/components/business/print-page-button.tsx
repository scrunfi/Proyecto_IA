"use client";

export function PrintPageButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-full border border-line bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
    >
      Guardar como PDF
    </button>
  );
}
