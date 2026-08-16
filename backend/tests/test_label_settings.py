import tempfile
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import patch

from backend.app import label_settings, qr_code_adapter


class LabelSettingsTests(unittest.TestCase):
    def test_default_directory_is_used_without_saved_setting(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            default = root / "default-labels"
            with patch.object(label_settings, "STATE_FILE", root / "settings.json"):
                result = label_settings.get_public_label_settings(default)

            self.assertEqual(result["labels_directory"], str(default.resolve()))
            self.assertFalse(result["is_custom"])

    def test_absolute_custom_directory_is_created_and_saved(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            custom = root / "custom-labels"
            state_file = root / "settings.json"
            with patch.object(label_settings, "STATE_FILE", state_file):
                result = label_settings.update_labels_directory(
                    str(custom),
                    root / "default-labels",
                )
                effective = label_settings.get_labels_directory(root / "default-labels")

            self.assertTrue(custom.is_dir())
            self.assertEqual(result["labels_directory"], str(custom.resolve()))
            self.assertTrue(result["is_custom"])
            self.assertEqual(effective, custom.resolve())

    def test_empty_value_restores_default_directory(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            default = root / "default-labels"
            state_file = root / "settings.json"
            with patch.object(label_settings, "STATE_FILE", state_file):
                label_settings.update_labels_directory(str(root / "custom"), default)
                result = label_settings.update_labels_directory(None, default)

            self.assertEqual(result["labels_directory"], str(default.resolve()))
            self.assertFalse(result["is_custom"])

    def test_relative_directory_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            state_file = Path(directory) / "settings.json"
            with patch.object(label_settings, "STATE_FILE", state_file):
                with self.assertRaisesRegex(ValueError, "абсолютный путь"):
                    label_settings.update_labels_directory("relative/labels")

    def test_qr_adapter_uses_custom_directory_and_date(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            custom = root / "custom-labels"
            state_file = root / "settings.json"
            with (
                patch.object(label_settings, "STATE_FILE", state_file),
                patch.object(qr_code_adapter, "ORDERS_ROOT", root / "default-labels"),
            ):
                label_settings.update_labels_directory(str(custom))
                today_directory = qr_code_adapter.get_today_orders_directory()

            self.assertEqual(today_directory, custom.resolve() / str(date.today()))

    def test_create_labels_writes_to_custom_dated_directory(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            custom = root / "custom-labels"
            state_file = root / "settings.json"
            with (
                patch.object(label_settings, "STATE_FILE", state_file),
                patch.object(qr_code_adapter, "ORDERS_ROOT", root / "default-labels"),
                patch.object(qr_code_adapter, "create_label") as create_label,
            ):
                label_settings.update_labels_directory(str(custom))
                output = qr_code_adapter.create_labels({
                    "123": {
                        "title": "Товар",
                        "point": "СДЭК",
                        "qty": 1,
                    }
                })

            expected = custom.resolve() / str(date.today())
            self.assertEqual(output, str(expected))
            self.assertTrue(expected.is_dir())
            create_label.assert_called_once_with(
                tracking_num="123",
                item_name="Товар",
                point="СДЭК",
                qty=1,
                out_dir=str(expected),
            )


if __name__ == "__main__":
    unittest.main()
