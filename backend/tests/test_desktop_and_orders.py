import tempfile
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import Mock, patch

from backend.app import desktop, qr_code_adapter


class DesktopAndOrdersTests(unittest.TestCase):
    def test_open_directory_creates_it_and_uses_xdg_open(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "orders"
            process = Mock()
            with (
                patch.object(desktop.shutil, "which", side_effect=["/usr/bin/xdg-open", None]),
                patch.object(desktop.subprocess, "Popen", process),
            ):
                opened = desktop.open_directory(target)

            self.assertEqual(opened, str(target.resolve()))
            self.assertTrue(target.is_dir())
            process.assert_called_once_with(
                ["/usr/bin/xdg-open", str(target.resolve())],
                stdout=desktop.subprocess.DEVNULL,
                stderr=desktop.subprocess.DEVNULL,
                start_new_session=True,
            )

    def test_open_directory_uses_startfile_on_windows(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "orders"
            with (
                patch.object(desktop.os, "name", "nt"),
                patch.object(desktop.os, "startfile", create=True) as startfile,
                patch.object(desktop.subprocess, "Popen") as process,
            ):
                opened = desktop.open_directory(target)

            self.assertEqual(opened, str(target.resolve()))
            self.assertTrue(target.is_dir())
            startfile.assert_called_once_with(str(target.resolve()))
            process.assert_not_called()

    def test_open_today_orders_directory_uses_dated_folder(self):
        with tempfile.TemporaryDirectory() as directory:
            orders_root = Path(directory) / "orders"
            expected = orders_root / str(date.today())
            with (
                patch.object(qr_code_adapter, "ORDERS_ROOT", orders_root),
                patch.object(
                    qr_code_adapter,
                    "open_directory",
                    return_value=str(expected.resolve()),
                ) as opener,
            ):
                opened = qr_code_adapter.open_today_orders_directory()

            self.assertEqual(opened, str(expected.resolve()))
            opener.assert_called_once_with(expected)

    def test_print_today_orders_submits_all_png_labels(self):
        with tempfile.TemporaryDirectory() as directory:
            orders_root = Path(directory) / "orders"
            today = orders_root / str(date.today())
            today.mkdir(parents=True)
            first = today / "111.png"
            second = today / "222.png"
            ignored = today / "notes.txt"
            first.touch()
            second.touch()
            ignored.touch()

            completed = Mock(returncode=0, stdout="request id is XP-DT426B-1\n", stderr="")
            with (
                patch.object(qr_code_adapter, "ORDERS_ROOT", orders_root),
                patch.object(qr_code_adapter, "PRINT_ORDERS_ENABLED", True),
                patch.object(qr_code_adapter.shutil, "which", return_value="/usr/bin/lp"),
                patch.object(qr_code_adapter.subprocess, "run", return_value=completed) as run,
            ):
                result = qr_code_adapter.print_today_orders()

            self.assertEqual(result["printed"], 2)
            self.assertEqual(result["printer"], "XP-DT426B")
            run.assert_called_once_with(
                [
                    "/usr/bin/lp",
                    "-d",
                    "XP-DT426B",
                    str(first.resolve()),
                    str(second.resolve()),
                ],
                capture_output=True,
                text=True,
                timeout=60,
                check=False,
            )

    def test_print_today_orders_without_labels_does_not_call_lp(self):
        with tempfile.TemporaryDirectory() as directory:
            orders_root = Path(directory) / "orders"
            with (
                patch.object(qr_code_adapter, "ORDERS_ROOT", orders_root),
                patch.object(qr_code_adapter.subprocess, "run") as run,
            ):
                result = qr_code_adapter.print_today_orders()

            self.assertEqual(result["printed"], 0)
            run.assert_not_called()

    def test_dev_mode_does_not_send_labels_to_printer(self):
        with tempfile.TemporaryDirectory() as directory:
            orders_root = Path(directory) / "orders"
            today = orders_root / str(date.today())
            today.mkdir(parents=True)
            (today / "111.png").touch()

            with (
                patch.object(qr_code_adapter, "ORDERS_ROOT", orders_root),
                patch.object(qr_code_adapter, "PRINT_ORDERS_ENABLED", False),
                patch.object(qr_code_adapter.subprocess, "run") as run,
            ):
                result = qr_code_adapter.print_today_orders()

            self.assertTrue(result["dry_run"])
            self.assertEqual(result["matched_labels"], 1)
            run.assert_not_called()


if __name__ == "__main__":
    unittest.main()
