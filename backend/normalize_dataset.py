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
}

SUSPICIOUS_PLACE = (
    "локатор россии", "радар по всей россии", "подпис", "канал", "бот",
    "обход белых списков", "квадрокоптер", "mavic", "cloudtips",
)

REGION_RE = re.compile(
    r"(?P<region>[А-ЯЁ][А-Яа-яЁё\- ]+(?:область|край|республика|АО|автономный округ))",
    re.I,
)
HANDLE_RE = re.compile(r"@[A-Za-z0-9_]+")


def canonical_region(region: str | None, text: str) -> str | None:
    if region:
        region = REGION_ALIASES.get(region.strip(), region.strip())
        if region in REGION_ALIASES:
            region = REGION_ALIASES[region]
        if region.startswith("Через "):
            region = region.removeprefix("Через ").strip()
        if region.startswith("и далее на "):
            region = region.removeprefix("и далее на ").strip()
        if len(region) <= 45 and any(x in region.lower() for x in ("область", "край", "республика", "округ")):
            return REGION_ALIASES.get(region, region)
    match = REGION_RE.search(text or "")
    if match:
        value = match.group("region").strip()
        value = re.sub(r"^(через|над|вся)\s+", "", value, flags=re.I)
        return REGION_ALIASES.get(value, value)
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
