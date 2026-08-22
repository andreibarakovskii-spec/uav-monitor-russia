"""Helpers for merging repeated public observations."""

from datetime import datetime


def merge_key(event: dict):
    place = (event.get("place") or "").lower().strip()
    region = (event.get("region") or "").lower().strip()
    return region, place


def combine_confirmations(events: list[dict]) -> list[dict]:
    grouped = {}
    for event in events:
        key = merge_key(event)
        grouped.setdefault(key, []).append(event)

    result = []
    for group in grouped.values():
        base = dict(group[0])
        sources = {x.get("source") for x in group if x.get("source")}
        base["confirmations"] = len(sources)
        base["sources"] = sorted(sources)
        result.append(base)

    return sorted(result, key=lambda x: x.get("published_at", ""), reverse=True)
