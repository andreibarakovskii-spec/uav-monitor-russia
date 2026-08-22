"""Collect public Telegram channel posts into normalized point events.

Stores published observation points and source diagnostics only. It does not
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
STATUS_PATH = DATA_DIR / "collector_status.json"

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
    "fix": ("зафикс", "фиксац", "замечен", "обнаруж", "бпла"),
}

REGION_RE = re.compile(
    r"(?P<region>[А-ЯЁ][А-Яа-яЁё\- ]+(?:область|край|республика|АО|автономный округ))",
    re.I,
)
BLOCK_RE = re.compile(
    r'<div class="tgme_widget_message_wrap[^>]*>(?P<block>.*?)</div>\s*</div>\s*</div>',
    re.S,
)
POST_RE = re.compile(r'data-post="(?P<post>[^"]+)"')
TIME_RE = re.compile(r'<time[^>]+datetime="(?P<time>[^"]+)"')
TEXT_RE = re.compile(r'<div class="tgme_widget_message_text[^>]*>(?P<text>.*?)</div>', re.S)
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


def clean_text(raw: str | None) -> str:
    value = raw or ""
    value = re.sub(r"<br\s*/?>", "\n", value, flags=re.I)
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
    for line in lines[:6]:
        low = line.lower()
        if region and low == region.lower():
            continue
        if any(k in low for k in ("бпла", "опасност", "тревог", "пво", "фиксац", "сбит", "отбой")):
            continue
        if 2 <= len(line) <= 80:
            return line
    return None


def fetch_channel(channel: str) -> str:
    req = urllib.request.Request(
        f"https://t.me/s/{channel}",
        headers={
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130 Safari/537.36",
            "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
        },
    )
    with urllib.request.urlopen(req, timeout=25) as response:
        return response.read().decode("utf-8", errors="replace")


def iter_message_blocks(page: str):
    # Telegram's public page markup can vary; first isolate every message wrapper
    # by the next wrapper boundary, which is more tolerant than nesting-specific regexes.
    starts = [m.start() for m in re.finditer(r'<div class="tgme_widget_message_wrap', page)]
    if not starts:
        return
    starts.append(len(page))
    for i in range(len(starts) - 1):
        yield page[starts[i]:starts[i + 1]]


def parse_channel(channel: str, page: str) -> tuple[list[Event], dict]:
    result: list[Event] = []
    diagnostics = {"message_blocks": 0, "with_text": 0, "with_bpla": 0, "parsed": 0}

    for block in iter_message_blocks(page) or []:
        diagnostics["message_blocks"] += 1
        post_m = POST_RE.search(block)
        time_m = TIME_RE.search(block)
        text_m = TEXT_RE.search(block)
        if not post_m or not time_m or not text_m:
            continue
        diagnostics["with_text"] += 1
        text = clean_text(text_m.group("text"))
        if "бпла" not in text.lower() and "дрон" not in text.lower():
            continue
        diagnostics["with_bpla"] += 1
        status = detect_status(text)
        if status == "unknown":
            continue
        region = extract_region(text)
        place = extract_place(text, region)
        post = post_m.group("post")
        published_at = time_m.group("time")
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
            )
        )
    diagnostics["parsed"] = len(result)
    return result, diagnostics


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
    sources_status: dict[str, dict] = {}

    for channel in SOURCES:
        try:
            page = fetch_channel(channel)
            parsed, diag = parse_channel(channel, page)
            incoming.extend(parsed)
            sources_status[channel] = {
                "ok": True,
                "events": len(parsed),
                "error": None,
                **diag,
            }
        except Exception as exc:
            sources_status[channel] = {
                "ok": False,
                "events": 0,
                "error": str(exc),
                "message_blocks": 0,
                "with_text": 0,
                "with_bpla": 0,
                "parsed": 0,
            }

    merged = merge(existing, incoming)
    EVENTS_PATH.write_text(json.dumps(merged, ensure_ascii=False, indent=2), "utf-8")
    status = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "incoming": len(incoming),
        "total": len(merged),
        "sources": sources_status,
    }
    STATUS_PATH.write_text(json.dumps(status, ensure_ascii=False, indent=2), "utf-8")
    print(json.dumps(status, ensure_ascii=False))
    return 0 if incoming or existing else 1


if __name__ == "__main__":
    sys.exit(run())
