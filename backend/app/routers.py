from fastapi import APIRouter, Body, HTTPException
from fastapi.params import Depends
from sqlalchemy.orm import Session

from backend.app.db_depends import get_db
from backend.app.constant import (
    DEV_BACKEND_INSTANCE,
    DEV_BACKEND_PORT,
    PRINT_ORDERS_ENABLED,
)
from backend.app.schemas import (
    CitySettingsPayload,
    LabelSettingsPayload,
    ListingsSyncPayload,
)
from backend.app.service import (
    create_qr_codes,
    get_collect_data,
    open_collected_orders_directory,
    open_synced_listings_directory,
    print_search_orders,
    read_city_settings,
    read_label_settings,
    save_city_settings,
    save_label_settings,
    sync_listing_cities,
)

router = APIRouter(prefix="/parse", tags=["parse"])


@router.get("/ping")
def ping():
    """
    Временный healthcheck, чтобы проверить, что backend жив.
    """
    return {
        "status": "ok",
        "instance": DEV_BACKEND_INSTANCE,
        "port": DEV_BACKEND_PORT,
        "print_enabled": PRINT_ORDERS_ENABLED,
    }

@router.post("/code_bild")
def bild_code(data_order = Body(...)):
    print(data_order)
    result = create_qr_codes(data_order)
    return {"ok": True, **result}


@router.post("/listings/sync")
def sync_listings(payload: ListingsSyncPayload = Body(...)):
    return {"ok": True, **sync_listing_cities(payload)}


@router.get("/city-settings")
def get_city_settings():
    return read_city_settings()


@router.post("/city-settings")
def set_city_settings(payload: CitySettingsPayload = Body(...)):
    try:
        return {"ok": True, **save_city_settings(payload)}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.get("/labels/settings")
def get_label_settings():
    return read_label_settings()


@router.post("/labels/settings")
def set_label_settings(payload: LabelSettingsPayload = Body(...)):
    try:
        return {"ok": True, **save_label_settings(payload)}
    except (ValueError, OSError) as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/listings/open-directory")
def open_listings_folder():
    try:
        return {"ok": True, **open_synced_listings_directory()}
    except RuntimeError as error:
        raise HTTPException(status_code=500, detail=str(error)) from error


@router.post("/orders/open-directory")
def open_orders_folder():
    try:
        return {"ok": True, **open_collected_orders_directory()}
    except RuntimeError as error:
        raise HTTPException(status_code=500, detail=str(error)) from error


@router.get("/get_collect_data")
def get_data(db: Session = Depends(get_db)):
    res = get_collect_data(db)
    return res

@router.post("/print/orders")
def print_labels():
    try:
        return {"ok": True, **print_search_orders()}
    except RuntimeError as error:
        raise HTTPException(status_code=500, detail=str(error)) from error
