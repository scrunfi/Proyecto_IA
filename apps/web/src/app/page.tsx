import { DashboardShell } from "@/components/dashboard/dashboard-shell";

export default function Home() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="rounded-3xl border border-line bg-surface px-6 py-8 shadow-sm">
        <p className="text-xs font-semibold tracking-[0.2em] text-accent uppercase">
          Barrio Competitivo Almeria
        </p>
        <h1 className="mt-2 font-serif text-4xl leading-tight sm:text-5xl">
          Radar digital de negocios locales
        </h1>
        <p className="mt-4 max-w-3xl text-sm text-zinc-700 sm:text-base">
          Detecta brecha digital por barrio, compara competencia cercana y
          prioriza acciones de alto impacto para cada comercio.
        </p>
      </header>

      <DashboardShell />
    </div>
  );
}
