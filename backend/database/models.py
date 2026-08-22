from dataclasses import dataclass, asdict
from datetime import datetime

@dataclass
class Event:
    source: str
    published_at: str
    region: str
    locality: str
    status: str
    text: str
    confidence: int = 1

    def to_dict(self):
        return asdict(self)


def now_iso():
    return datetime.utcnow().isoformat() + "Z"
