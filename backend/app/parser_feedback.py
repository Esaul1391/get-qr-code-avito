import re
from bs4 import BeautifulSoup
from typing import Any, Dict, List, Optional


_RE_SUBTITLE = re.compile(r"^review\(\d+\)/header/subtitle$")
_RE_ITEMTITLE = re.compile(r"^review\(\d+\)/itemTitle$")
_RE_REVIEW_MARKER = re.compile(r"review\((\d+)\)")


def extract_review_fields(block: Dict[str, Any]) -> Dict[str, Any]:
    """
    На вход: один элемент списка в твоём формате:
      { 'html': '<div ...>...</div>', 'marker': 'review(0)', ... }

    На выход: словарь с тем, что нашли.
    """
    html: str = block.get("html", "") or ""
    marker: Optional[str] = block.get("marker")

    soup = BeautifulSoup(html, "lxml")

    # 1) subtitle: "22 декабря · Покупатель"
    subtitle_tag = soup.find("p", attrs={"data-marker": _RE_SUBTITLE})
    subtitle_text = subtitle_tag.get_text(" ", strip=True) if subtitle_tag else None

    date_part = None
    if subtitle_text and "·" in subtitle_text:
        left, right = subtitle_text.split("·", 1)
        date_part = left.strip()
    elif subtitle_text:
        date_part = subtitle_text.strip()

    # 2) itemTitle
    item_tag = soup.find("span", attrs={"data-marker": _RE_ITEMTITLE})
    item_title = item_tag.get_text(" ", strip=True) if item_tag else None

    # # 3) review index (если есть)
    # review_index = None
    # if marker:
    #     m = _RE_REVIEW_MARKER.search(marker)
    #     if m:
    #         review_index = int(m.group(1))
    # else:
    #     # иногда marker может отсутствовать в block, попробуем вытащить из найденных data-marker
    #     any_marker = None
    #     if subtitle_tag and subtitle_tag.has_attr("data-marker"):
    #         any_marker = subtitle_tag["data-marker"]
    #     elif item_tag and item_tag.has_attr("data-marker"):
    #         any_marker = item_tag["data-marker"]
    #     if any_marker:
    #         m = _RE_REVIEW_MARKER.search(any_marker)
    #         if m:
    #             review_index = int(m.group(1))

    return {
        # "review_index": review_index,
        # "marker": marker,
        # "subtitle_raw": subtitle_text,  # "22 декабря · Покупатель"
        "date": date_part,              # "22 декабря"
        "item_title": item_title,       # "Фикcaтор ..."
    }


def parser_all_feedback(payload: list | None) -> list:
    items = []
    for row in payload:
        extract = extract_review_fields(row)
        item = extract.get('item_title')
        if not item:
            continue
        items.append(item)
    return items
