import re

STATUS_WORDS = {
    "fix": ["зафикс", "замечен", "обнаруж"],
    "alert": ["опасность", "тревога"],
    "defense": ["пво", "сбит"],
    "cancel": ["отбой", "отмена"]
}


def detect_status(text: str) -> str:
    value = text.lower()
    for status, words in STATUS_WORDS.items():
        if any(word in value for word in words):
            return status
    return "unknown"


def extract_locality(text: str):
    # Первый этап: подготовка места для NER/словаря населённых пунктов
    # Реальный геокодер будет подключён следующим коммитом
    return None


def normalize_message(source: str, text: str, published_at: str):
    return {
        "source": source,
        "text": text,
        "published_at": published_at,
        "status": detect_status(text),
        "locality": extract_locality(text)
    }
