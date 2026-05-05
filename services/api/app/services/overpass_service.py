import requests
import os


OVERPASS_URL = os.getenv("OVERPASS_API_URL", "https://overpass-api.de/api/interpreter")
OVERPASS_TIMEOUT = int(os.getenv("OVERPASS_TIMEOUT_SECONDS", "60"))
OVERPASS_USER_AGENT = os.getenv("OVERPASS_USER_AGENT", "ProyectoAlmeria/1.0")
OVERPASS_BBOX = os.getenv("OVERPASS_BBOX", "36.80,-2.52,36.88,-2.40")

def fetch_overpass_shops():
    south, west, north, east = [part.strip() for part in OVERPASS_BBOX.split(",")]

    query = """
    [out:json][timeout:50];
    (
      node["shop"](%s,%s,%s,%s);
      way["shop"](%s,%s,%s,%s);
      relation["shop"](%s,%s,%s,%s);
      node["amenity"~"restaurant|cafe|bar|fast_food|pharmacy|bank|clinic|dentist|hospital|fuel|car_rental|car_wash|veterinary|hairdresser|beauty"](%s,%s,%s,%s);
      way["amenity"~"restaurant|cafe|bar|fast_food|pharmacy|bank|clinic|dentist|hospital|fuel|car_rental|car_wash|veterinary|hairdresser|beauty"](%s,%s,%s,%s);
      relation["amenity"~"restaurant|cafe|bar|fast_food|pharmacy|bank|clinic|dentist|hospital|fuel|car_rental|car_wash|veterinary|hairdresser|beauty"](%s,%s,%s,%s);
      node["office"~"company|insurance|estate_agent|travel_agent|lawyer|accountant"](%s,%s,%s,%s);
      way["office"~"company|insurance|estate_agent|travel_agent|lawyer|accountant"](%s,%s,%s,%s);
      relation["office"~"company|insurance|estate_agent|travel_agent|lawyer|accountant"](%s,%s,%s,%s);
      node["craft"](%s,%s,%s,%s);
      way["craft"](%s,%s,%s,%s);
      relation["craft"](%s,%s,%s,%s);
    );
    out center tags;
    """ % (
        south, west, north, east,
        south, west, north, east,
        south, west, north, east,
        south, west, north, east,
        south, west, north, east,
        south, west, north, east,
        south, west, north, east,
        south, west, north, east,
        south, west, north, east,
        south, west, north, east,
        south, west, north, east,
        south, west, north, east,
    )

    headers = {
        "User-Agent": OVERPASS_USER_AGENT,
        "Content-Type": "application/x-www-form-urlencoded"
    }

    response = requests.post(
        OVERPASS_URL,
        data={"data": query},
        headers=headers,
        timeout=OVERPASS_TIMEOUT,
    )

    if response.status_code != 200:
        raise Exception(f"Error Overpass: {response.status_code} - {response.text}")

    return response.json(), query
