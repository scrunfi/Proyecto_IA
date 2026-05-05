import { AdminShell } from "@/components/admin/admin-shell";
import { IngestionConsole } from "@/components/admin/ingestion-console";

export default function IngestionPage() {
  return (
    <AdminShell
      title="Ingesta inicial"
      description="Carga y valida el dataset de negocios. Esta vista esta abierta para todo el equipo en la fase actual."
    >
      <IngestionConsole />
    </AdminShell>
  );
}
