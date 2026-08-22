"""Historical analytics for published event points.

This module is intended for archived data analysis only.
It calculates descriptive statistics between already recorded public events
when coordinates are available. It does not predict movement or future events.
"""

from __future__ import annotations

import json
import math
from collections import Counter
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EVENTS = ROOT / "data" / "events.json"


def haversine_km(lat1, lon1, lat2, lon2):
    r = 6371
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return round(2 * r * math.asin(math.sqrt(a)), 1)


def load_events():
    if not EVENTS.exists():
        return []
    return json.loads(EVENTS.read_text("utf-8"))


def analyze():
    events = load_events()
    by_region = Counter(e.get("region") for e in events if e.get("region"))
    by_source = Counter(e.get("source") for e in events if e.get("source"))

    pairs = []
    ordered = sorted(events, key=lambda x: x.get("published_at", ""))
    for a, b in zip(ordered, ordered[1:]):
        if all(k in a and k in b for k in ("lat", "lon")):
            try:
                distance = haversine_km(a["lat"], a["lon"], b["lat"], b["lon"])
                t1 = datetime.fromisoformat(a["published_at"].replace("Z", "+00:00"))
                t2 = datetime.fromisoformat(b["published_at"].replace("Z", "+00:00"))
                pairs.append({
                    "from": a.get("place"),
                    "to": b.get("place"),
                    "distance_km": distance,
                    "time_difference_minutes": round((t2 - t1).total_seconds() / 60, 1),
                })
            except Exception:
                pass

    return {
        "total_events": len(events),
        "regions": by_region,
        "sources": by_source,
        "historical_pairs": pairs,
        "note": "Historical descriptive analysis of published records only."
    }


if __name__ == "__main__":
    print(json.dumps(analyze(), ensure_ascii=False, indent=2, default=dict))
