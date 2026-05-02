# Barrio Competitivo Almería
Aplicación web para analizar la brecha digital de negocios locales en Almería, agrupados por barrio, con visualización en mapa, filtros dinámicos y recomendaciones de mejora.
## Objetivo
Transformar datos de presencia digital de comercios en decisiones accionables:
- Detectar negocios con mayor oportunidad de mejora.
- Comparar resultados por barrio y sector.
- Priorizar acciones de alto impacto con apoyo de IA.
---
## Stack Tecnológico
### Frontend
- **Next.js 16** (App Router)
- **React 19**
- **TypeScript 5**
- **Tailwind CSS 4**
- **Framer Motion** (animaciones UI)
- **Leaflet + OpenStreetMap** (mapa interactivo)
### Backend (actual)
- **API Routes de Next.js**
  - `GET /api/businesses`
  - `GET /api/businesses/[id]`
- Datos mock iniciales en `src/lib/mock-data.ts`
### Calidad de código
- **ESLint**
- Tipado estricto con TypeScript (`strict: true`)
---
## Funcionalidades actuales
- Dashboard principal con métricas:
  - Barrios activos
  - Negocios analizados
  - Score medio
  - Brecha media
- Filtros por:
  - Barrio
  - Sector
  - Score mínimo
- URL compartible con filtros activos.
- Mapa de oportunidades con marcadores por nivel de score.
- Lista “Top oportunidades” ordenada por mayor gap.
- Vista detalle por negocio (`/negocio/[id]`) con benchmark y recomendaciones.
- Feedback visual y animaciones de transición.
---
## Estructura del proyecto
```bash
apps/web
├── src/app
│   ├── api/businesses/route.ts
│   ├── api/businesses/[id]/route.ts
│   ├── negocio/[id]/page.tsx
│   ├── layout.tsx
│   └── page.tsx
├── src/components
│   ├── business/opportunity-list.tsx
│   ├── dashboard/dashboard-shell.tsx
│   ├── dashboard/metric-card.tsx
│   └── map/map-view.tsx
├── src/lib
│   ├── api-client.ts
│   ├── mock-data.ts
│   └── score-theme.ts
└── src/app/globals.css
---
## Flujo de funcionamiento
1. El frontend carga el dashboard.
2. Se consulta `GET /api/businesses`.
3. Se renderizan métricas, mapa y ranking de oportunidades.
4. El usuario aplica filtros (`barrio`, `sector`, `score_min`).
5. Los filtros se reflejan en URL para compartir la vista.
6. Al entrar al detalle de un negocio, se muestra benchmark y acciones recomendadas.
---
Modelo de análisis (conceptos clave)
- Score (0–100): nivel de madurez digital del negocio.
- Gap: distancia entre el score del negocio y un objetivo de referencia.
- Brecha media: promedio de gaps del conjunto filtrado (barrio/sector).
---
Fuentes de datos (estrategia MVP)
Para el arranque del proyecto:
- Ingesta inicial única (sin periodicidad obligatoria).
- Priorización de variables de alta disponibilidad (ej. Places + geolocalización).
- Campos avanzados se incorporan en fases posteriores.
> Nota: para una demo académica inicial no es obligatorio PostgreSQL ni ingestas periódicas.
---
Instalación y ejecución local
Requisitos
- Node.js 20+ recomendado
- npm
Pasos
cd apps/web
npm install
npm run dev
Abrir en navegador:
- http://localhost:3000
---
Scripts disponibles
npm run dev     # entorno de desarrollo
npm run build   # build de producción
npm run start   # ejecutar build
npm run lint    # linting
---
## Roadmap (pasos a seguir)
### Fase 1 - MVP funcional (actual + inmediato)
- [x] Dashboard, mapa, filtros y detalle por negocio.
- [x] API local con datos mock.
- [ ] Definir dataset inicial real de 5 barrios.
- [ ] Formalizar metodología de score/gap para memoria académica.
### Fase 2 - Consolidación de datos
- [ ] Sustituir mocks por fuente real de ingesta.
- [ ] Asignación de barrio por coordenadas (punto-en-polígono).
- [ ] Validación de calidad de datos y trazabilidad de asignación.
### Fase 3 - Escalado técnico
- [ ] Persistencia en base de datos (PostgreSQL + ORM).
- [ ] Pipeline de actualización (si se requiere evolución temporal).
- [ ] Autenticación y roles (admin/analista/visor).
### Fase 4 - Inteligencia aplicada
- [ ] Recomendaciones IA por dimensión débil.
- [ ] Exportación de reportes (CSV/PDF).
- [ ] Métricas de impacto por barrio.
---
Criterio metodológico de barrios
Método recomendado:
1. Definir 5 barrios con cartografía oficial (GeoJSON/Shapefile).
2. Asignar negocios por coordenadas (lat/lon) con punto-en-polígono.
3. Usar código postal solo como fallback cuando falte geolocalización.