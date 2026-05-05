import { AdminShell } from "@/components/admin/admin-shell";
import { TrainingConsole } from "@/components/admin/training-console";

export default function TrainingPage() {
  return (
    <AdminShell
      title="Entrenamiento"
      description="Lanza nuevas versiones del modelo seleccionando configuraciones de entrenamiento y validacion."
    >
      <TrainingConsole />
    </AdminShell>
  );
}
