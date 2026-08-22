"""Collect public Telegram channel posts into normalized point events.

This collector intentionally stores published observation points only. It does not
compute trajectories, speed, course, object identity, or predicted positions.
"""

from __future__ import annotations

import hashlib
import html
import json
import re
import sys
import urllib.request
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
EVENTS_PATH = DATA_DIR / "events.json"

SOURCES = [
    "nn52signal",
    "radar_nizhniinovgorod",
    "radarrussiia",
    "locatorru",
    "vrv_radar",
    "radar_voronezh",
    "radar_peterburg",
    "RDFradar",
    "radar_tatarstann",
    "radar_tatarstan",
    "tatalert",
]

STATUS_WORDS = {
    "cancel": ("отбой", "отмена", "не подтвержд"),
    "defense": ("пво", "сбит", "уничтожен", "подавлен"),
    "alert": ("опасность", "тревога", "угроза"),
    "fix": ("зафикс", "фиксац", "замечен", "обнаруж"),
}

REGION_RE = re.compile(
    r"(?P<region>[А-ЯЁ][А-Яа-яЁё\- ]+(?:область|край|республика|АО|автономный округ))",
    re.I,
)
PLACE_RE = re.compile(
    r"(?P<place>[А-ЯЁ][А-Яа-яЁё\- ]{1,60}?(?:район|округ|город|г\.о\.|село|пос[её]лок|деревня)?)\s*(?:\n|<br|$)",
    re.I,
)
MESSAGE_RE = re.compile(
    r'<div class="tgme_widget_message_wrap[^>]*>.*?'
    r'data-post="(?P<post>[^"]+)".*?'
    r'<time datetime="(?P<time>[^"]+)".*?</time>.*?'
    r'(?:<div class="tgme_widget_message_text[^>]*>(?P<text>.*?)</div>)?',
    re.S,
)
TAG_RE = re.compile(r"<[^>]+>")


@dataclass
class Event:
    id: str
    place: str | None
    region: str | None
    source: str
    status: str
    published_at: str
    text: str
    confirmations: int = 1
    approximate: bool = True
    source_url: str | None = None
    direction_text: str | None = None


def clean_text(raw: str | None) -> str:
    value = raw or ""
    value = value.replace("<br/>", "\n").replace("<br>", "\n").replace("<br />", "\n")
    value = TAG_RE.sub("", value)
    return re.sub(r"\n{3,}", "\n\n", html.unescape(value)).strip()


def detect_status(text: str) -> str:
    lower = text.lower()
    for status, words in STATUS_WORDS.items():
        if any(word in lower for word in words):
            return status
    return "unknown"


def extract_region(text: str) -> str | None:
    match = REGION_RE.search(text)
    return match.group("region").strip() if match else None


def extract_place(text: str, region: str | None) -> str | None:
    lines = [x.strip(" •—:-") for x in text.splitlines() if x.strip()]
    for line in lines[:4]:
        if region and line.lower() == region.lower():
            continue
        if any(k in line.lower() for k in ("бпла", "опасност", "тревог", "пво", "фиксац", "сбит")):
            continue
        if 2 <= len(line) <= 70:
            return line
    match = PLACE_RE.search(text)
    return match.group("place").strip() if match else None


def extract_direction_text(text: str) -> str | None:
    """Preserve only direction wording explicitly present in the source post."""
    patterns = [
        r"(?:в|по)\s+направлени[ию]\s+([^\n.!?]{2,80})",
        r"направлени[ие]\s*[:—-]\s*([^\n.!?]{2,80})",
    ]
    for pattern in patterns:
        m = re.search(pattern, text, re.I)
        if m:
            return m.group(1).strip(" .,:;—-")
    return None


def fetch_channel(channel: str) -> str:
    req = urllib.request.Request(
        f"https://t.me/s/{channel}",
        headers={"User-Agent": "Mozilla/5.0 UAV-Monitor-Russia/1.0"},
    )
    with urllib.request.urlopen(req, timeout=20) as response:
        return response.read().decode("utf-8", errors="replace")


def parse_channel(channel: str, page: str) -> list[Event]:
    result: list[Event] = []
    for match in MESSAGE_RE.finditer(page):
        text = clean_text(match.group("text"))
        if not text or "бпла" not in text.lower():
            continue
        status = detect_status(text)
        if status == "unknown":
            continue
        region = extract_region(text)
        place = extract_place(text, region)
        post = match.group("post")
        published_at = match.group("time")
        digest = hashlib.sha1(f"{post}|{published_at}|{text}".encode()).hexdigest()[:16]
        result.append(
            Event(
                id=f"tg-{digest}",
                place=place,
                region=region,
                source=f"@{channel}",
                status=status,
                published_at=published_at,
                text=text,
                source_url=f"https://t.me/{post}",
                direction_text=extract_direction_text(text),
            )
        )
    return result


def merge(existing: Iterable[dict], incoming: Iterable[Event]) -> list[dict]:
    by_id = {str(item.get("id")): dict(item) for item in existing if item.get("id")}
    for event in incoming:
        by_id[event.id] = asdict(event)
    values = list(by_id.values())
    values.sort(key=lambda x: x.get("published_at", ""), reverse=True)
    return values[:5000]


def run() -> int:
    DATA_DIR.mkdir(exist_ok=True)
    try:
        existing = json.loads(EVENTS_PATH.read_text("utf-8")) if EVENTS_PATH.exists() else []
    except Exception:
        existing = []

    incoming: list[Event] = []
    errors: list[str] = []
    for channel in SOURCES:
        try:
            incoming.extend(parse_channel(channel, fetch_channel(channel)))
        except Exception as exc:
            errors.append(f"{channel}: {exc}")

    merged = merge(existing, incoming)
    EVENTS_PATH.write_text(json.dumps(merged, ensure_ascii=False, indent=2), "utf-8")
    print(json.dumps({"updated_at": datetime.now(timezone.utc).isoformat(), "incoming": len(incoming), "total": len(merged), "errors": errors}, ensure_ascii=False))
    return 0 if incoming or existing else 1


if __name__ == "__main__":
    sys.exit(run())
