import json
import re
import unicodedata
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from threading import RLock
from typing import Any
from urllib.parse import urlparse

from bs4 import BeautifulSoup

from backend.app.config import settings
from backend.app.desktop import open_directory


SUPPORTED_CITIES = ("Москва", "Энгельс")
DATA_DIR = settings.resolved_runtime_dir / "listings"
STATE_FILE = DATA_DIR / "listing_cities.json"
_STATE_LOCK = RLock()

_DEFAULT_STATE: dict[str, Any] = {
    "filter_enabled": False,
    "selected_city": "Москва",
    "listings": {},
    "updated_at": None,
    "source_page_url": None,
}


def normalize_title(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value or "")
    normalized = normalized.replace("ё", "е").replace("Ё", "Е")
    return " ".join(normalized.casefold().split())


def _normalize_city(value: str) -> str | None:
    text = " ".join((value or "").replace("\xa0", " ").casefold().split())
    for city in SUPPORTED_CITIES:
        if re.search(rf"(?<!\w){re.escape(city.casefold())}(?!\w)", text):
            return city
    return None


def _extract_city_from_href(href: str) -> str | None:
    path_parts = [part.casefold() for part in urlparse(href or "").path.split("/") if part]
    if "moskva" in path_parts:
        return "Москва"
    if "engels" in path_parts:
        return "Энгельс"
    return None


def extract_listing_fields(block: dict[str, Any]) -> tuple[str | None, str | None]:
    soup = BeautifulSoup(str(block.get("html") or ""), "lxml")

    title_tag = soup.select_one('[data-marker="view-link"]')
    if title_tag is None:
        title_tag = soup.find("a", href=re.compile(r"/\d+(?:\?.*)?$"))

    title = title_tag.get_text(" ", strip=True) if title_tag else None
    title = " ".join((title or "").split()) or None

    city = None
    for tag in soup.find_all(True):
        classes = tag.get("class") or []
        if any("geo-reference-row" in class_name for class_name in classes):
            city = _normalize_city(tag.get_text(" ", strip=True))
            if city:
                break

    if city is None and title_tag is not None:
        city = _extract_city_from_href(title_tag.get("href") or "")

    return title, city


def parse_listing_blocks(blocks: list[dict[str, Any]]) -> dict[str, Any]:
    by_normalized_title: dict[str, tuple[str, str]] = {}
    ambiguous_titles: dict[str, set[str]] = {}
    ignored = 0
    parsed_count = 0

    for block in blocks:
        title, city = extract_listing_fields(block)
        if not title or not city:
            ignored += 1
            continue

        parsed_count += 1
        key = normalize_title(title)
        previous = by_normalized_title.get(key)

        if key in ambiguous_titles:
            ambiguous_titles[key].add(city)
            continue

        if previous and previous[1] != city:
            ambiguous_titles[key] = {previous[1], city}
            del by_normalized_title[key]
            continue

        by_normalized_title[key] = (title, city)

    listings = {title: city for title, city in by_normalized_title.values()}
    city_counts = dict(Counter(listings.values()))
    conflicts = [
        {
            "title": key,
            "cities": sorted(cities),
        }
        for key, cities in sorted(ambiguous_titles.items())
    ]

    return {
        "listings": listings,
        "parsed_count": parsed_count,
        "city_counts": city_counts,
        "ignored_count": ignored,
        "conflicts": conflicts,
    }


def _read_state_unlocked() -> dict[str, Any]:
    state = dict(_DEFAULT_STATE)
    if not STATE_FILE.exists():
        return state

    try:
        saved = json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return state

    if isinstance(saved, dict):
        state.update(saved)
    if state.get("selected_city") not in SUPPORTED_CITIES:
        state["selected_city"] = _DEFAULT_STATE["selected_city"]
    if not isinstance(state.get("listings"), dict):
        state["listings"] = {}
    state["filter_enabled"] = bool(state.get("filter_enabled"))
    return state


def _write_state_unlocked(state: dict[str, Any]) -> None:
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    temporary_file = STATE_FILE.with_suffix(".tmp")
    temporary_file.write_text(
        json.dumps(state, ensure_ascii=False, indent=2, sort_keys=True),
        encoding="utf-8",
    )
    temporary_file.replace(STATE_FILE)


def get_city_state() -> dict[str, Any]:
    with _STATE_LOCK:
        return _read_state_unlocked()


def get_public_city_settings() -> dict[str, Any]:
    state = get_city_state()
    listings = state["listings"]
    return {
        "filter_enabled": state["filter_enabled"],
        "selected_city": state["selected_city"],
        "supported_cities": list(SUPPORTED_CITIES),
        "listings_count": len(listings),
        "city_counts": dict(Counter(listings.values())),
        "updated_at": state.get("updated_at"),
        "source_page_url": state.get("source_page_url"),
    }


def open_listings_directory() -> str:
    return open_directory(DATA_DIR)


def update_city_settings(filter_enabled: bool, selected_city: str) -> dict[str, Any]:
    if selected_city not in SUPPORTED_CITIES:
        raise ValueError(f"Неподдерживаемый город: {selected_city}")

    with _STATE_LOCK:
        state = _read_state_unlocked()
        state["filter_enabled"] = bool(filter_enabled)
        state["selected_city"] = selected_city
        _write_state_unlocked(state)

    return get_public_city_settings()


def save_listing_blocks(
    blocks: list[dict[str, Any]],
    source_page_url: str | None = None,
) -> dict[str, Any]:
    parsed = parse_listing_blocks(blocks)

    with _STATE_LOCK:
        state = _read_state_unlocked()
        state["listings"] = parsed["listings"]
        state["updated_at"] = datetime.now(timezone.utc).isoformat()
        state["source_page_url"] = source_page_url
        _write_state_unlocked(state)

    return {
        "received_count": len(blocks),
        "parsed_count": parsed["parsed_count"],
        "saved_count": len(parsed["listings"]),
        "city_counts": parsed["city_counts"],
        "ignored_count": parsed["ignored_count"],
        "conflicts": parsed["conflicts"],
        "updated_at": state["updated_at"],
    }


def filter_orders_by_saved_city(orders: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    state = get_city_state()
    received_count = len(orders)

    if not state["filter_enabled"]:
        return orders, {
            "filter_enabled": False,
            "selected_city": state["selected_city"],
            "received_count": received_count,
            "selected_count": received_count,
            "filtered_out_count": 0,
            "unmatched_titles": [],
        }

    city_by_title = {
        normalize_title(title): city
        for title, city in state["listings"].items()
        if isinstance(title, str) and city in SUPPORTED_CITIES
    }
    selected_orders: dict[str, Any] = {}
    unmatched_titles: set[str] = set()
    unmatched_count = 0
    other_city_count = 0

    for order_code, order in orders.items():
        order_data = order if isinstance(order, dict) else {}
        title = str(order_data.get("title") or "").strip()
        city = city_by_title.get(normalize_title(title))
        if city is None:
            unmatched_titles.add(title or "(без названия)")
            unmatched_count += 1
            continue
        if city == state["selected_city"]:
            selected_orders[order_code] = order
        else:
            other_city_count += 1

    return selected_orders, {
        "filter_enabled": True,
        "selected_city": state["selected_city"],
        "received_count": received_count,
        "selected_count": len(selected_orders),
        "filtered_out_count": received_count - len(selected_orders),
        "other_city_count": other_city_count,
        "unmatched_count": unmatched_count,
        "unmatched_titles": sorted(unmatched_titles),
    }
