"""Historical analytics for published event points.

This module is intended for archived data analysis only. It calculates
aggregate statistics over already-recorded public events. Fresh observations are
excluded from pairwise distance/time calculations to avoid turning the dashboard
into an operational tracker.
"""

from __future__ import annotations

import json
import math
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EVENTS = ROOT / "data" / "events.json"
OUTPUT = ROOT / "data" / "historical_analysis.json"
ARCHIVE_DELAY_HOURS = 24


def haversine_km(lat1, lon1, lat2, lon2):
    r = 6371
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return round(2 * r * math.asin(math.sqrt(a)), 1)


def parse_dt(value):
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except Exception:
        return None


def load_events():
    if not EVENTS.exists():
        return []
    try:
        return json.loads(EVENTS.read_text("utf-8"))
    except Exception:
        return []


def analyze():
    events = load_events()
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(hours=ARCHIVE_DELAY_HOURS)
    archived = []
    for event in events:
        dt = parse_dt(event.get("published_at"))
        if dt and dt <= cutoff:
            archived.append((dt, event))

    by_region = Counter(e.get("region") for _, e in archived if e.get("region"))
    by_source = Counter(e.get("source") for _, e in archived if e.get("source"))
    by_status = Counter(e.get("status") for _, e in archived if e.get("status"))

    timeline = Counter(dt.strftime("%Y-%m-%d") for dt, _ in archived)

    pairs = []
    ordered = sorted(archived, key=lambda x: x[0])
    for (t1, a), (t2, b) in zip(ordered, ordered[1:]):
        if not all(k in a and a.get(k) is not None and k in b and b.get(k) is not None for k in ("lat", "lon")):
            continue
        try:
            distance = haversine_km(float(a["lat"]), float(a["lon"]), float(b["lat"]), float(b["lon"]))
            minutes = round((t2 - t1).total_seconds() / 60, 1)
            if minutes < 0:
                continue
            pairs.append({
                "from": a.get("place"),
                "to": b.get("place"),
                "from_region": a.get("region"),
                "to_region": b.get("region"),
                "distance_km": distance,
                "time_difference_minutes": minutes,
                "from_time": t1.isoformat(),
                "to_time": t2.isoformat(),
            })
        except Exception:
            pass

    result = {
        "generated_at": now.isoformat(),
        "archive_delay_hours": ARCHIVE_DELAY_HOURS,
        "total_events": len(events),
        "archived_events": len(archived),
        "regions": dict(by_region.most_common()),
        "sources": dict(by_source.most_common()),
        "statuses": dict(by_status.most_common()),
        "timeline": dict(sorted(timeline.items())),
        "historical_pairs": pairs[-200:],
        "note": "Archived descriptive analysis only; excludes observations newer than 24 hours."
    }
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2), "utf-8")
    return result


if __name__ == "__main__":
    print(json.dumps(analyze(), ensure_ascii=False, indent=2))
