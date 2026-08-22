"""Locality matching helpers.

Uses regional context from source channels to improve place extraction.
Coordinates are intentionally approximate at locality level.
"""

PLACES = {
    "Нижегородская область": {
        "Дзержинск": [56.2384, 43.4631],
        "Вад": [55.5300, 43.0600],
        "Арзамас": [55.3948, 43.8399],
        "Выкса": [55.3206, 42.1747],
    },
    "Воронежская область": {
        "Воронеж": [51.6608, 39.2003],
        "Семилуки": [51.6950, 39.0200],
    },
    "Республика Татарстан": {
        "Казань": [55.7961, 49.1064],
        "Набережные Челны": [55.7436, 52.3958],
    },
}


def find_place(text: str, region: str | None):
    if not region or region not in PLACES:
        return None
    low = text.lower()
    for name, coords in PLACES[region].items():
        if name.lower() in low:
            return {"place": name, "lat": coords[0], "lon": coords[1], "approximate": True}
    return None
