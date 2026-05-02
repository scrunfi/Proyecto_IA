"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";

import type { Business } from "@/lib/mock-data";
import { getScoreTheme } from "@/lib/score-theme";

type OpportunityListProps = {
  businesses: Business[];
};

export function OpportunityList({ businesses }: OpportunityListProps) {
  if (businesses.length === 0) {
    return (
      <aside className="rounded-3xl border border-line bg-surface p-4 shadow-sm">
        <h2 className="mb-3 font-semibold">Top oportunidades</h2>
        <p className="rounded-2xl border border-line bg-surface-2 p-4 text-sm text-zinc-600">
          No hay negocios para los filtros seleccionados.
        </p>
      </aside>
    );
  }

  const sortedBusinesses = businesses.slice().sort((a, b) => b.gap - a.gap);

  return (
    <aside className="rounded-3xl border border-line bg-surface p-4 shadow-sm">
      <h2 className="mb-3 font-semibold">Top oportunidades</h2>
      <motion.div
        className="space-y-3"
        variants={{
          hidden: { opacity: 0 },
          show: { opacity: 1, transition: { staggerChildren: 0.06 } },
        }}
        initial="hidden"
        animate="show"
      >
        <AnimatePresence mode="popLayout">
          {sortedBusinesses.map((item) => {
            const theme = getScoreTheme(item.score);

            return (
              <motion.article
              key={item.id}
              layout
              variants={{
                hidden: { opacity: 0, y: 8 },
                show: { opacity: 1, y: 0 },
              }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className={`rounded-2xl border bg-surface-2 p-3 ${theme.borderClassName}`}
            >
              <p className="text-xs text-zinc-600">
                {item.neighborhood} - {item.category}
              </p>
              <p className="mt-1 font-semibold">{item.name}</p>
              <div className="mt-2 flex items-center justify-between text-sm">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${theme.chipClassName}`}
                >
                  Score: {item.score}
                </span>
                <span className="font-semibold text-accent">Gap: {item.gap} pts</span>
              </div>
              <div className="mt-3">
                <Link
                  href={`/negocio/${item.id}`}
                  className="text-sm font-semibold underline-offset-4 hover:underline"
                  style={{ color: theme.color }}
                >
                  Ver detalle
                </Link>
              </div>
              </motion.article>
            );
          })}
        </AnimatePresence>
      </motion.div>
    </aside>
  );
}
