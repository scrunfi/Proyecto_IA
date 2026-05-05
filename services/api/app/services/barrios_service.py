import json
import os
import warnings
from functools import lru_cache


def point_in_polygon(lon: float, lat: float, polygon: list[list[float]]) -> bool:
    inside = False
    j = len(polygon) - 1
    for i in range(len(polygon)):
        xi, yi = polygon[i]
        xj, yj = polygon[j]
        intersects = ((yi > lat) != (yj > lat)) and (
            lon < (xj - xi) * (lat - yi) / ((yj - yi) or 1e-12) + xi
        )
        if intersects:
            inside = not inside
        j = i
    return inside


@lru_cache(maxsize=1)
def load_barrios_geojson() -> list[dict]:
    path = os.getenv("BARRIOS_GEOJSON_PATH", "app/data/barrios.geojson")
    if not os.path.exists(path):
        warnings.warn(
            f"No existe el archivo de barrios GeoJSON en: {path}. Se usara 'Sin barrio'.",
            stacklevel=2,
        )
        return []

    with open(path, "r", encoding="utf-8") as file:
        data = json.load(file)

    features = data.get("features", [])
    if not features:
        warnings.warn(
            f"El GeoJSON de barrios ({path}) no contiene features. Se usara 'Sin barrio'.",
            stacklevel=2,
        )
    return features


def infer_barrio_name(lat: float | None, lon: float | None, tags: dict) -> tuple[str, str]:
    explicit = (
        tags.get("addr:suburb")
        or tags.get("addr:neighbourhood")
        or tags.get("is_in:suburb")
    )
    if explicit:
        return explicit, "tag"

    if lat is None or lon is None:
        return "Sin barrio", "none"

    features = load_barrios_geojson()
    for feature in features:
        props = feature.get("properties", {})
        geom = feature.get("geometry", {})
        geom_type = geom.get("type")
        coords = geom.get("coordinates", [])

        if geom_type == "Polygon":
            rings = coords
        elif geom_type == "MultiPolygon":
            rings = [ring for polygon in coords for ring in polygon]
        else:
            continue

        for ring in rings:
            if point_in_polygon(lon, lat, ring):
                name = props.get("name") or props.get("barrio") or "Sin barrio"
                return name, "geojson"

    return "Sin barrio", "none"
