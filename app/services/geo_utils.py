import math

def calculate_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calcul de distance en kilomètres via la formule de Haversine"""
    r = 6371.0  # Rayon terrestre en km
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = (math.sin(d_lat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(d_lon / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return round(r * c, 2)

def estimate_walk_time_min(distance_km: float) -> int:
    """Estimation du temps de marche (vitesse ~4.5 km/h)"""
    speed_km_h = 4.5
    return max(1, round((distance_km / speed_km_h) * 60))

def estimate_vehicle_time_min(distance_km: float, speed_km_h: float = 25.0, traffic_penalty: float = 1.0) -> int:
    """Estimation du temps de trajet véhicule avec facteur trafic"""
    base_min = (distance_km / speed_km_h) * 60
    return max(2, round(base_min * traffic_penalty))
