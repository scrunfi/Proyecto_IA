import os
import asyncio
import logging
import html
import re
from uuid import uuid4
from urllib.parse import urlparse, urlunparse
import json

from fastapi import APIRouter, HTTPException, Query
from datetime import datetime, timezone, timedelta
from hashlib import sha256
import httpx

from app.database.mongo import (
    ai_analysis_collection,
    ingesta_runs_collection,
    precompute_jobs_collection,
    shop_web_pages_collection,
    shop_reviews_collection,
    shops_collection,
    web_generation_jobs_collection,
    web_requests_collection,
)
from app.services.barrios_service import infer_barrio_name, load_barrios_geojson
from app.services.normalizer import normalize_element
from app.services.overpass_service import fetch_overpass_shops

from app.services.google_places_service import fetch_google_reviews

router = APIRouter()
PRECOMPUTE_CANCEL_FLAGS: dict[str, bool] = {}
WEB_GENERATION_CANCEL_FLAGS: dict[str, bool] = {}
logger = logging.getLogger(__name__)
PRECOMPUTE_PROGRESS_EVERY = max(1, int(os.getenv("PRECOMPUTE_PROGRESS_EVERY", "50")))
WEB_GENERATION_PROGRESS_EVERY = max(1, int(os.getenv("WEB_GENERATION_PROGRESS_EVERY", "50")))

N8N_WEBHOOK_URL = os.getenv("N8N_WEBHOOK_URL", "").strip()
N8N_WEBHOOK_WEB_URL = os.getenv("N8N_WEBHOOK_WEB_URL", "").strip()
N8N_WEBHOOK_AUTH_HEADER = os.getenv("N8N_WEBHOOK_AUTH_HEADER", "").strip()
N8N_WEBHOOK_AUTH_VALUE = os.getenv("N8N_WEBHOOK_AUTH_VALUE", "").strip()
N8N_TIMEOUT_SECONDS = float(os.getenv("N8N_TIMEOUT_SECONDS", "420"))
N8N_WEB_TIMEOUT_SECONDS = float(os.getenv("N8N_WEB_TIMEOUT_SECONDS", str(N8N_TIMEOUT_SECONDS)))
N8N_WEB_RETRIES = max(1, int(os.getenv("N8N_WEB_RETRIES", "2")))
N8N_WEB_RETRY_DELAY_SECONDS = max(0.0, float(os.getenv("N8N_WEB_RETRY_DELAY_SECONDS", "2")))


def _to_utc_aware(value: datetime | None) -> datetime | None:
    if not isinstance(value, datetime):
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


async def _request_n8n_web_request(shop: dict, request_id: str):
    webhook_url = N8N_WEBHOOK_WEB_URL or N8N_WEBHOOK_URL
    if not webhook_url:
        raise HTTPException(status_code=503, detail="N8N_WEBHOOK_WEB_URL no configurada")

    tags = (shop.get("osm") or {}).get("tags")
    business_id = str(shop.get("_id") or "").strip()
    osm_id = ((shop.get("osm") or {}).get("id"))
    resolved_id = osm_id if osm_id is not None else business_id
    payload = {
        # Campos duplicados para compatibilidad con distintos flujos de n8n.
        "id": resolved_id,
        "osm_id": osm_id,
        "osmId": osm_id,
        "shop_id": business_id,
        "shopId": business_id,
        "name": shop.get("name"),
        "category": shop.get("category"),
        "subcategory": shop.get("subcategory"),
        "barrio": ((shop.get("barrio") or {}).get("name")),
        "score": shop.get("score"),
        "gap": shop.get("gap"),
        "has_website": _has_website(shop),
        "website": (tags or {}).get("website") if isinstance(tags, dict) else None,
        "request_id": request_id,
    }

    timeout = httpx.Timeout(N8N_WEB_TIMEOUT_SECONDS, connect=10.0)
    headers = {"Content-Type": "application/json"}
    if N8N_WEBHOOK_AUTH_HEADER and N8N_WEBHOOK_AUTH_VALUE:
        headers[N8N_WEBHOOK_AUTH_HEADER] = N8N_WEBHOOK_AUTH_VALUE

    try:
        async with httpx.AsyncClient(timeout=timeout, trust_env=False) as client:
            last_http_error: httpx.HTTPError | None = None
            response = None

            for attempt in range(1, N8N_WEB_RETRIES + 1):
                try:
                    response = await client.post(
                        webhook_url,
                        params={"id": resolved_id, "shop_id": business_id, "request_id": request_id},
                        json=payload,
                        headers=headers,
                    )
                    response.raise_for_status()
                    break
                except httpx.HTTPStatusError:
                    raise
                except httpx.HTTPError as exc:
                    last_http_error = exc
                    if attempt < N8N_WEB_RETRIES and N8N_WEB_RETRY_DELAY_SECONDS > 0:
                        await asyncio.sleep(N8N_WEB_RETRY_DELAY_SECONDS)

            if response is None:
                raise last_http_error or httpx.ConnectError("No se pudo conectar con n8n")
    except httpx.HTTPStatusError as exc:
        detail = exc.response.text.strip()
        if len(detail) > 400:
            detail = f"{detail[:400]}..."
        raise HTTPException(status_code=502, detail=f"n8n respondio {exc.response.status_code}: {detail}") from exc
    except httpx.HTTPError as exc:
        detail = str(exc).strip() or repr(exc)
        raise HTTPException(status_code=502, detail=f"No se pudo conectar con n8n: {detail}") from exc

    content_type = response.headers.get("content-type", "")
    if "application/json" in content_type:
        try:
            return response.json()
        except json.JSONDecodeError:
            text = response.text.strip()
            if text:
                return {"result": text}
            return {"result": ""}
    return {"raw": response.text}


async def _run_shop_web_request(request_id: str, shop_id: str, shop: dict):
    try:
        await web_requests_collection.update_one(
            {"request_id": request_id},
            {
                "$set": {
                    "status": "processing",
                    "updated_at": datetime.now(timezone.utc),
                }
            },
        )
        webhook_response = await _request_n8n_web_request(shop, request_id)
        extracted_html = _extract_html_from_payload(webhook_response)
        generated_html = _normalize_html_document(extracted_html)
        if extracted_html:
            now = datetime.now(timezone.utc)
            await shop_web_pages_collection.update_one(
                {"shop_id": shop_id},
                {
                    "$set": {
                        "shop_id": shop_id,
                        "osm_id": ((shop.get("osm") or {}).get("id")),
                        "request_id": request_id,
                        "status": "sent" if generated_html else "sent_raw",
                        "source": "n8n",
                        "html": generated_html or extracted_html,
                        "html_renderable": bool(generated_html),
                        "updated_at": now,
                    },
                    "$setOnInsert": {
                        "created_at": now,
                    },
                },
                upsert=True,
            )
        await web_requests_collection.update_one(
            {"request_id": request_id},
            {
                "$set": {
                    "status": "sent",
                    "response": webhook_response,
                    "updated_at": datetime.now(timezone.utc),
                }
            },
        )
    except HTTPException as exc:
        detail = str(exc.detail) if getattr(exc, "detail", None) else str(exc)
        await web_requests_collection.update_one(
            {"request_id": request_id},
            {
                "$set": {
                    "status": "error",
                    "error": detail,
                    "updated_at": datetime.now(timezone.utc),
                }
            },
        )
    except Exception as exc:
        detail = str(exc) or repr(exc)
        await web_requests_collection.update_one(
            {"request_id": request_id},
            {
                "$set": {
                    "status": "error",
                    "error": detail,
                    "updated_at": datetime.now(timezone.utc),
                }
            },
        )

async def _request_n8n_analysis(business_id: str, osm_id: str | int | None):
    if not N8N_WEBHOOK_URL:
        raise HTTPException(status_code=503, detail="N8N_WEBHOOK_URL no configurada")

    resolved_id = osm_id if osm_id is not None else business_id
    payload = {
        "id": resolved_id,
        "osm_id": resolved_id,
        "osmId": resolved_id,
        "shop_id": business_id,
        "shopId": business_id,
    }
    timeout = httpx.Timeout(N8N_TIMEOUT_SECONDS, connect=10.0)
    headers = {"Content-Type": "application/json"}
    if N8N_WEBHOOK_AUTH_HEADER and N8N_WEBHOOK_AUTH_VALUE:
        headers[N8N_WEBHOOK_AUTH_HEADER] = N8N_WEBHOOK_AUTH_VALUE

    parsed_url = urlparse(N8N_WEBHOOK_URL)
    http_fallback_url = N8N_WEBHOOK_URL
    if parsed_url.scheme == "https":
        http_fallback_url = urlunparse(parsed_url._replace(scheme="http"))

    candidate_urls: list[str] = []
    if parsed_url.hostname == "n8n" and http_fallback_url != N8N_WEBHOOK_URL:
        candidate_urls.append(http_fallback_url)
        candidate_urls.append(N8N_WEBHOOK_URL)
    else:
        candidate_urls.append(N8N_WEBHOOK_URL)
        if http_fallback_url != N8N_WEBHOOK_URL:
            candidate_urls.append(http_fallback_url)

    last_http_error: httpx.HTTPError | None = None
    response = None

    try:
        async with httpx.AsyncClient(timeout=timeout, trust_env=False) as client:
            for webhook_url in candidate_urls:
                try:
                    response = await client.post(webhook_url, json=payload, headers=headers)
                    response.raise_for_status()
                    break
                except httpx.HTTPStatusError as exc:
                    error_preview = exc.response.text.strip()
                    if len(error_preview) > 500:
                        error_preview = f"{error_preview[:500]}..."
                    detail = f"n8n respondio {exc.response.status_code}"
                    if error_preview:
                        detail = f"{detail}: {error_preview}"
                    raise HTTPException(status_code=502, detail=detail) from exc
                except httpx.HTTPError as exc:
                    last_http_error = exc

            if response is None:
                raise last_http_error or httpx.ConnectError("No se pudo conectar con n8n")
    except httpx.HTTPError as exc:
        detail_text = str(exc).strip() or repr(exc)
        raise HTTPException(status_code=502, detail=f"No se pudo conectar con n8n: {detail_text}") from exc

    content_type = response.headers.get("content-type", "")
    if "application/json" in content_type:
        return response.json()

    text = response.text.strip()
    return {"result": text}


async def _find_active_shop_by_id(shop_id: str, projection: dict | None = None):
    shop = await shops_collection.find_one({"_id": shop_id, "active": True}, projection)
    if shop:
        return shop

    numeric_osm_id = int(shop_id) if shop_id.isdigit() else None
    osm_candidates: list[str | int] = [shop_id]
    if numeric_osm_id is not None:
        osm_candidates.append(numeric_osm_id)

    return await shops_collection.find_one(
        {"active": True, "osm.id": {"$in": osm_candidates}},
        projection,
    )


def _shop_tags(shop: dict) -> dict:
    direct = shop.get("tags")
    if isinstance(direct, dict):
        return direct

    osm_tags = ((shop.get("osm") or {}).get("tags"))
    if isinstance(osm_tags, dict):
        return osm_tags

    return {}


def _has_website(shop: dict) -> bool:
    tags = _shop_tags(shop)
    return any(tags.get(key) for key in ["website", "contact:website", "brand:website"])


def _shop_id_candidates(shop_id: str) -> list[str]:
    base = str(shop_id or "").strip()
    if not base:
        return []

    candidates = [base]
    if base.startswith("osm:node:"):
        tail = base.split(":")[-1].strip()
        if tail:
            candidates.append(tail)
    elif base.isdigit():
        candidates.append(f"osm:node:{base}")

    return list(dict.fromkeys(candidates))


def _build_fallback_ai_payload(n8n_error: str):
    fallback_recommendations = [
        "Completa descripcion, categoria y datos de contacto de la ficha del negocio.",
        "Publica novedades semanales y responde resenas para mejorar confianza local.",
        "Revisa horario, web y redes para mantener consistencia en todos los canales.",
    ]

    return {
        "source": "fallback",
        "warning": "Analisis IA no disponible temporalmente; se devuelve respuesta de contingencia.",
        "n8n_error": n8n_error,
        "data": {
            "analysis": {
                "status": "degraded",
                "summary": "No fue posible completar el flujo de IA en n8n.",
                "recommendations": fallback_recommendations,
            }
        },
    }


async def _save_ai_analysis_cache(shop_id: str, osm_id: str | int | None, payload: dict) -> None:
    now = datetime.now(timezone.utc)
    await ai_analysis_collection.update_one(
        {"shop_id": shop_id},
        {
            "$set": {
                "shop_id": shop_id,
                "osm_id": osm_id,
                "payload": payload,
                "updated_at": now,
            },
            "$setOnInsert": {
                "created_at": now,
            },
        },
        upsert=True,
    )


async def _compute_ai_payload(shop_id: str, osm_id: str | int | None) -> dict:
    reviews_doc = await shop_reviews_collection.find_one(
        {"shop_id": shop_id},
        {"_id": 0, "reviews": 1},
    )
    reviews = reviews_doc.get("reviews") if isinstance(reviews_doc, dict) else []
    has_comments = isinstance(reviews, list) and any(
        isinstance(item, dict) and str(item.get("text", "")).strip() for item in reviews
    )

    if not has_comments:
        return await _build_actions_only_ai_payload(shop_id)

    try:
        n8n_data = await _request_n8n_analysis(shop_id, osm_id)
        return {
            "source": "n8n",
            "data": n8n_data,
        }
    except HTTPException as exc:
        return _build_fallback_ai_payload(str(exc.detail))


async def _build_actions_only_ai_payload(shop_id: str) -> dict:
    shop = await shops_collection.find_one({"_id": shop_id, "active": True})
    if not shop:
        return _build_fallback_ai_payload("Negocio no encontrado para informe sin comentarios")

    score = int(shop.get("score", 0) or 0)
    gap = int(shop.get("gap", 0) or 0)
    category = shop.get("category") or "Negocio"
    subcategory = shop.get("subcategory") or category
    barrio_name = ((shop.get("barrio") or {}).get("name")) or "Sin barrio"
    tags = ((shop.get("osm") or {}).get("tags")) or {}

    has_website = any(tags.get(key) for key in ["website", "contact:website", "brand:website"])
    has_phone = any(tags.get(key) for key in ["phone", "contact:phone", "brand:phone"])
    has_email = any(tags.get(key) for key in ["email", "contact:email", "brand:email"])
    has_social = any(
        tags.get(key)
        for key in [
            "contact:facebook",
            "facebook",
            "contact:instagram",
            "instagram",
            "contact:linkedin",
            "linkedin",
            "contact:twitter",
            "twitter",
            "contact:tiktok",
            "tiktok",
        ]
    )
    has_opening_hours = bool(tags.get("opening_hours"))
    has_delivery = tags.get("delivery") == "yes" or tags.get("takeaway") == "yes"
    has_payment = any(
        tags.get(key) == "yes"
        for key in [
            "payment:cards",
            "cards",
            "payment:credit_cards",
            "credit_cards",
            "payment:debit_cards",
            "debit_cards",
            "payment:contactless",
            "contactless",
        ]
    )
    has_accessibility = tags.get("wheelchair") in {"yes", "limited"}
    has_brand = bool(tags.get("brand") or tags.get("operator"))
    has_address = bool(tags.get("addr:street") and (tags.get("addr:housenumber") or tags.get("addr:postcode")))

    recommendations: list[str] = []
    if score < 40:
        recommendations.append("Completa ficha digital basica: web, telefono y horario.")
    if score < 60:
        recommendations.append("Mejora consistencia en perfiles y activa publicaciones semanales.")
    if not _has_website(shop):
        recommendations.append("Activa una web basica y enlazala en todos los perfiles.")
    if gap > 0:
        recommendations.append("Prioriza acciones de alto impacto para cerrar el gap digital.")

    breakdown = _score_breakdown_from_tags(tags)
    weakest = sorted(breakdown, key=lambda item: float(item.get("ratio", 1)))[:3]
    for item in weakest:
        label = str(item.get("label", "Area"))
        detail = str(item.get("detail", "Mejora este bloque para ganar competitividad."))
        recommendations.append(f"{label}: {detail}")

    seen: set[str] = set()
    unique_recommendations: list[str] = []
    for rec in recommendations:
        normalized = rec.strip().lower()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        unique_recommendations.append(rec.strip())

    top_actions = unique_recommendations[:5]
    if not top_actions:
        top_actions = ["Mantiene posicion competitiva; optimiza conversion y fidelizacion local."]

    score_map = {item.get("label"): item for item in breakdown}

    def _score_text(label: str) -> str:
        data = score_map.get(label) or {}
        return f"{int(data.get('points', 0))}/{int(data.get('max_points', 0))}"

    presencia_missing: list[str] = []
    if not has_website:
        presencia_missing.append("web")
    if not has_phone:
        presencia_missing.append("telefono")
    if not has_email:
        presencia_missing.append("email")
    if not has_social:
        presencia_missing.append("redes")

    operacion_missing: list[str] = []
    if not has_opening_hours:
        operacion_missing.append("horario")
    if not has_delivery:
        operacion_missing.append("entrega/takeaway")
    if not has_payment:
        operacion_missing.append("metodos de pago")
    if not has_accessibility:
        operacion_missing.append("accesibilidad")

    confianza_missing: list[str] = []
    if not has_brand:
        confianza_missing.append("marca u operador")
    if not has_address:
        confianza_missing.append("direccion estructurada")

    apartados_lines = [
        "Detalle por apartados:",
        (
            f"- Presencia digital ({_score_text('Presencia digital')} pts): "
            + (
                f"faltan {', '.join(presencia_missing)}. "
                if presencia_missing
                else "base completa. "
            )
            + "Prioriza alta de web y telefono en ficha principal, y replica en todos los perfiles."
        ),
        (
            f"- Operacion y servicio ({_score_text('Operacion y servicio')} pts): "
            + (
                f"faltan {', '.join(operacion_missing)}. "
                if operacion_missing
                else "bloque operativo completo. "
            )
            + "Define horario semanal, activa entrega si aplica y publica metodos de pago visibles."
        ),
        (
            f"- Identidad y confianza ({_score_text('Identidad y confianza')} pts): "
            + (
                f"faltan {', '.join(confianza_missing)}. "
                if confianza_missing
                else "identidad y direccion completas. "
            )
            + "Estandariza nombre comercial y completa calle + numero + codigo postal."
        ),
        (
            f"- Completitud de ficha ({_score_text('Completitud de ficha')} pts): "
            f"hay {len(tags)} metadatos OSM. "
            "Agrega atributos utiles (categoria fina, servicios, enlaces, horarios especiales) para subir cobertura."
        ),
    ]

    action_lines = "\n".join(f"- {action}" for action in top_actions)
    apartados_text = "\n".join(apartados_lines)
    report = (
        "Resumen ejecutivo:\n"
        f"No hay comentarios de clientes disponibles para {subcategory} en {barrio_name}. "
        f"Se genera el informe con enfoque en acciones prioritarias a partir del score digital actual ({score}/100).\n\n"
        "Top acciones recomendadas:\n"
        f"{action_lines}\n\n"
        f"{apartados_text}\n\n"
        "Indicador sugerido:\n"
        f"Reducir el gap digital de {gap} puntos durante las proximas 6-8 semanas con seguimiento semanal."
    )

    return {
        "source": "local_actions",
        "data": {
            "analysis": report,
            "recommendations": top_actions,
            "mode": "no_comments_actions_report",
        },
    }


def _extract_html_from_payload(payload: object) -> str | None:
    if isinstance(payload, str):
        text = payload.strip()
        if not text:
            return None
        if "<!DOCTYPE html" in text or "<html" in text.lower():
            return text
        return None

    if isinstance(payload, list):
        for item in payload:
            found = _extract_html_from_payload(item)
            if found:
                return found
        return None

    if not isinstance(payload, dict):
        return None

    raw = payload
    preferred_keys = ["html", "output", "content", "result", "raw", "response"]
    for key in preferred_keys:
        found = _extract_html_from_payload(raw.get(key))
        if found:
            return found

    for value in raw.values():
        found = _extract_html_from_payload(value)
        if found:
            return found

    return None


def _normalize_html_document(value: str | None) -> str | None:
    if not value:
        return None

    text = value.strip()
    if not text:
        return None

    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z0-9_-]*\s*", "", text)
        text = re.sub(r"\s*```$", "", text)

    text = html.unescape(text).strip()

    # Remove template-like syntax (Jinja/Liquid/Handlebars) so output remains renderable HTML.
    if "{%" in text or "%}" in text:
        text = re.sub(r"\{%[\s\S]*?%\}", "", text)
    if "{{" in text or "}}" in text:
        text = re.sub(r"\{\{[\s\S]*?\}\}", "", text)

    # Remove common pseudo-template control lines leaked by small local models.
    text = re.sub(r"(?im)^\s*(if|elif|else)\b[^\n]*$", "", text)
    text = re.sub(r"(?im)^\s*\{%\s*set\b[^\n]*$", "", text)

    html_match = re.search(r"<!DOCTYPE html>[\s\S]*</html>", text, re.IGNORECASE)
    if html_match:
        text = html_match.group(0).strip()
    else:
        body_match = re.search(r"<html[\s\S]*</html>", text, re.IGNORECASE)
        if body_match:
            text = "<!DOCTYPE html>\n" + body_match.group(0).strip()
        else:
            start = re.search(r"<html[\s\S]*", text, re.IGNORECASE)
            if start:
                text = "<!DOCTYPE html>\n" + start.group(0).strip()

    if "</body>" not in text.lower() and "<body" in text.lower():
        text = f"{text}\n</body>"
    if "</html>" not in text.lower() and "<html" in text.lower():
        text = f"{text}\n</html>"

    lower = text.lower()
    if "<html" not in lower or "</html>" not in lower:
        return None
    if "<body" not in lower:
        text = re.sub(r"(<html[^>]*>)", r"\1<body>", text, count=1, flags=re.IGNORECASE)
        if "</body>" not in text.lower():
            text = text.replace("</html>", "</body></html>", 1)

    return text


async def _run_precompute_job(job_id: str, batch_size: int, only_missing: bool, force_refresh: bool):
    started_at = datetime.now(timezone.utc)
    logger.info(
        "precompute_job[%s] started batch_size=%s only_missing=%s force_refresh=%s",
        job_id,
        batch_size,
        only_missing,
        force_refresh,
    )
    processed = 0
    from_n8n = 0
    from_fallback = 0
    errors = 0
    round_skip = 0

    while True:
        if PRECOMPUTE_CANCEL_FLAGS.get(job_id):
            break

        filters: dict = {"active": True}

        if only_missing and not force_refresh:
            cached_rows = await ai_analysis_collection.find({}, {"shop_id": 1, "_id": 0}).to_list(length=None)
            cached_shop_ids = [row.get("shop_id") for row in cached_rows if row.get("shop_id")]
            if cached_shop_ids:
                current_id_filter = filters.get("_id")
                if isinstance(current_id_filter, dict):
                    current_id_filter["$nin"] = cached_shop_ids
                else:
                    filters["_id"] = {"$nin": cached_shop_ids}

        total_candidates = await shops_collection.count_documents(filters)
        current_skip = 0 if (only_missing and not force_refresh) else round_skip
        cursor = (
            shops_collection.find(filters, {"_id": 1, "osm.id": 1})
            .sort("_id", 1)
            .skip(current_skip)
            .limit(batch_size)
        )

        round_processed = 0
        async for row in cursor:
            if PRECOMPUTE_CANCEL_FLAGS.get(job_id):
                break

            shop_id = row.get("_id")
            if not shop_id:
                continue

            osm_id = ((row.get("osm") or {}).get("id"))
            try:
                payload = await _compute_ai_payload(shop_id, osm_id)
                await _save_ai_analysis_cache(shop_id, osm_id, payload)
                processed += 1
                round_processed += 1
                if payload.get("source") == "n8n":
                    from_n8n += 1
                else:
                    from_fallback += 1
                if processed % PRECOMPUTE_PROGRESS_EVERY == 0:
                    logger.info(
                        "precompute_job[%s] progress processed=%s n8n=%s fallback=%s errors=%s total_candidates=%s",
                        job_id,
                        processed,
                        from_n8n,
                        from_fallback,
                        errors,
                        total_candidates,
                    )
            except Exception:
                errors += 1

            await precompute_jobs_collection.update_one(
                {"job_id": job_id},
                {
                    "$set": {
                        "status": "running",
                        "processed": processed,
                        "total_candidates": max(total_candidates, processed),
                        "source_breakdown": {"n8n": from_n8n, "fallback": from_fallback},
                        "errors": errors,
                        "updated_at": datetime.now(timezone.utc),
                    }
                },
            )

        if round_processed == 0:
            break

        if not (only_missing and not force_refresh):
            round_skip += batch_size

    final_status = "cancelled" if PRECOMPUTE_CANCEL_FLAGS.get(job_id) else "completed"
    elapsed_seconds = (datetime.now(timezone.utc) - started_at).total_seconds()
    logger.info(
        "precompute_job[%s] finished status=%s processed=%s n8n=%s fallback=%s errors=%s elapsed_seconds=%.2f",
        job_id,
        final_status,
        processed,
        from_n8n,
        from_fallback,
        errors,
        elapsed_seconds,
    )
    await precompute_jobs_collection.update_one(
        {"job_id": job_id},
        {
            "$set": {
                "status": final_status,
                "processed": processed,
                "source_breakdown": {"n8n": from_n8n, "fallback": from_fallback},
                "errors": errors,
                "updated_at": datetime.now(timezone.utc),
                "finished_at": datetime.now(timezone.utc),
            }
        },
    )
    PRECOMPUTE_CANCEL_FLAGS.pop(job_id, None)


async def _run_web_generation_job(job_id: str, batch_size: int, only_missing_website: bool):
    started_at = datetime.now(timezone.utc)
    logger.info(
        "web_generation_job[%s] started batch_size=%s only_missing_website=%s",
        job_id,
        batch_size,
        only_missing_website,
    )

    queued = 0
    errors = 0
    processed = 0
    round_skip = 0

    while True:
        if WEB_GENERATION_CANCEL_FLAGS.get(job_id):
            break

        filters: dict = {"active": True}

        total_candidates = await shops_collection.count_documents(filters)
        cursor = (
            shops_collection.find(filters, {"_id": 1, "osm.id": 1, "tags": 1, "osm.tags": 1})
            .sort("_id", 1)
            .skip(round_skip)
            .limit(batch_size)
        )

        round_processed = 0
        async for shop in cursor:
            if WEB_GENERATION_CANCEL_FLAGS.get(job_id):
                break

            shop_id = str(shop.get("_id") or "").strip()
            if not shop_id:
                continue

            if only_missing_website and _has_website(shop):
                continue

            request_id = str(uuid4())
            now = datetime.now(timezone.utc)
            try:
                await web_requests_collection.insert_one(
                    {
                        "request_id": request_id,
                        "shop_id": shop_id,
                        "status": "queued",
                        "created_at": now,
                        "updated_at": now,
                    }
                )
                asyncio.create_task(_run_shop_web_request(request_id, shop_id, shop))
                queued += 1
            except Exception:
                errors += 1

            processed += 1
            round_processed += 1
            if processed % WEB_GENERATION_PROGRESS_EVERY == 0:
                logger.info(
                    "web_generation_job[%s] progress processed=%s queued=%s errors=%s total_candidates=%s",
                    job_id,
                    processed,
                    queued,
                    errors,
                    total_candidates,
                )

            await web_generation_jobs_collection.update_one(
                {"job_id": job_id},
                {
                    "$set": {
                        "status": "running",
                        "processed": processed,
                        "queued": queued,
                        "errors": errors,
                        "total_candidates": total_candidates,
                        "updated_at": datetime.now(timezone.utc),
                    }
                },
            )

        if round_processed == 0:
            break

        round_skip += batch_size

    final_status = "cancelled" if WEB_GENERATION_CANCEL_FLAGS.get(job_id) else "completed"
    elapsed_seconds = (datetime.now(timezone.utc) - started_at).total_seconds()
    logger.info(
        "web_generation_job[%s] finished status=%s processed=%s queued=%s errors=%s elapsed_seconds=%.2f",
        job_id,
        final_status,
        processed,
        queued,
        errors,
        elapsed_seconds,
    )
    await web_generation_jobs_collection.update_one(
        {"job_id": job_id},
        {
            "$set": {
                "status": final_status,
                "processed": processed,
                "queued": queued,
                "errors": errors,
                "updated_at": datetime.now(timezone.utc),
                "finished_at": datetime.now(timezone.utc),
            }
        },
    )
    WEB_GENERATION_CANCEL_FLAGS.pop(job_id, None)


def _score_breakdown_from_tags(tags: dict) -> list[dict]:
    has_website = any(tags.get(key) for key in ["website", "contact:website", "brand:website"])
    has_phone = any(tags.get(key) for key in ["phone", "contact:phone", "brand:phone"])
    has_email = any(tags.get(key) for key in ["email", "contact:email", "brand:email"])
    has_social = any(
        tags.get(key)
        for key in [
            "contact:facebook",
            "facebook",
            "contact:instagram",
            "instagram",
            "contact:linkedin",
            "linkedin",
            "contact:twitter",
            "twitter",
            "contact:tiktok",
            "tiktok",
        ]
    )
    has_opening_hours = bool(tags.get("opening_hours"))
    has_delivery = tags.get("delivery") == "yes" or tags.get("takeaway") == "yes"
    has_payment = any(
        tags.get(key) == "yes"
        for key in [
            "payment:cards",
            "cards",
            "payment:credit_cards",
            "credit_cards",
            "payment:debit_cards",
            "debit_cards",
            "payment:contactless",
            "contactless",
        ]
    )
    has_accessibility = tags.get("wheelchair") in {"yes", "limited"}
    has_brand = bool(tags.get("brand") or tags.get("operator"))
    has_address = bool(tags.get("addr:street") and (tags.get("addr:housenumber") or tags.get("addr:postcode")))

    raw_items = [
        {
            "label": "Presencia digital",
            "points": (20 if has_website else 0)
            + (12 if has_phone else 0)
            + (8 if has_email else 0)
            + (8 if has_social else 0),
            "max_points": 48,
            "detail": "Web, telefono, email y redes sociales del negocio.",
        },
        {
            "label": "Operacion y servicio",
            "points": (10 if has_opening_hours else 0)
            + (8 if has_delivery else 0)
            + (6 if has_payment else 0)
            + (3 if has_accessibility else 0),
            "max_points": 27,
            "detail": "Horario, opciones de entrega, metodos de pago y accesibilidad.",
        },
        {
            "label": "Identidad y confianza",
            "points": (8 if has_brand else 0) + (8 if has_address else 0),
            "max_points": 16,
            "detail": "Marca u operador y direccion estructurada de la ficha.",
        },
        {
            "label": "Completitud de ficha",
            "points": 10 + min(19, len(tags)),
            "max_points": 29,
            "detail": "Base del modelo y riqueza de metadatos disponibles en OSM.",
        },
    ]

    raw_total = sum(item["points"] for item in raw_items)
    capped_total = max(0, min(100, raw_total))
    if raw_total <= 0:
        return [
            {
                **item,
                "points": 0,
            }
            for item in raw_items
        ]

    scaled_points: list[int] = []
    for item in raw_items:
        scaled_points.append(int(round((item["points"] / raw_total) * capped_total)))

    delta = capped_total - sum(scaled_points)
    if delta != 0:
        scaled_points[0] = max(0, min(raw_items[0]["max_points"], scaled_points[0] + delta))

    breakdown = []
    for index, item in enumerate(raw_items):
        breakdown.append(
            {
                "label": item["label"],
                "points": scaled_points[index],
                "max_points": item["max_points"],
                "detail": item["detail"],
            }
        )

    return breakdown


@router.post("/ingesta")
async def ingesta_shops():
    started_at = datetime.now(timezone.utc)
    run_id = f"run-{started_at.strftime('%Y%m%d%H%M%S')}"

    data, query = fetch_overpass_shops()
    elements = data.get("elements", [])
    query_hash = sha256(query.encode("utf-8")).hexdigest()

    await ingesta_runs_collection.insert_one(
        {
            "_id": run_id,
            "source": "overpass",
            "status": "running",
            "started_at": started_at.isoformat(),
            "query": query,
            "query_hash": query_hash,
            "total_elements": len(elements),
        }
    )

    upserted = 0
    skipped = 0
    errors = 0
    ingested_at = datetime.now(timezone.utc).isoformat()

    # Mark existing records inactive; current ingestion reactivates matching rows.
    await shops_collection.update_many({}, {"$set": {"active": False}})

    normalized_docs = []

    for el in elements:
        tags = el.get("tags", {})
        if not any(key in tags for key in ["shop", "amenity", "office", "craft"]):
            skipped += 1
            continue

        normalized = normalize_element(el, ingested_at=ingested_at, run_id=run_id)
        if not normalized:
            skipped += 1
            continue

        normalized_docs.append(normalized)

    category_scores: dict[str, list[int]] = {}
    for doc in normalized_docs:
        category = doc.get("category", "Otros")
        category_scores.setdefault(category, []).append(int(doc.get("score", 0)))

    category_benchmark: dict[str, int] = {}
    for category, scores in category_scores.items():
        ordered = sorted(scores)
        if not ordered:
            category_benchmark[category] = 0
            continue
        p75_index = max(0, min(len(ordered) - 1, int(round((len(ordered) - 1) * 0.75))))
        category_benchmark[category] = ordered[p75_index]

    for normalized in normalized_docs:
        category = normalized.get("category", "Otros")
        benchmark = category_benchmark.get(category, 100)
        score = int(normalized.get("score", 0))
        normalized["gap"] = max(0, benchmark - score)

        try:
            await shops_collection.update_one(
                {"_id": normalized["_id"]},
                {
                    "$set": {
                        **normalized,
                        "last_seen_at": ingested_at,
                    },
                    "$setOnInsert": {
                        "first_seen_at": ingested_at,
                    },
                },
                upsert=True,
            )
            upserted += 1
        except Exception:
            errors += 1

    finished_at = datetime.now(timezone.utc).isoformat()
    await ingesta_runs_collection.update_one(
        {"_id": run_id},
        {
            "$set": {
                "status": "completed",
                "finished_at": finished_at,
                "upserted": upserted,
                "skipped": skipped,
                "errors": errors,
                "ingested_at": ingested_at,
            }
        },
    )

    return {
        "status": "ok",
        "run_id": run_id,
        "ingested_at": ingested_at,
        "upsertados": upserted,
        "omitidos": skipped,
        "errores": errors,
        "total_recibidos": len(elements),
    }


@router.get("/ingesta/runs")
async def list_ingesta_runs(
    limit: int = Query(default=20, ge=1, le=200),
    skip: int = Query(default=0, ge=0),
):
    cursor = (
        ingesta_runs_collection.find(
            {},
            {
                "query": 0,
            },
        )
        .sort("started_at", -1)
        .skip(skip)
        .limit(limit)
    )
    runs = await cursor.to_list(length=limit)
    total = await ingesta_runs_collection.count_documents({})

    return {
        "total": total,
        "limit": limit,
        "skip": skip,
        "runs": runs,
    }

@router.get("/reviews-test")
async def reviews_test():

    reviews = []

    cursor = shop_reviews_collection.find()

    async for doc in cursor:

        reviews.append({
            "shop_id": doc.get("shop_id"),
            "rating": doc.get("rating"),
            "user_ratings_total": doc.get("user_ratings_total"),
            "reviews": doc.get("reviews", [])
        })

    return {
        "total": len(reviews),
        "data": reviews
    }

@router.get("/shops")
async def list_shops(
    barrio: str | None = None,
    category: str | None = None,
    min_score: int = Query(default=0, ge=0, le=100),
    limit: int = Query(default=50, ge=1, le=5000),
    skip: int = Query(default=0, ge=0),
    active_only: bool = Query(default=True),
    south: float | None = None,
    west: float | None = None,
    north: float | None = None,
    east: float | None = None,
):
    filters = {"score": {"$gte": min_score}}

    if active_only:
        filters["active"] = True

    if barrio:
        filters["barrio.name"] = barrio
    if category:
        filters["category"] = category
    if None not in (south, west, north, east):
        filters["location"] = {
            "$geoWithin": {
                "$box": [[west, south], [east, north]],
            }
        }

    cursor = (
        shops_collection.find(filters)
        .sort("score", 1)
        .skip(skip)
        .limit(limit)
    )
    shops = await cursor.to_list(length=limit)
    total = await shops_collection.count_documents(filters)

    for shop in shops:
        shop["has_website"] = _has_website(shop)
        osm = shop.get("osm")
        if isinstance(osm, dict):
            osm.pop("tags", None)

    return {
        "total": total,
        "limit": limit,
        "skip": skip,
        "filters": {
            "barrio": barrio,
            "category": category,
            "min_score": min_score,
            "active_only": active_only,
        },
        "shops": shops,
    }

@router.post("/google-reviews-sync/{limit}")
async def google_reviews_sync(limit: int = 100):

    processed = 0
    skipped = 0
    duplicates = 0
    invalid_coords = 0
    google_failures = 0
    errors = 0

    cursor = shops_collection.aggregate([
        {
            "$match": {
                "$or": [
                    {"reviews_sync_attempted": {"$exists": False}},
                    {"reviews_sync_attempted": False}
                ]
            }
        },
        {
            "$sample": {
                "size": limit
            }
        }
    ])

    async for shop in cursor:

        print(f"Procesando shop_id={shop['_id']} - {shop.get('name')}")

        try:

            # COORDENADAS DE NEGOCIO
            location = shop.get("location", {})
            coords = location.get("coordinates", [])

            if len(coords) != 2:
                invalid_coords += 1
                skipped += 1
                await shops_collection.update_one(
                    {"_id": shop["_id"]},
                    {"$set": {"reviews_sync_attempted": True}}
                )
                continue

            lon, lat = coords

            # CONFIG DE REINTENTOS Y MAXIMO DE INTENTOS
            MAX_REVIEWS = 5
            MAX_ATTEMPTS = 3

            all_reviews = []
            attempts = 0
            used_place_ids = set()
            google_data = None

            while len(all_reviews) < MAX_REVIEWS and attempts < MAX_ATTEMPTS:

                attempts += 1

                google_data = await fetch_google_reviews(
                    shop.get("name", ""),
                    lat,
                    lon
                )

                if not google_data:
                    google_failures += 1
                    continue

                place_id = google_data["place_id"]

                # evitar repetir mismo lugar si ya aparecio en intentos anteriores
                if place_id in used_place_ids:
                    continue

                used_place_ids.add(place_id)

                # FILTRO REVIEWS
                filtered_reviews = [
                    r for r in google_data.get("reviews", [])
                    if r.get("text")
                    and r["text"].strip()
                    and r.get("rating", 0) < 3
                ]

                all_reviews.extend(filtered_reviews)

                all_reviews = all_reviews[:MAX_REVIEWS]

            # si no hay reviews útiles
            if len(all_reviews) == 0:
                skipped += 1
                await shops_collection.update_one(
                    {"_id": shop["_id"]},
                    {"$set": {"reviews_sync_attempted": True}}
                )
                continue

            # EXISTE EN MONGO
            existing = await shop_reviews_collection.find_one({
                "shop_id": shop["_id"]
            })

            if existing:

                duplicates += 1

                old_reviews = existing.get("reviews", [])

                # MERGE REVIEWS
                combined = old_reviews + all_reviews

                seen = set()
                merged_reviews = []

                for r in combined:
                    text = r.get("text", "").strip()

                    if not text:
                        continue

                    if text in seen:
                        continue

                    seen.add(text)
                    merged_reviews.append(r)

                await shop_reviews_collection.update_one(
                    {"shop_id": shop["_id"]},
                    {
                        "$set": {
                            "reviews": merged_reviews,
                            "google_place_id": google_data["place_id"] if google_data else None,
                            "rating": google_data["rating"] if google_data else None,
                            "user_ratings_total": google_data["user_ratings_total"] if google_data else None
                        }
                    }
                )

                print("Actualizado shop_id=", shop["_id"])

            else:

                await shop_reviews_collection.insert_one({
                    "shop_id": shop["_id"],
                    "google_place_id": google_data["place_id"],
                    "rating": google_data["rating"],
                    "user_ratings_total": google_data["user_ratings_total"],
                    "reviews": all_reviews
                })

                print("Insertado en shop_id=", shop["_id"])

            # MARCAR COMO PROCESADO CORRECTAMENTE
            await shops_collection.update_one(
                {"_id": shop["_id"]},
                {"$set": {"reviews_synced": True, "reviews_sync_attempted": True}}
            )

            processed += 1

        except Exception as e:
            print("ERROR:", e)
            errors += 1
            await shops_collection.update_one(
                {"_id": shop["_id"]},
                {"$set": {"reviews_sync_attempted": True}}
            )

    return {
        "processed": processed,
        "skipped": skipped,
        "duplicates": duplicates,
        "invalid_coords": invalid_coords,
        "google_failures": google_failures,
        "errors": errors
    }

@router.get("/test-google")
async def test_google():

    data = await fetch_google_reviews(
        "Moeve",
        36.845861,
        -2.450111
    )

    return data

@router.get("/shops/id/{shop_id}")
async def get_shop_by_id(shop_id: str):
    shop = await _find_active_shop_by_id(shop_id)
    if not shop:
        raise HTTPException(status_code=404, detail="Negocio no encontrado")
    shop["has_website"] = _has_website(shop)
    osm = shop.get("osm")
    if isinstance(osm, dict):
        osm.pop("tags", None)
    return shop


@router.get("/shops/id/{shop_id}/detail")
async def get_shop_detail(shop_id: str):
    shop = await _find_active_shop_by_id(shop_id)
    if not shop:
        raise HTTPException(status_code=404, detail="Negocio no encontrado")

    canonical_shop_id = str(shop.get("_id") or shop_id)

    shop_reviews_doc = await shop_reviews_collection.find_one(
        {"shop_id": canonical_shop_id},
        {"_id": 0, "reviews": 1, "user_ratings_total": 1},
    )
    comments = []
    reviews_total = int(shop.get("reviews", 0) or 0)
    if shop_reviews_doc:
        reviews_list = shop_reviews_doc.get("reviews")
        if isinstance(reviews_list, list):
            reviews_total = len(reviews_list)

        comments = [
            {
                "text": review.get("text", ""),
                "rating": review.get("rating"),
                "author": review.get("author_name"),
                "relative_time": review.get("relative_time_description"),
            }
            for review in shop_reviews_doc.get("reviews", [])
            if isinstance(review, dict) and review.get("text")
        ]

    shop["reviews"] = reviews_total

    tags = ((shop.get("osm") or {}).get("tags")) or {}

    score = int(shop.get("score", 0))
    category = shop.get("category")
    barrio_name = ((shop.get("barrio") or {}).get("name"))

    category_scores_cursor = shops_collection.find(
        {"active": True, "category": category}, {"score": 1, "_id": 0}
    )
    category_scores_docs = await category_scores_cursor.to_list(length=10000)
    category_scores = sorted(int(item.get("score", 0)) for item in category_scores_docs)

    if category_scores:
        p75_index = max(0, min(len(category_scores) - 1, int(round((len(category_scores) - 1) * 0.75))))
        top_quartile = category_scores[p75_index]
    else:
        top_quartile = max(0, score)

    neighborhood_avg = score
    if barrio_name:
        neighborhood_pipeline = [
            {"$match": {"active": True, "barrio.name": barrio_name}},
            {"$group": {"_id": None, "avgScore": {"$avg": "$score"}}},
        ]
        neighborhood_avg_rows = await shops_collection.aggregate(neighborhood_pipeline).to_list(length=1)
        if neighborhood_avg_rows:
            neighborhood_avg = int(round(float(neighborhood_avg_rows[0].get("avgScore", score))))

    total_in_category = len(category_scores)
    below_or_equal = sum(1 for item_score in category_scores if item_score <= score)
    percentile = int(round((below_or_equal / total_in_category) * 100)) if total_in_category > 0 else 0

    recommendations: list[str] = []
    if score < 40:
        recommendations.append("Completa ficha digital basica: web, telefono y horario.")
    if score < 60:
        recommendations.append("Mejora consistencia en perfiles y activa publicaciones semanales.")

    shop["has_website"] = _has_website(shop)
    osm = shop.get("osm")
    if isinstance(osm, dict):
        osm.pop("tags", None)
    if neighborhood_avg > score:
        recommendations.append("Prioriza acciones para cerrar la brecha frente a tu barrio.")
    if top_quartile > score:
        recommendations.append("Replica practicas del top sector: horarios detallados y contacto completo.")
    if not recommendations:
        recommendations.append("Mantiene posicion competitiva; optimiza conversion y fidelizacion local.")

    benchmark = {
        "percentile": max(0, min(100, percentile)),
        "neighborhoodAvg": max(0, min(100, neighborhood_avg)),
        "topQuartile": max(0, min(100, top_quartile)),
    }

    score_breakdown = _score_breakdown_from_tags(tags)

    return {
        "business": shop,
        "benchmark": benchmark,
        "recommendations": recommendations,
        "comments": comments,
        "score_breakdown": score_breakdown,
    }


@router.post("/shops/id/{shop_id}/ai-analysis")
async def analyze_shop_with_n8n(shop_id: str, force_refresh: bool = Query(default=False)):
    shop = await _find_active_shop_by_id(shop_id)
    if not shop:
        raise HTTPException(status_code=404, detail="Negocio no encontrado")

    osm_id = ((shop.get("osm") or {}).get("id"))
    if not force_refresh:
        cached = await ai_analysis_collection.find_one({"shop_id": shop_id}, {"_id": 0})
        if cached and cached.get("payload"):
            payload = cached["payload"]
            return {
                "shop_id": shop_id,
                "osm_id": osm_id,
                "cached": True,
                "cached_at": cached.get("updated_at"),
                **payload,
            }

    payload = await _compute_ai_payload(shop_id, osm_id)
    await _save_ai_analysis_cache(shop_id, osm_id, payload)

    return {
        "shop_id": shop_id,
        "osm_id": osm_id,
        "cached": False,
        **payload,
    }


@router.post("/shops/id/{shop_id}/web-request")
async def create_shop_web_request(shop_id: str):
    shop = await _find_active_shop_by_id(shop_id)
    if not shop:
        raise HTTPException(status_code=404, detail="Negocio no encontrado")

    request_id = str(uuid4())
    now = datetime.now(timezone.utc)
    await web_requests_collection.insert_one(
        {
            "request_id": request_id,
            "shop_id": shop_id,
            "status": "queued",
            "created_at": now,
            "updated_at": now,
        }
    )

    asyncio.create_task(_run_shop_web_request(request_id, shop_id, shop))
    return {
        "status": "queued",
        "shop_id": shop_id,
        "request_id": request_id,
        "queued_at": now,
    }


@router.get("/shops/id/{shop_id}/web-request/latest")
async def get_latest_shop_web_request(shop_id: str):
    shop_id_values = _shop_id_candidates(shop_id)
    row = await web_requests_collection.find_one(
        {"shop_id": {"$in": shop_id_values}},
        {"_id": 0},
        sort=[("created_at", -1)],
    )
    if not row:
        raise HTTPException(status_code=404, detail="No hay solicitudes de web para este negocio")
    return row


@router.get("/shops/id/{shop_id}/web-page/latest")
async def get_latest_shop_web_page(shop_id: str):
    shop_id_values = _shop_id_candidates(shop_id)
    row = await shop_web_pages_collection.find_one(
        {"shop_id": {"$in": shop_id_values}},
        {"_id": 0},
        sort=[("updated_at", -1)],
    )
    if not row:
        raise HTTPException(status_code=404, detail="No hay web generada para este negocio")

    html = _normalize_html_document(row.get("html") if isinstance(row.get("html"), str) else None)
    return {
        "shop_id": row.get("shop_id", shop_id),
        "status": row.get("status", "unknown"),
        "request_id": row.get("request_id"),
        "updated_at": row.get("updated_at"),
        "has_html": isinstance(html, str) and bool(html.strip()),
        "html": html if isinstance(html, str) else None,
        "error": row.get("error"),
    }


@router.post("/shops/id/{shop_id}/ai-analysis/precompute")
async def precompute_shop_ai_analysis(shop_id: str):
    shop = await _find_active_shop_by_id(shop_id)
    if not shop:
        raise HTTPException(status_code=404, detail="Negocio no encontrado")

    osm_id = ((shop.get("osm") or {}).get("id"))
    payload = await _compute_ai_payload(shop_id, osm_id)
    await _save_ai_analysis_cache(shop_id, osm_id, payload)

    return {
        "status": "ok",
        "shop_id": shop_id,
        "osm_id": osm_id,
        "source": payload.get("source"),
    }


@router.post("/shops/ai-analysis/precompute-all")
async def precompute_all_ai_analysis(
    limit: int = Query(default=0, ge=0, le=200000),
    skip: int = Query(default=0, ge=0),
    only_missing: bool = Query(default=True),
    force_refresh: bool = Query(default=False),
):
    started_at = datetime.now(timezone.utc)
    logger.info(
        "precompute_all started limit=%s skip=%s only_missing=%s force_refresh=%s",
        limit,
        skip,
        only_missing,
        force_refresh,
    )
    filters: dict = {"active": True}

    if only_missing and not force_refresh:
        cached_rows = await ai_analysis_collection.find({}, {"shop_id": 1, "_id": 0}).to_list(length=None)
        cached_shop_ids = [row.get("shop_id") for row in cached_rows if row.get("shop_id")]
        if cached_shop_ids:
            current_id_filter = filters.get("_id")
            if isinstance(current_id_filter, dict):
                current_id_filter["$nin"] = cached_shop_ids
            else:
                filters["_id"] = {"$nin": cached_shop_ids}

    total_candidates = await shops_collection.count_documents(filters)

    cursor = shops_collection.find(filters, {"_id": 1, "osm.id": 1}).sort("_id", 1).skip(skip)
    if limit > 0:
        cursor = cursor.limit(limit)

    processed = 0
    from_n8n = 0
    from_fallback = 0
    errors = 0
    error_items: list[dict] = []

    async for row in cursor:
        shop_id = row.get("_id")
        if not shop_id:
            continue

        osm_id = ((row.get("osm") or {}).get("id"))
        try:
            payload = await _compute_ai_payload(shop_id, osm_id)
            await _save_ai_analysis_cache(shop_id, osm_id, payload)
            processed += 1
            if payload.get("source") == "n8n":
                from_n8n += 1
            else:
                from_fallback += 1
            if processed % PRECOMPUTE_PROGRESS_EVERY == 0:
                logger.info(
                    "precompute_all progress processed=%s n8n=%s fallback=%s errors=%s total_candidates=%s",
                    processed,
                    from_n8n,
                    from_fallback,
                    errors,
                    total_candidates,
                )
        except Exception as exc:
            errors += 1
            if len(error_items) < 25:
                error_items.append({"shop_id": shop_id, "error": str(exc)})

    elapsed_seconds = (datetime.now(timezone.utc) - started_at).total_seconds()
    logger.info(
        "precompute_all finished processed=%s n8n=%s fallback=%s errors=%s total_candidates=%s elapsed_seconds=%.2f",
        processed,
        from_n8n,
        from_fallback,
        errors,
        total_candidates,
        elapsed_seconds,
    )

    return {
        "status": "ok",
        "total_candidates": total_candidates,
        "processed": processed,
        "source_breakdown": {
            "n8n": from_n8n,
            "fallback": from_fallback,
        },
        "errors": errors,
        "error_items": error_items,
        "params": {
            "limit": limit,
            "skip": skip,
            "only_missing": only_missing,
            "force_refresh": force_refresh,
        },
    }


@router.post("/shops/ai-analysis/precompute-job/start")
async def start_precompute_job(
    batch_size: int = Query(default=25, ge=1, le=500),
    only_missing: bool = Query(default=True),
    force_refresh: bool = Query(default=False),
):
    active_job = await precompute_jobs_collection.find_one(
        {"status": "running"},
        {"_id": 0, "job_id": 1, "updated_at": 1},
        sort=[("created_at", -1)],
    )
    if active_job:
        updated_at = _to_utc_aware(active_job.get("updated_at"))
        stale = False
        if updated_at is not None:
            stale = datetime.now(timezone.utc) - updated_at > timedelta(minutes=12)
        else:
            stale = True

        if not stale:
            return {"status": "already_running", "job_id": active_job.get("job_id")}

        stale_job_id = str(active_job.get("job_id") or "")
        await precompute_jobs_collection.update_one(
            {"job_id": stale_job_id},
            {
                "$set": {
                    "status": "cancelled",
                    "updated_at": datetime.now(timezone.utc),
                    "finished_at": datetime.now(timezone.utc),
                    "stale_closed": True,
                }
            },
        )
        PRECOMPUTE_CANCEL_FLAGS.pop(stale_job_id, None)

    job_id = str(uuid4())
    now = datetime.now(timezone.utc)
    await precompute_jobs_collection.insert_one(
        {
            "job_id": job_id,
            "status": "running",
            "processed": 0,
            "total_candidates": 0,
            "source_breakdown": {"n8n": 0, "fallback": 0},
            "errors": 0,
            "params": {
                "batch_size": batch_size,
                "only_missing": only_missing,
                "force_refresh": force_refresh,
            },
            "created_at": now,
            "updated_at": now,
        }
    )

    PRECOMPUTE_CANCEL_FLAGS[job_id] = False
    asyncio.create_task(_run_precompute_job(job_id, batch_size, only_missing, force_refresh))
    return {"status": "started", "job_id": job_id}


@router.get("/shops/ai-analysis/precompute-job/status")
async def get_precompute_job_status(job_id: str | None = None):
    query = {"job_id": job_id} if job_id else {}
    sort = None if job_id else [("created_at", -1)]
    job = await precompute_jobs_collection.find_one(query, {"_id": 0}, sort=sort)
    if not job:
        raise HTTPException(status_code=404, detail="No hay job de precompute")

    if job.get("status") == "cancelling":
        updated_at = _to_utc_aware(job.get("updated_at"))
        stale = False
        if updated_at is not None:
            stale = datetime.now(timezone.utc) - updated_at > timedelta(seconds=45)
        else:
            stale = True

        if stale:
            await precompute_jobs_collection.update_one(
                {"job_id": job.get("job_id")},
                {
                    "$set": {
                        "status": "cancelled",
                        "finished_at": datetime.now(timezone.utc),
                        "updated_at": datetime.now(timezone.utc),
                    }
                },
            )
            PRECOMPUTE_CANCEL_FLAGS.pop(str(job.get("job_id") or ""), None)
            job["status"] = "cancelled"
            job["finished_at"] = datetime.now(timezone.utc)
            job["updated_at"] = datetime.now(timezone.utc)

    return job


@router.post("/shops/ai-analysis/precompute-job/cancel")
async def cancel_precompute_job(job_id: str):
    PRECOMPUTE_CANCEL_FLAGS[job_id] = True
    result = await precompute_jobs_collection.update_one(
        {"job_id": job_id},
        {
            "$set": {
                "status": "cancelling",
                "updated_at": datetime.now(timezone.utc),
            }
        },
    )

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="job_id no encontrado")

    current = await precompute_jobs_collection.find_one({"job_id": job_id}, {"_id": 0, "status": 1})
    if (current or {}).get("status") not in {"running", "cancelling"}:
        await precompute_jobs_collection.update_one(
            {"job_id": job_id},
            {
                "$set": {
                    "status": "cancelled",
                    "finished_at": datetime.now(timezone.utc),
                    "updated_at": datetime.now(timezone.utc),
                }
            },
        )
        PRECOMPUTE_CANCEL_FLAGS.pop(job_id, None)
        return {"status": "cancelled", "job_id": job_id}

    return {"status": "cancelling", "job_id": job_id}


@router.post("/shops/web-generation-job/start")
async def start_web_generation_job(
    batch_size: int = Query(default=25, ge=1, le=500),
    only_missing_website: bool = Query(default=True),
):
    active_job = await web_generation_jobs_collection.find_one(
        {"status": "running"},
        {"_id": 0, "job_id": 1, "updated_at": 1},
        sort=[("created_at", -1)],
    )
    if active_job:
        updated_at = _to_utc_aware(active_job.get("updated_at"))
        stale = False
        if updated_at is not None:
            stale = datetime.now(timezone.utc) - updated_at > timedelta(minutes=12)
        else:
            stale = True

        if not stale:
            return {"status": "already_running", "job_id": active_job.get("job_id")}

        stale_job_id = str(active_job.get("job_id") or "")
        await web_generation_jobs_collection.update_one(
            {"job_id": stale_job_id},
            {
                "$set": {
                    "status": "cancelled",
                    "updated_at": datetime.now(timezone.utc),
                    "finished_at": datetime.now(timezone.utc),
                    "stale_closed": True,
                }
            },
        )
        WEB_GENERATION_CANCEL_FLAGS.pop(stale_job_id, None)

    job_id = str(uuid4())
    now = datetime.now(timezone.utc)
    await web_generation_jobs_collection.insert_one(
        {
            "job_id": job_id,
            "status": "running",
            "processed": 0,
            "queued": 0,
            "errors": 0,
            "total_candidates": 0,
            "params": {
                "batch_size": batch_size,
                "only_missing_website": only_missing_website,
            },
            "created_at": now,
            "updated_at": now,
        }
    )

    WEB_GENERATION_CANCEL_FLAGS[job_id] = False
    asyncio.create_task(_run_web_generation_job(job_id, batch_size, only_missing_website))
    return {"status": "started", "job_id": job_id}


@router.get("/shops/web-generation-job/status")
async def get_web_generation_job_status(job_id: str | None = None):
    query = {"job_id": job_id} if job_id else {}
    sort = None if job_id else [("created_at", -1)]
    job = await web_generation_jobs_collection.find_one(query, {"_id": 0}, sort=sort)
    if not job:
        raise HTTPException(status_code=404, detail="No hay job de generacion web")

    if job.get("status") == "cancelling":
        updated_at = _to_utc_aware(job.get("updated_at"))
        stale = False
        if updated_at is not None:
            stale = datetime.now(timezone.utc) - updated_at > timedelta(seconds=45)
        else:
            stale = True

        if stale:
            await web_generation_jobs_collection.update_one(
                {"job_id": job.get("job_id")},
                {
                    "$set": {
                        "status": "cancelled",
                        "finished_at": datetime.now(timezone.utc),
                        "updated_at": datetime.now(timezone.utc),
                    }
                },
            )
            WEB_GENERATION_CANCEL_FLAGS.pop(str(job.get("job_id") or ""), None)
            job["status"] = "cancelled"
            job["finished_at"] = datetime.now(timezone.utc)
            job["updated_at"] = datetime.now(timezone.utc)

    return job


@router.post("/shops/web-generation-job/cancel")
async def cancel_web_generation_job(job_id: str):
    WEB_GENERATION_CANCEL_FLAGS[job_id] = True
    result = await web_generation_jobs_collection.update_one(
        {"job_id": job_id},
        {
            "$set": {
                "status": "cancelling",
                "updated_at": datetime.now(timezone.utc),
            }
        },
    )

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="job_id no encontrado")

    current = await web_generation_jobs_collection.find_one({"job_id": job_id}, {"_id": 0, "status": 1})
    if (current or {}).get("status") not in {"running", "cancelling"}:
        await web_generation_jobs_collection.update_one(
            {"job_id": job_id},
            {
                "$set": {
                    "status": "cancelled",
                    "finished_at": datetime.now(timezone.utc),
                    "updated_at": datetime.now(timezone.utc),
                }
            },
        )
        WEB_GENERATION_CANCEL_FLAGS.pop(job_id, None)
        return {"status": "cancelled", "job_id": job_id}

    return {"status": "cancelling", "job_id": job_id}


@router.get("/shops/quality")
async def shops_quality_report():
    total = await shops_collection.count_documents({"active": True})

    if total == 0:
        return {
            "total_active": 0,
            "barrio_assignment": {
                "tag": {"count": 0, "pct": 0.0},
                "geojson": {"count": 0, "pct": 0.0},
                "none": {"count": 0, "pct": 0.0},
            },
            "without_barrio": 0,
            "top_barrios": [],
        }

    pipeline = [
        {"$match": {"active": True}},
        {
            "$group": {
                "_id": "$barrio.source",
                "count": {"$sum": 1},
            }
        },
    ]
    source_rows = await shops_collection.aggregate(pipeline).to_list(length=10)

    by_source = {"tag": 0, "geojson": 0, "none": 0}
    for row in source_rows:
        key = row.get("_id") or "none"
        if key not in by_source:
            by_source[key] = 0
        by_source[key] += row.get("count", 0)

    top_barrios_rows = await shops_collection.aggregate(
        [
            {"$match": {"active": True, "barrio.name": {"$ne": "Sin barrio"}}},
            {"$group": {"_id": "$barrio.name", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": 10},
        ]
    ).to_list(length=10)

    without_barrio = await shops_collection.count_documents(
        {"active": True, "barrio.name": "Sin barrio"}
    )

    def pct(value: int) -> float:
        return round((value / total) * 100, 2)

    return {
        "total_active": total,
        "barrio_assignment": {
            "tag": {"count": by_source.get("tag", 0), "pct": pct(by_source.get("tag", 0))},
            "geojson": {
                "count": by_source.get("geojson", 0),
                "pct": pct(by_source.get("geojson", 0)),
            },
            "none": {"count": by_source.get("none", 0), "pct": pct(by_source.get("none", 0))},
        },
        "without_barrio": without_barrio,
        "without_barrio_pct": pct(without_barrio),
        "top_barrios": [
            {"name": row.get("_id"), "count": row.get("count", 0)}
            for row in top_barrios_rows
        ],
    }


@router.get("/shops/quality/issues")
async def shops_quality_issues(
    limit: int = Query(default=50, ge=1, le=500),
):
    missing_barrio_filter = {
        "active": True,
        "$or": [
            {"barrio.name": "Sin barrio"},
            {"barrio.name": {"$exists": False}},
            {"barrio.name": None},
        ],
    }

    missing_name_filter = {
        "active": True,
        "$or": [
            {"name": {"$exists": False}},
            {"name": None},
            {"name": ""},
        ],
    }

    missing_location_filter = {
        "active": True,
        "$or": [
            {"location": {"$exists": False}},
            {"location.coordinates": {"$exists": False}},
        ],
    }

    missing_barrio_count = await shops_collection.count_documents(missing_barrio_filter)
    missing_name_count = await shops_collection.count_documents(missing_name_filter)
    missing_location_count = await shops_collection.count_documents(missing_location_filter)

    sample_projection = {
        "_id": 1,
        "name": 1,
        "category": 1,
        "subcategory": 1,
        "barrio": 1,
        "location": 1,
        "score": 1,
        "osm.id": 1,
        "osm.type": 1,
        "run_id": 1,
        "ingested_at": 1,
    }

    missing_barrio_samples = await shops_collection.find(
        missing_barrio_filter, sample_projection
    ).limit(limit).to_list(length=limit)

    missing_location_samples = await shops_collection.find(
        missing_location_filter, sample_projection
    ).limit(limit).to_list(length=limit)

    duplicate_name_location = await shops_collection.aggregate(
        [
            {"$match": {"active": True}},
            {
                "$group": {
                    "_id": {
                        "name": "$name",
                        "coordinates": "$location.coordinates",
                    },
                    "count": {"$sum": 1},
                    "ids": {"$push": "$_id"},
                }
            },
            {"$match": {"count": {"$gt": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": 20},
        ]
    ).to_list(length=20)

    return {
        "counts": {
            "missing_barrio": missing_barrio_count,
            "missing_name": missing_name_count,
            "missing_location": missing_location_count,
        },
        "samples": {
            "missing_barrio": missing_barrio_samples,
            "missing_location": missing_location_samples,
        },
        "possible_duplicates": [
            {
                "name": row.get("_id", {}).get("name"),
                "coordinates": row.get("_id", {}).get("coordinates"),
                "count": row.get("count", 0),
                "ids": row.get("ids", []),
            }
            for row in duplicate_name_location
        ],
    }


@router.post("/shops/repair-barrios")
async def repair_barrios(
    only_missing: bool = False,
    use_explicit_tags: bool = True,
    limit: int = Query(default=2000, ge=1, le=20000),
):
    filters = {"active": True, "location.coordinates": {"$exists": True}}
    if only_missing:
        filters["$or"] = [
            {"barrio.name": "Sin barrio"},
            {"barrio.name": {"$exists": False}},
            {"barrio.name": None},
        ]

    projection = {
        "_id": 1,
        "location.coordinates": 1,
        "osm.tags": 1,
        "barrio": 1,
    }

    docs = await shops_collection.find(filters, projection).limit(limit).to_list(length=limit)

    scanned = 0
    updated = 0
    unchanged = 0
    errors = 0

    for doc in docs:
        scanned += 1
        try:
            coords = ((doc.get("location") or {}).get("coordinates") or [None, None])
            lon = coords[0] if len(coords) > 0 else None
            lat = coords[1] if len(coords) > 1 else None
            tags = ((doc.get("osm") or {}).get("tags") or {})

            new_name, new_source = infer_barrio_name(
                lat=lat,
                lon=lon,
                tags=tags,
                use_explicit_tags=use_explicit_tags,
            )
            current = doc.get("barrio") or {}
            current_name = current.get("name")
            current_source = current.get("source")

            if current_name == new_name and current_source == new_source:
                unchanged += 1
                continue

            await shops_collection.update_one(
                {"_id": doc["_id"]},
                {
                    "$set": {
                        "barrio": {"name": new_name, "source": new_source},
                    }
                },
            )
            updated += 1
        except Exception:
            errors += 1

    return {
        "status": "ok",
        "only_missing": only_missing,
        "use_explicit_tags": use_explicit_tags,
        "scanned": scanned,
        "updated": updated,
        "unchanged": unchanged,
        "errors": errors,
        "limit": limit,
    }


@router.get("/barrios/status")
async def barrios_status():
    features = load_barrios_geojson()
    names: list[str] = []
    for feature in features:
        props = feature.get("properties") or {}
        name = props.get("name") or props.get("barrio")
        if isinstance(name, str) and name.strip():
            names.append(name.strip())

    unique_names = sorted(set(names))
    return {
        "features_count": len(features),
        "named_features_count": len(unique_names),
        "sample_names": unique_names[:20],
        "empty": len(features) == 0,
    }


@router.get("/barrios/point")
async def barrio_by_point(lat: float, lon: float):
    name, source = infer_barrio_name(lat=lat, lon=lon, tags={})
    return {
        "lat": lat,
        "lon": lon,
        "barrio": {
            "name": name,
            "source": source,
        },
    }


@router.get("/barrios/target-counts")
async def barrios_target_counts():
    target_names = [
        "Almeria",
        "Viator",
        "Huercal de Almeria",
        "Roquetas de Mar",
        "La Canada y El Alquian",
    ]

    rows = await shops_collection.aggregate(
        [
            {"$match": {"active": True, "barrio.name": {"$in": target_names}}},
            {"$group": {"_id": "$barrio.name", "count": {"$sum": 1}}},
        ]
    ).to_list(length=20)

    counts_map = {row.get("_id"): int(row.get("count", 0)) for row in rows}
    counts = [{"name": name, "count": counts_map.get(name, 0)} for name in target_names]

    return {
        "total_active": await shops_collection.count_documents({"active": True}),
        "counts": counts,
    }


@router.get("/barrios/sin-barrio-samples")
async def barrios_sin_barrio_samples(limit: int = Query(default=100, ge=1, le=1000)):
    filters = {
        "active": True,
        "$or": [
            {"barrio.name": "Sin barrio"},
            {"barrio.name": {"$exists": False}},
            {"barrio.name": None},
        ],
    }

    projection = {
        "_id": 1,
        "name": 1,
        "category": 1,
        "barrio": 1,
        "location.coordinates": 1,
    }

    rows = await shops_collection.find(filters, projection).limit(limit).to_list(length=limit)
    total = await shops_collection.count_documents(filters)

    samples = []
    for row in rows:
        coords = ((row.get("location") or {}).get("coordinates") or [None, None])
        lon = coords[0] if len(coords) > 0 else None
        lat = coords[1] if len(coords) > 1 else None
        samples.append(
            {
                "id": row.get("_id"),
                "name": row.get("name"),
                "category": row.get("category"),
                "barrio": (row.get("barrio") or {}).get("name"),
                "lat": lat,
                "lon": lon,
            }
        )

    return {
        "total": total,
        "limit": limit,
        "samples": samples,
    }
