"""User-facing CLI texts of MyLAN Host from host/locales/<lang>.json (MYLAN_HOST_LANG, default it; fallback en)."""
import json
import os
from functools import lru_cache
from pathlib import Path


@lru_cache(maxsize=4)
def _table(lang: str) -> dict:
    try:
        return json.loads((Path(__file__).parent / "locales" / f"{lang}.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def t(key: str, **kw) -> str:
    lang = os.environ.get("MYLAN_HOST_LANG", "it")
    text = _table(lang).get(key) or _table("en").get(key) or key
    return text.format(**kw) if kw else text
