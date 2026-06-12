# Barrio Competitivo Almeria

Plataforma web para analizar la brecha digital de negocios locales en Almeria, agrupados por barrio, con visualizacion en mapa, filtros dinamicos y recomendaciones de accion apoyadas por IA.

## Objetivo

Convertir datos de presencia digital en decisiones practicas:

- Detectar negocios con mayor oportunidad de mejora.
- Comparar resultados por barrio y sector.
- Priorizar acciones de alto impacto con recomendaciones automatizadas.

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

### I.A.

- Ollama
- n8n (Orquestación de flujos)

### Persistencia

- MongoDB Atlas (cloud) para `shops` e `ingesta_runs`
- Opcion hibrida recomendada: MongoDB (normalizado) + JSON crudo comprimido en object storage

---

## Modelo de analisis

- `Score (0-100)`: nivel de madurez digital del negocio.
- `Gap`: distancia entre el score del negocio y el objetivo de referencia.
- `Brecha media`: promedio de gap del conjunto filtrado.

---

## Puesta en marcha local

### Requisitos

- Node.js 20+
- Python 3.11+



## Variables de entorno sugeridas

```env
MONGO_URI=mongodb://<Tu_Usuario>:<Tu_Password>@mongo:27017/almeria_shop?authSource=<Tu_Usuario>
MONGO_DB_NAME=almeria_shop

OVERPASS_API_URL=https://overpass-api.de/api/interpreter
OVERPASS_TIMEOUT_SECONDS=60
OVERPASS_USER_AGENT=ProyectoAlmeria/1.0
OVERPASS_BBOX=36.80,-2.52,36.88,-2.40
BARRIOS_GEOJSON_PATH=app/data/barrios.geojson

NEXT_PUBLIC_API_BASE_URL=http://api:8000
N8N_TIMEOUT_SECONDS=4200
N8N_WEB_TIMEOUT_SECONDS=4200
N8N_WEBHOOK_URL=http://n8n:5678/webhook/a2c9f55c-ca19-4d21-a64e-05faec7f4f72
N8N_WEBHOOK_WEB_URL=http://n8n:5678/webhook/6195475f-6e7b-4d96-9976-887ec6e3c766
N8N_CHAT_WEBHOOK_URL=http://n8n:5678/webhook/f5e986ec-8ab3-4964-a2f4-c9569c64f1d1/chat
QDRANT_API_KEY=<Tu_Qdrant_API_Key>
N8N_CHAT_TIMEOUT_MS=300000

MONGO_INITDB_ROOT_USERNAME=>Tu_Usuario>
MONGO_INITDB_ROOT_PASSWORD=<Tu_Mongo_Password>
MONGO_INITDB_DATABASE=almeria_shop
```

## Comando para desplegar la aplicación

- docker compose up -d --build







