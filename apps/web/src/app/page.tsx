import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { PrecomputeAllButton } from "@/components/admin/precompute-all-button";
import { GenerateAllWebsButton } from "@/components/admin/generate-all-webs-button";
import { ChatWidget } from "@/components/chat/chat-widget";

export default function Home() {
  return (
    <div className="flex w-full flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 h-auto">
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

      <section className="rounded-3xl border border-line bg-surface px-5 py-4 shadow-sm">
        <h2 className="font-semibold">Panel operativo</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Ejecuta procesos masivos para analisis IA de todos los negocios.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <PrecomputeAllButton />
          <GenerateAllWebsButton />
        </div>
      </section>

      <ChatWidget context="home" />
    </div>
  );
}
