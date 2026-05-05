import { AdminShell } from "@/components/admin/admin-shell";
import { EtlConsole } from "@/components/admin/etl-console";

export default function EtlPage() {
  return (
    <AdminShell
      title="ETL y recalculo"
      description="Ejecuta limpieza, transformacion y recalculo de metricas antes de analisis o entrenamiento."
    >
      <EtlConsole />
    </AdminShell>
  );
}
