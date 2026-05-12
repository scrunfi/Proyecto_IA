import httpx
import asyncio
import os

API_KEY = os.getenv("GOOGLE_API_KEY")

# tiempo entre peticiones
REQUEST_DELAY = 0.4  # 300ms


async def fetch_google_reviews(name: str, lat: float, lon: float):

    # esperar antes de llamar a Google
    await asyncio.sleep(REQUEST_DELAY)

    try:
        async with httpx.AsyncClient(timeout=20) as client:

            nearby_url = "https://maps.googleapis.com/maps/api/place/nearbysearch/json"

            nearby_params = {
                "location": f"{lat},{lon}",
                "radius": 50,
                "keyword": name,
                "key": API_KEY
            }

            nearby_response = await client.get(
                nearby_url,
                params=nearby_params
            )

            nearby_data = nearby_response.json()

            status = nearby_data.get("status")

            if status == "OVER_QUERY_LIMIT":
                print("Google limit alcanzado")
                return None

            if status != "OK":
                return None

            results = nearby_data.get("results", [])

            if not results:
                return None

            place_id = results[0]["place_id"]

            # otra pequeña pausa
            await asyncio.sleep(REQUEST_DELAY)

            details_url = "https://maps.googleapis.com/maps/api/place/details/json"

            details_params = {
                "place_id": place_id,
                "fields": "name,rating,reviews,user_ratings_total",
                "reviews_sort": "newest",
                "language": "es",
                "translated": "true",
                "key": API_KEY
            }

            details_response = await client.get(
                details_url,
                params=details_params
            )

            details_data = details_response.json()

            if details_data.get("status") != "OK":
                return None

            return {
                "place_id": place_id,
                "rating": details_data["result"].get("rating"),
                "user_ratings_total": details_data["result"].get("user_ratings_total"),
                "reviews": details_data["result"].get("reviews", [])
            }

    except Exception as e:
        print("Google Places error:", e)
        return None