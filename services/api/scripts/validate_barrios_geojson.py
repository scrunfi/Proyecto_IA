import json
import os
import sys
from typing import Any


def validate_ring(ring: list[list[float]]) -> list[str]:
    issues: list[str] = []
    if len(ring) < 4:
        issues.append("ring with fewer than 4 points")
        return issues

    first = ring[0]
    last = ring[-1]
    if first != last:
        issues.append("ring not closed (first point != last point)")

    for idx, point in enumerate(ring):
        if not isinstance(point, list) or len(point) != 2:
            issues.append(f"invalid coordinate at index {idx}: expected [lon, lat]")
            continue
        lon, lat = point
        if not isinstance(lon, (int, float)) or not isinstance(lat, (int, float)):
            issues.append(f"non numeric coordinate at index {idx}")
            continue
        if not (-180 <= lon <= 180 and -90 <= lat <= 90):
            issues.append(f"out of range coordinate at index {idx}: [{lon}, {lat}]")

    return issues


def validate_feature(feature: dict[str, Any], idx: int) -> list[str]:
    issues: list[str] = []
    props = feature.get("properties") or {}
    geom = feature.get("geometry") or {}

    name = props.get("name") or props.get("barrio")
    if not isinstance(name, str) or not name.strip():
        issues.append(f"feature #{idx}: missing properties.name (or properties.barrio)")

    geom_type = geom.get("type")
    coords = geom.get("coordinates")

    if geom_type not in {"Polygon", "MultiPolygon"}:
        issues.append(f"feature #{idx}: geometry.type must be Polygon or MultiPolygon")
        return issues

    if not isinstance(coords, list):
        issues.append(f"feature #{idx}: geometry.coordinates must be a list")
        return issues

    if geom_type == "Polygon":
        if not coords:
            issues.append(f"feature #{idx}: Polygon without rings")
        for ring_i, ring in enumerate(coords):
            if not isinstance(ring, list):
                issues.append(f"feature #{idx}: ring #{ring_i} is not a list")
                continue
            ring_issues = validate_ring(ring)
            issues.extend([f"feature #{idx} ring #{ring_i}: {msg}" for msg in ring_issues])
    else:
        if not coords:
            issues.append(f"feature #{idx}: MultiPolygon without polygons")
        for poly_i, polygon in enumerate(coords):
            if not isinstance(polygon, list):
                issues.append(f"feature #{idx}: polygon #{poly_i} is not a list")
                continue
            if not polygon:
                issues.append(f"feature #{idx}: polygon #{poly_i} without rings")
            for ring_i, ring in enumerate(polygon):
                if not isinstance(ring, list):
                    issues.append(
                        f"feature #{idx}: polygon #{poly_i} ring #{ring_i} is not a list"
                    )
                    continue
                ring_issues = validate_ring(ring)
                issues.extend(
                    [
                        f"feature #{idx} polygon #{poly_i} ring #{ring_i}: {msg}"
                        for msg in ring_issues
                    ]
                )

    return issues


def main() -> int:
    path = (
        sys.argv[1]
        if len(sys.argv) > 1
        else os.getenv("BARRIOS_GEOJSON_PATH", os.path.join("app", "data", "barrios.geojson"))
    )

    if not os.path.exists(path):
        print(f"ERROR: file not found: {path}")
        return 1

    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    if data.get("type") != "FeatureCollection":
        print("ERROR: root.type must be FeatureCollection")
        return 1

    features = data.get("features")
    if not isinstance(features, list):
        print("ERROR: root.features must be a list")
        return 1

    if len(features) == 0:
        print("WARNING: features is empty. All businesses will become 'Sin barrio'.")
        return 2

    all_issues: list[str] = []
    for idx, feature in enumerate(features):
        if not isinstance(feature, dict):
            all_issues.append(f"feature #{idx}: not an object")
            continue
        all_issues.extend(validate_feature(feature, idx))

    names = []
    for feature in features:
        props = feature.get("properties") or {}
        name = props.get("name") or props.get("barrio")
        if isinstance(name, str) and name.strip():
            names.append(name.strip())

    unique_names = sorted(set(names))

    print("=== GeoJSON validation summary ===")
    print(f"File: {path}")
    print(f"Features: {len(features)}")
    print(f"Named features: {len(unique_names)}")
    print("Sample names:", ", ".join(unique_names[:10]) if unique_names else "(none)")

    if all_issues:
        print("\nIssues found:")
        for issue in all_issues[:200]:
            print(f"- {issue}")
        if len(all_issues) > 200:
            print(f"... and {len(all_issues) - 200} more")
        return 1

    print("\nOK: GeoJSON is structurally valid for barrio assignment.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
