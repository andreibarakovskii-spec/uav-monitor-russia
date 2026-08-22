"""Public source collector skeleton.

Collects publicly available event data and normalizes it for the dashboard.
"""

from dataclasses import dataclass
from datetime import datetime


@dataclass
class Event:
    source: str
    text: str
    published_at: datetime
    place: str | None = None
    region: str | None = None
    status: str = "unknown"


def normalize_event(event: Event) -> Event:
    keywords = {
        "отбой": "end",
        "опасность": "alert",
        "пво": "defense",
        "сбит": "defense",
        "зафикс": "fixation",
    }
    text = event.text.lower()
    for key, value in keywords.items():
        if key in text:
            event.status = value
            break
    return event


if __name__ == "__main__":
    print("collector ready")
