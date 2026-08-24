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

try:
    from place_index import find_place
except ImportError:  # pragma: no cover - package-style execution
    from backend.place_index import find_place

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
EVENTS_PATH = DATA_DIR / "events.json"
STATUS_PATH = DATA_DIR / "collector_status.json"

SOURCE_META = {
    "nn52signal": {"region": "Нижегородская область", "type": "regional"},
    "radar_nizhniinovgorod": {"region": "Нижегородская область", "type": "regional"},
    "radarrussiia": {"region": "Россия", "type": "national"},
    "locatorru": {"region": "Россия", "type": "national"},
    "vrv_radar": {"region": "Россия", "type": "regional-network"},
    "radar_voronezh": {"region": "Воронежская область", "type": "regional"},
    "radar_peterburg": {"region": "Санкт-Петербург и Ленинградская область", "type": "regional"},
    "RDFradar": {"region": "Москва и Московская область", "type": "regional"},
    "radar_tatarstann": {"region": "Республика Татарстан", "type": "regional"},
    "radar_tatarstan": {"region": "Республика Татарстан", "type": "regional"},
    "tatalert": {"region": "Республика Татарстан", "type": "regional"},
}
SOURCES = list(SOURCE_META)

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
POST_RE = re.compile(r'data-post="(?P<post>[^"]+)"')
TIME_RE = re.compile(r'<time[^>]+datetime="(?P<time>[^"]+)"')
TEXT_RE = re.compile(r'<div class="tgme_widget_message_text[^>]*>(?P<text>.*?)</div>', re.S)
TAG_RE = re.compile(r"<[^>]+>")
HANDLE_RE = re.compile(r"@[A-Za-z0-9_]+")

NOISE_WORDS = (
    "подписывайтесь", "подписаться", "наш канал", "наш бот", "бот",
    "реклама", "реквизит", "сбор", "помочь", "донат", "поддержать",
    "квадрокоптер", "mavic", "cloudtips", "т-банк", "сбп",
    "обход белых списков", "интернет", "internet_boost",
)
SERVICE_PHRASES = (
    "выйти с нами на связь", "обратная связь", "поделитесь каналом",
    "для подписчиков", "у нас в команде", "работников нпз", "службы мчс",
    "оперативных дежурных", "военных:", "военных ",
)

PLACE_NOISE = (
    "локатор россии", "радар по всей россии", "подпис", "канал", "бот",
    "обход белых списков", "опасность", "угроза", "тревога", "бпла",
    "пво", "фиксац", "сбит", "отбой", "внимание", "меры безопасности",
)


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
    lat: float | None = None
    lon: float | None = None


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


def is_noise_post(text: str) -> bool:
    lower = text.lower()
    if any(phrase in lower for phrase in SERVICE_PHRASES):
        return True
    if any(word in lower for word in NOISE_WORDS):
        operational_markers = (
            "опасность", "угроза", "тревога", "зафикс", "замечен", "обнаруж",
            "сбит", "подавлен", "отбой", "пролёт", "пролет",
        )
        if not any(marker in lower for marker in operational_markers):
            return True
    return False


def extract_region(text: str, channel: str) -> str | None:
    match = REGION_RE.search(text)
    if match:
        return match.group("region").strip()
    meta = SOURCE_META.get(channel, {})
    region = meta.get("region")
    if meta.get("type") == "regional":
        return region
    return None


def clean_place_candidate(value: str) -> str | None:
    value = HANDLE_RE.sub("", value)
    value = re.sub(r"^[^А-Яа-яЁё0-9]+|[^А-Яа-яЁё0-9\- ,.]+$", "", value).strip()
    value = re.sub(r"\s{2,}", " ", value)
    low = value.lower()
    if not value or len(value) < 2 or len(value) > 100:
        return None
    if any(noise in low for noise in PLACE_NOISE):
        return None
    return value


def extract_place(text: str, region: str | None) -> str | None:
    matched = find_place(text, region)
    if matched:
        return matched["place"]

    lines = [x.strip(" •—:-") for x in text.splitlines() if x.strip()]
    for line in lines[:8]:
        low = line.lower()
        if region and low == region.lower():
            continue
        candidate = clean_place_candidate(line)
        if not candidate:
            continue
        # If a line contains a locality before the region, prefer that exact locality
        # instead of falling back to a regional administrative centre.
        if "," in candidate:
            first = clean_place_candidate(candidate.split(",", 1)[0])
            if first and len(first.split()) <= 5:
                return first
        if re.search(r"\b(район|округ|г\.?о\.?|город|село|пос[её]лок|деревня|станица|хутор)\b", low):
            return candidate
        if len(candidate.split()) <= 5:
            return candidate
    return None


def resolve_place(text: str, region: str | None, candidate: str | None):
    matched = find_place(text, region)
    if matched:
        return matched["place"], matched["lat"], matched["lon"], matched.get("approximate", True), True
    if candidate:
        return candidate, None, None, True, False
    return None, None, None, True, False


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
    starts = [m.start() for m in re.finditer(r'<div class="tgme_widget_message_wrap', page)]
    if not starts:
        return
    starts.append(len(page))
    for i in range(len(starts) - 1):
        yield page[starts[i]:starts[i + 1]]


def parse_channel(channel: str, page: str) -> tuple[list[Event], dict]:
    result: list[Event] = []
    diagnostics = {
        "message_blocks": 0,
        "with_text": 0,
        "with_bpla": 0,
        "filtered_noise": 0,
        "parsed": 0,
        "region_from_channel": 0,
        "place_found": 0,
        "place_geocoded": 0,
    }

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
        if is_noise_post(text):
            diagnostics["filtered_noise"] += 1
            continue
        status = detect_status(text)
        if status == "unknown":
            continue
        explicit_region = REGION_RE.search(text)
        region = extract_region(text, channel)
        if region and not explicit_region and SOURCE_META.get(channel, {}).get("type") == "regional":
            diagnostics["region_from_channel"] += 1
        candidate = extract_place(text, region)
        place, lat, lon, approximate, geocoded = resolve_place(text, region, candidate)
        if place:
            diagnostics["place_found"] += 1
        if geocoded:
            diagnostics["place_geocoded"] += 1
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
                approximate=approximate,
                lat=lat,
                lon=lon,
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
                "configured_region": SOURCE_META[channel]["region"],
                "source_type": SOURCE_META[channel]["type"],
                **diag,
            }
        except Exception as exc:
            sources_status[channel] = {
                "ok": False,
                "events": 0,
                "error": str(exc),
                "configured_region": SOURCE_META[channel]["region"],
                "source_type": SOURCE_META[channel]["type"],
                "message_blocks": 0,
                "with_text": 0,
                "with_bpla": 0,
                "filtered_noise": 0,
                "parsed": 0,
                "region_from_channel": 0,
                "place_found": 0,
                "place_geocoded": 0,
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
