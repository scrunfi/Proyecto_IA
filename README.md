# Barrio Competitivo Almeria

Plataforma web para analizar la brecha digital de negocios locales en Almeria, agrupados por barrio, con visualizacion en mapa, filtros dinamicos y recomendaciones de accion apoyadas por IA.

## Objetivo

Convertir datos de presencia digital en decisiones practicas:

- Detectar negocios con mayor oportunidad de mejora.
- Comparar resultados por barrio y sector.
- Priorizar acciones de alto impacto con recomendaciones automatizadas.

---

## Arquitectura

El proyecto se organiza en dos capas:

- `apps/web`: frontend en Next.js.
- `services/api`: backend en FastAPI para ingesta, calculo de metricas y operaciones de IA.

El frontend consume el backend mediante HTTP (REST).

---

## Stack Tecnologico

### Frontend

- Next.js 16 (App Router)
- React 19
- TypeScript 5
- Tailwind CSS 4
- Framer Motion
- Leaflet + OpenStreetMap

### Backend

- FastAPI (Python)
- Pydantic (validacion y contratos de datos)
- Uvicorn (servidor ASGI)

### Persistencia

- MongoDB Atlas (cloud) para `shops` e `ingesta_runs`
- Opcion hibrida recomendada: MongoDB (normalizado) + JSON crudo comprimido en object storage

---

## Funcionalidades

- Dashboard con metricas clave:
  - Barrios activos
  - Negocios analizados
  - Score medio
  - Brecha media
- Filtros por barrio, sector y score minimo.
- URL compartible con filtros activos.
- Mapa de oportunidades con marcadores por nivel de score.
- Ranking de oportunidades por mayor gap.
- Vista detalle por negocio con benchmark y recomendaciones.

 * score: Nota de madurez digital del negocio [0-100]
 * gap: Distancia entre el score del negocio y el benchmark.
 * Benchmark: Referencia contra la que comparar los negocios. Objetivo del sector (percentil 75).

 Ejemplo rápido:
- Score negocio: 58  
- Benchmark sector: 75  
- Gap: 75 - 58 = 17  
=> ese negocio tiene 17 puntos de brecha.
---

## Funcionamiento

1. El frontend solicita datos al backend FastAPI.
2. FastAPI valida y transforma datos de entrada.
3. Se calculan score, gap y brecha media para el filtro actual.
4. El backend devuelve listado, metricas agregadas y detalle.
5. El frontend renderiza dashboard, mapa y fichas.
6. Para IA, FastAPI puede entrenar/actualizar modelo y exponer inferencia de recomendaciones.

---

## Endpoints actuales (FastAPI)

- `POST /ingesta`
  - Ejecuta ingesta desde Overpass, normaliza y actualiza `shops`.
- `GET /ingesta/runs`
  - Lista ejecuciones de ingesta con paginacion.
- `GET /shops`
  - Lista negocios activos con filtros (`barrio`, `category`, `min_score`) y bbox opcional (`south`, `west`, `north`, `east`).
- `GET /shops/id/{shop_id}`
  - Devuelve ficha base de un negocio.
- `GET /shops/id/{shop_id}/detail`
  - Devuelve detalle con benchmark y recomendaciones.
- `GET /shops/quality`
  - Reporte agregado de calidad y asignacion de barrio.
- `GET /shops/quality/issues`
  - Muestra incidencias de calidad (sin barrio, sin ubicacion, posibles duplicados).
- `POST /shops/repair-barrios`
  - Reasigna barrio por coordenadas/etiquetas (`only_missing`, `limit`).

Nota: el frontend incluye vistas operativas `/ingesta`, `/etl` y `/entrenamiento`. Actualmente, las acciones de ETL y entrenamiento son interfaz preparada y no tienen endpoint backend final equivalente.

---

## Modelo de analisis

- `Score (0-100)`: nivel de madurez digital del negocio.
- `Gap`: distancia entre el score del negocio y el objetivo de referencia.
- `Brecha media`: promedio de gap del conjunto filtrado.

---

## Criterio territorial (barrios)

Metodo recomendado:

1. Definir los 5 barrios con cartografia oficial (GeoJSON/Shapefile).
2. Asignar negocio a barrio por coordenadas (`lat/lon`) con punto-en-poligono.
3. Usar codigo postal solo como fallback cuando falte geolocalizacion.

---

## Estructura recomendada

```bash
apps/
  web/                    # Next.js frontend
services/
  api/                    # FastAPI backend
    app/
      main.py
      routers/
      schemas/
      services/
      ml/
      data/
```

---

## Puesta en marcha local

### Requisitos

- Node.js 20+
- Python 3.11+

### Frontend (Next.js)

```bash
cd apps/web
npm install
npm run dev
```

Frontend disponible en `http://localhost:3000`.

### Backend (FastAPI)

```bash
cd services/api
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

API disponible en `http://localhost:8000`.
Documentacion interactiva en `http://localhost:8000/docs`.

---

## Variables de entorno sugeridas

### Frontend (`apps/web/.env.local`)

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

### Backend (`services/api/.env`)

```env
MONGO_URI=mongodb+srv://<usuario>:<password>@<cluster>.mongodb.net/?retryWrites=true&w=majority&appName=almeria
MONGO_DB_NAME=almeria_shop
OVERPASS_API_URL=https://overpass-api.de/api/interpreter
OVERPASS_TIMEOUT_SECONDS=60
OVERPASS_USER_AGENT=ProyectoAlmeria/1.0
BARRIOS_GEOJSON_PATH=app/data/barrios.geojson
```

Nota: puedes copiar `services/api/.env.example` a `services/api/.env` y completar credenciales.

---

## Higiene de repositorio

- No subir secretos ni configuracion local (`.env`, `.env.local`).
- No subir entornos virtuales ni caches de Python (`.venv`, `__pycache__`, `*.pyc`).
- Mantener versionado `services/api/.env.example` como plantilla compartida.
- Si ya existen archivos locales ignorables, puedes limpiar el indice con:

```bash
git rm -r --cached services/api/.venv services/api/**/__pycache__
git rm --cached services/api/.env
```

---

## Scripts utiles

### Frontend

- `npm run dev` - desarrollo
- `npm run build` - build de produccion
- `npm run start` - ejecutar build
- `npm run lint` - linting

### Backend

- `uvicorn app.main:app --reload --port 8000` - desarrollo

---

## Roadmap

### Fase 1 - MVP funcional

- [x] Dashboard, mapa, filtros y detalle.
- [x] Ingesta base desde Overpass con normalizacion y scoring inicial.
- [x] Endpoints de consulta de negocios y detalle.
- [x] Conexion Next.js -> FastAPI para dashboard y detalle.
- [ ] Cerrar paridad total entre panel operativo (`/ingesta`, `/etl`, `/entrenamiento`) y endpoints backend.

### Fase 2 - IA aplicada

- [ ] Pipeline de entrenamiento.
- [ ] Versionado de modelos.
- [ ] Recomendaciones por dimensiones debiles.

### Fase 3 - Operacion y escalado

- [x] Reportes de calidad y utilidades de reparacion de barrio.
- [ ] Validacion y monitoreo continuo de calidad de datos.
- [ ] Logging y observabilidad.
- [ ] Migracion a PostgreSQL cuando aplique.


