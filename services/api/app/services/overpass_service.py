import requests

def fetch_overpass_shops():
    url = "https://overpass-api.de/api/interpreter"

    query = """
    [out:json][timeout:25];
    area["name"="Almería"]->.searchArea;
    (
      node["shop"](area.searchArea);
      way["shop"](area.searchArea);
      relation["shop"](area.searchArea);
    );
    out body;
    >;
    out skel qt;
    """

    headers = {
        "User-Agent": "PROYECTO_I.A AL ANDALUS/1.0",
        "Content-Type": "application/x-www-form-urlencoded"
    }

    response = requests.post(url, data={'data': query}, headers=headers)

    if response.status_code != 200:
        raise Exception(f"Error Overpass: {response.status_code} - {response.text}")

    return response.json()
