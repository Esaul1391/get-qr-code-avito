import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from backend.app import listing_cities


def listing_html(title: str, city: str, slug: str) -> str:
    return f"""
    <div data-marker="item-snippet/123">
      <a data-marker="view-link" href="https://www.avito.ru/{slug}/parts/thing_123">{title}</a>
      <div class="styles-geo-reference-row-random">{city}, район</div>
    </div>
    """


class ListingCitiesTests(unittest.TestCase):
    def test_parse_listing_title_and_city(self):
        parsed = listing_cities.parse_listing_blocks([
            {"html": listing_html("Товар 1", "Москва", "moskva")},
            {"html": listing_html("Товар 2", "Энгельс", "engels")},
        ])

        self.assertEqual(
            parsed["listings"],
            {"Товар 1": "Москва", "Товар 2": "Энгельс"},
        )
        self.assertEqual(parsed["ignored_count"], 0)

    def test_same_title_in_different_cities_is_reported_as_conflict(self):
        parsed = listing_cities.parse_listing_blocks([
            {"html": listing_html("Одинаковый товар", "Москва", "moskva")},
            {"html": listing_html("Одинаковый товар", "Энгельс", "engels")},
        ])

        self.assertEqual(parsed["listings"], {})
        self.assertEqual(len(parsed["conflicts"]), 1)

    def test_saved_setting_filters_orders(self):
        with tempfile.TemporaryDirectory() as directory:
            state_file = Path(directory) / "listing_cities.json"
            with patch.object(listing_cities, "STATE_FILE", state_file):
                listing_cities.save_listing_blocks([
                    {"html": listing_html("Товар Москва", "Москва", "moskva")},
                    {"html": listing_html("Товар Энгельс", "Энгельс", "engels")},
                ])
                listing_cities.update_city_settings(True, "Энгельс")

                selected, result = listing_cities.filter_orders_by_saved_city({
                    "111": {"title": "Товар Москва"},
                    "222": {"title": "  товар Энгельс  "},
                    "333": {"title": "Новый товар"},
                })

                self.assertEqual(list(selected), ["222"])
                self.assertEqual(result["selected_count"], 1)
                self.assertEqual(result["other_city_count"], 1)
                self.assertEqual(result["unmatched_count"], 1)

    def test_open_listings_directory_uses_system_file_manager(self):
        with tempfile.TemporaryDirectory() as directory:
            data_dir = Path(directory) / "data"
            with (
                patch.object(listing_cities, "DATA_DIR", data_dir),
                patch.object(
                    listing_cities,
                    "open_directory",
                    return_value=str(data_dir.resolve()),
                ) as opener,
            ):
                opened = listing_cities.open_listings_directory()

            self.assertEqual(opened, str(data_dir.resolve()))
            opener.assert_called_once_with(data_dir)


if __name__ == "__main__":
    unittest.main()
