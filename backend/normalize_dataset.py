"""Normalize accumulated public observation events.

Cleans stale parser artifacts, canonicalizes region names, and re-runs locality
matching against the regional place index. This only improves stored public
observation points; it does not infer trajectories, speed, course, or future
positions.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

try:
    from place_index import find_place
except ImportError:  # pragma: no cover
    from backend.place_index import find_place

ROOT = Path(__file__).resolve().parents[1]
EVENTS_PATH = ROOT / "data" / "events.json"

REGION_ALIASES = {
    "Москва и область": "Москва и Московская область",
    "Московская область": "Москва и Московская область",
    "Радар Питер и Ленинградская область": "Санкт-Петербург и Ленинградская область",
    "Ленинградская область": "Санкт-Петербург и Ленинградская область",
    "Вся Воронежская область": "Воронежская область",
    "Оренбургская  область": "Оренбургская область",
    "Над Нижегородской область": "Нижегородская область",
    "Причерноморье Краснодарский край": "Краснодарский край",
    "За прошедшую ночь Ростовская область": "Ростовская область",
    "НПЗ Краснодарский край": "Краснодарский край",
    "Над Запорожской область": "Запорожская область",
    "Тульскую область": "Тульская область",
    "Белгородскую область": "Белгородская область",
    "Брянскую область": "Брянская область",
}

CANONICAL_REGIONS = (
    "Нижегородская область", "Воронежская область", "Краснодарский край",
    "Республика Татарстан", "Архангельская область", "Тульская область",
    "Оренбургская область", "Москва и Московская область",
    "Санкт-Петербург и Ленинградская область", "Орловская область",
    "Калужская область", "Вологодская область", "Ростовская область",
    "Брянская область", "Тамбовская область", "Рязанская область",
    "Белгородская область", "Липецкая область", "Волгоградская область",
    "Костромская область", "Тверская область", "Смоленская область",
    "Владимирская область", "Саратовская область", "Ивановская область",
    "Пензенская область", "Ярославская область", "Новгородская область",
    "Курская область", "Ставропольский край", "Самарская область",
    "Чувашская Республика", "Кировская область", "Ульяновская область",
    "Астраханская область", "Карачаево-Черкесская Республика",
    "Кабардино-Балкарская Республика", "Запорожская область", "ХМАО",
)

SUSPICIOUS_PLACE = (
    "локатор россии", "радар по всей россии", "подпис", "канал", "бот",
    "обход белых списков", "квадрокоптер", "mavic", "cloudtips",
)

HANDLE_RE = re.compile(r"@[A-Za-z0-9_]+")


def _region_from_text(value: str) -> str | None:
    low = value.lower()
    # Prefer longer names first so Moscow region is not reduced to a substring.
    for region in sorted(CANONICAL_REGIONS, key=len, reverse=True):
        if region.lower() in low:
            return region
    return None


def canonical_region(region: str | None, text: str) -> str | None:
    raw = str(region or "").strip()
    if raw:
        raw = REGION_ALIASES.get(raw, raw)
        exact = _region_from_text(raw)
        if exact:
            return exact
    # Message text is often cleaner than a parser artifact such as
    # "Противник ... через Белгородскую область".
    exact = _region_from_text(text or "")
    if exact:
        return exact
    return None


def clean_place(place: str | None) -> str | None:
    if not place:
        return None
    value = HANDLE_RE.sub("", str(place)).strip(" •—:-")
    value = re.sub(r"\s{2,}", " ", value)
    low = value.lower()
    if not value or any(token in low for token in SUSPICIOUS_PLACE):
        return None
    if len(value) > 100:
        return None
    return value


def normalize_event(event: dict) -> dict:
    item = dict(event)
    text = str(item.get("text") or "")
    region = canonical_region(item.get("region"), text)
    item["region"] = region

    matched = find_place(text, region)
    if matched:
        item["place"] = matched["place"]
        item["lat"] = matched["lat"]
        item["lon"] = matched["lon"]
        item["approximate"] = True
        return item

    item["place"] = clean_place(item.get("place"))
    if not item["place"]:
        item.pop("lat", None)
        item.pop("lon", None)
    return item


def main() -> int:
    events = json.loads(EVENTS_PATH.read_text("utf-8")) if EVENTS_PATH.exists() else []
    normalized = [normalize_event(event) for event in events]
    normalized.sort(key=lambda x: x.get("published_at", ""), reverse=True)
    EVENTS_PATH.write_text(json.dumps(normalized, ensure_ascii=False, indent=2), "utf-8")
    print(json.dumps({"normalized": len(normalized)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
