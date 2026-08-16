import os
import io
import shutil
import subprocess
from datetime import date
from pathlib import Path
from typing import List, Optional, Union

from barcode import Code128
from barcode.writer import ImageWriter
from PIL import Image, ImageDraw, ImageFont

from backend.app.config import settings
from backend.app.desktop import open_directory
from backend.app.constant import PRINT_ORDERS_COMMAND, PRINT_ORDERS_ENABLED
from backend.app.label_settings import get_labels_directory


ORDERS_ROOT = settings.resolved_runtime_dir / "orders"


def _load_label_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")]
    if os.name == "nt":
        windows_directory = Path(os.environ.get("WINDIR", r"C:\Windows"))
        candidates.extend(
            [
                windows_directory / "Fonts" / "arial.ttf",
                windows_directory / "Fonts" / "segoeui.ttf",
            ]
        )

    for font_path in candidates:
        try:
            return ImageFont.truetype(str(font_path), size)
        except (OSError, ValueError):
            continue
    return ImageFont.load_default()


def get_today_orders_directory() -> Path:
    return get_labels_directory(ORDERS_ROOT) / str(date.today())


def open_today_orders_directory() -> str:
    return open_directory(get_today_orders_directory())


def print_today_orders() -> dict:
    orders_directory = get_today_orders_directory()
    label_files = sorted(
        path.resolve()
        for path in orders_directory.glob("*.png")
        if path.is_file()
    ) if orders_directory.is_dir() else []

    if not label_files:
        return {
            "printed": 0,
            "directory": str(orders_directory),
            "printer": PRINT_ORDERS_COMMAND[-1],
            "output": "Нет этикеток для печати за текущий день",
        }

    if not PRINT_ORDERS_ENABLED:
        return {
            "printed": 0,
            "matched_labels": len(label_files),
            "dry_run": True,
            "directory": str(orders_directory),
            "printer": PRINT_ORDERS_COMMAND[-1],
            "output": "DEV-режим: физическая печать отключена",
        }

    lp_executable = shutil.which(PRINT_ORDERS_COMMAND[0])
    if not lp_executable:
        raise RuntimeError("Команда lp не найдена в системе")

    command = [
        lp_executable,
        *PRINT_ORDERS_COMMAND[1:],
        *(str(path) for path in label_files),
    ]

    try:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=60,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        raise RuntimeError(f"Не удалось запустить печать: {error}") from error

    if result.returncode != 0:
        details = (result.stderr or result.stdout or "неизвестная ошибка lp").strip()
        raise RuntimeError(f"Ошибка печати: {details}")

    return {
        "printed": len(label_files),
        "directory": str(orders_directory),
        "printer": PRINT_ORDERS_COMMAND[-1],
        "output": result.stdout.strip(),
    }


def wrap_text(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont, max_width: int) -> List[str]:
    words = (text or "").split()
    if not words:
        return [""]
    lines, cur = [], words[0]
    for w in words[1:]:
        test = f"{cur} {w}"
        bbox = draw.textbbox((0, 0), test, font=font)
        if (bbox[2] - bbox[0]) <= max_width:
            cur = test
        else:
            lines.append(cur)
            cur = w
    lines.append(cur)
    return lines


def _line_heights(draw: ImageDraw.ImageDraw, lines: List[str], font: ImageFont.FreeTypeFont) -> List[int]:
    hs: List[int] = []
    for l in lines:
        bbox = draw.textbbox((0, 0), l, font=font)
        hs.append(bbox[3] - bbox[1])
    return hs


def create_label(
    tracking_num: str,
    item_name: str,
    point: str,
    qty: Optional[Union[int, str]] = None,
    out_dir: Optional[str] = None
) -> str:
    """
    PNG-этикетка 75x120 мм @300 DPI (фиксированный размер),
    большой штрихкод (x2), увеличенный шрифт, весь блок по центру.
    """

    # --- LABEL SIZE 75x120 mm @300dpi ---
    LABEL_W = 885
    LABEL_H = 1417

    # DejaVu Sans используется в Linux, Arial/Segoe UI — в Windows.
    font_main = _load_label_font(34)
    font_order = _load_label_font(42)

    # Размеры оставляем стандартными: python-barcode задаёт их в миллиметрах.
    # Номер ниже мы рисуем самостоятельно, поэтому встроенный текст отключаем.
    writer_opts = {
        "write_text": False,
    }

    buf = io.BytesIO()
    code = Code128(tracking_num, writer=ImageWriter())
    # Передаём настройки непосредственно в write(). Иначе python-barcode
    # повторно применяет свои defaults и возвращает write_text=True,
    # из-за чего под штрихкодом появляется крупный обрезанный номер.
    code.write(buf, options=writer_opts)
    buf.seek(0)
    barcode_img = Image.open(buf).convert("RGB")

    # === ВАЖНО: делаем штрихкод в 2 раза больше ===
    barcode_img = barcode_img.resize(
        (barcode_img.width * 2, barcode_img.height * 2),
        resample=Image.NEAREST
    )

    # Если вдруг не влезает по ширине — ужимаем до рабочей зоны (LABEL_W - 80)
    max_barcode_w = LABEL_W - 80
    if barcode_img.width > max_barcode_w:
        scale = max_barcode_w / float(barcode_img.width)
        new_w = int(barcode_img.width * scale)
        new_h = int(barcode_img.height * scale)
        barcode_img = barcode_img.resize((new_w, new_h), resample=Image.NEAREST)

    # --- Layout params ---
    line_gap = 8
    gap_after_barcode = 18
    gap_between_blocks = 10

    max_text_width = LABEL_W - 80  # по 40px слева/справа

    # probe для измерений
    probe_img = Image.new("RGB", (10, 10), "white")
    draw_probe = ImageDraw.Draw(probe_img)

    # --- Тексты ---
    lines_order_big = [tracking_num]
    lh_order_big = _line_heights(draw_probe, lines_order_big, font_order)
    text_h_order_big = sum(lh_order_big) + (len(lines_order_big) - 1) * line_gap

    lines_name = wrap_text(draw_probe, item_name or "", font_main, max_text_width)
    lh_name = _line_heights(draw_probe, lines_name, font_main)
    text_h_name = sum(lh_name) + (len(lines_name) - 1) * line_gap

    lines_point = wrap_text(draw_probe, point or "", font_main, max_text_width)
    lh_point = _line_heights(draw_probe, lines_point, font_main)
    text_h_point = sum(lh_point) + (len(lines_point) - 1) * line_gap

    qty_text = None
    if qty is not None and str(qty).strip():
        try:
            qty_int = int(str(qty).strip())
            qty_text = f"Количество: {qty_int} шт."
        except ValueError:
            qty_text = f"Количество: {str(qty).strip()}"

    lines_qty: List[str] = wrap_text(draw_probe, qty_text or "", font_main, max_text_width) if qty_text else []
    lh_qty = _line_heights(draw_probe, lines_qty, font_main) if lines_qty else []
    text_h_qty = (sum(lh_qty) + (len(lines_qty) - 1) * line_gap) if lines_qty else 0

    # --- Высота контента для центрирования ---
    content_h = 0
    content_h += barcode_img.height
    content_h += gap_after_barcode
    content_h += text_h_order_big
    content_h += gap_between_blocks
    content_h += text_h_name

    if lines_point and any(l.strip() for l in lines_point):
        content_h += gap_between_blocks
        content_h += text_h_point

    if lines_qty and any(l.strip() for l in lines_qty):
        content_h += gap_between_blocks
        content_h += text_h_qty

    y0 = (LABEL_H - content_h) // 2
    if y0 < 20:
        y0 = 20

    # --- Canvas ---
    canvas = Image.new("RGB", (LABEL_W, LABEL_H), "white")
    draw = ImageDraw.Draw(canvas)

    def draw_centered(text: str, y_pos: int, font: ImageFont.FreeTypeFont) -> int:
        bbox = draw.textbbox((0, 0), text, font=font)
        w = bbox[2] - bbox[0]
        h = bbox[3] - bbox[1]
        x = (LABEL_W - w) // 2
        draw.text((x, y_pos), text, fill="black", font=font)
        return h

    # --- barcode ---
    x_bar = (LABEL_W - barcode_img.width) // 2
    canvas.paste(barcode_img, (x_bar, y0))

    # --- texts ---
    y = y0 + barcode_img.height + gap_after_barcode

    for line in lines_order_big:
        h = draw_centered(line, y, font_order)
        y += h + line_gap

    y += gap_between_blocks

    for line in lines_name:
        h = draw_centered(line, y, font_main)
        y += h + line_gap

    if lines_point and any(l.strip() for l in lines_point):
        y += gap_between_blocks
        for line in lines_point:
            h = draw_centered(line, y, font_main)
            y += h + line_gap

    if lines_qty and any(l.strip() for l in lines_qty):
        y += gap_between_blocks
        for line in lines_qty:
            h = draw_centered(line, y, font_main)
            y += h + line_gap

    os.makedirs(out_dir or ".", exist_ok=True)
    out_path = os.path.join(out_dir or ".", f"{tracking_num}.png")
    canvas.save(out_path)
    return out_path


def create_labels(data: dict) -> str:
    out_dir = str(get_today_orders_directory())
    os.makedirs(out_dir, exist_ok=True)

    for code, val in data.items():
        create_label(
            tracking_num=str(code),
            item_name=val.get("title") or "",
            point=val.get("point") or "",
            qty=val.get("qty"),
            out_dir=out_dir,
        )

    return out_dir
