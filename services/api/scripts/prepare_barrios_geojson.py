import argparse
import json
from pathlib import Path


def pick_name(properties: dict, keys: list[str]) -> str | None:
    for key in keys:
        value = properties.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Transform any GeoJSON into barrios.geojson compatible format"
    )
    parser.add_argument("input", help="Input GeoJSON path")
    parser.add_argument(
        "-o",
        "--output",
        default="app/data/barrios.geojson",
        help="Output path (default: app/data/barrios.geojson)",
    )
    parser.add_argument(
        "--name-keys",
        default="name,barrio,NOMBRE,NOM_BARRIO,neighbourhood,NAME",
        help="Comma-separated property keys to search for barrio name",
    )
    args = parser.parse_args()

    input_path = Path(args.input)
    output_path = Path(args.output)
    name_keys = [key.strip() for key in args.name_keys.split(",") if key.strip()]

    if not input_path.exists():
        print(f"ERROR: Input file not found: {input_path}")
        return 1

    with input_path.open("r", encoding="utf-8") as f:
        data = json.load(f)

    if data.get("type") != "FeatureCollection" or not isinstance(data.get("features"), list):
        print("ERROR: Input must be a GeoJSON FeatureCollection")
        return 1

    features_out: list[dict] = []
    dropped = 0

    for feature in data["features"]:
        if not isinstance(feature, dict):
            dropped += 1
            continue

        props = feature.get("properties") or {}
        geom = feature.get("geometry") or {}
        geom_type = geom.get("type")

        if geom_type not in {"Polygon", "MultiPolygon"}:
            dropped += 1
            continue

        name = pick_name(props, name_keys)
        if not name:
            dropped += 1
            continue

        features_out.append(
            {
                "type": "Feature",
                "properties": {"name": name},
                "geometry": {
                    "type": geom_type,
                    "coordinates": geom.get("coordinates", []),
                },
            }
        )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as f:
        json.dump({"type": "FeatureCollection", "features": features_out}, f, ensure_ascii=False, indent=2)

    print("=== Conversion summary ===")
    print(f"Input features: {len(data['features'])}")
    print(f"Output features: {len(features_out)}")
    print(f"Dropped features: {dropped}")
    print(f"Output file: {output_path}")
    if features_out:
        names = sorted({f['properties']['name'] for f in features_out})
        print("Sample barrios:", ", ".join(names[:10]))
    else:
        print("WARNING: Output is empty. Check --name-keys and input geometry types.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
