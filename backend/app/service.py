from sqlalchemy.orm import Session

from backend.app.qr_code_adapter import (
    create_labels,
    open_today_orders_directory,
    print_today_orders,
)
from backend.app.listing_cities import (
    filter_orders_by_saved_city,
    get_public_city_settings,
    open_listings_directory,
    save_listing_blocks,
    update_city_settings,
)
from backend.app.label_settings import (
    get_public_label_settings,
    update_labels_directory,
)
from backend.app.repositories import ProductsRepo
from backend.app.schemas import (
    CitySettingsPayload,
    LabelSettingsPayload,
    ListingsSyncPayload,
    ProductSchema,
)


def create_qr_codes(data: dict):
    orders = (data.get('orders_data') or {}) if isinstance(data, dict) else {}
    if not isinstance(orders, dict):
        orders = {}
    selected_orders, result = filter_orders_by_saved_city(orders)
    result["output_dir"] = create_labels(selected_orders) if selected_orders else None
    return result


def sync_listing_cities(data: ListingsSyncPayload):
    blocks = [listing.model_dump() for listing in data.listings]
    return save_listing_blocks(blocks, source_page_url=data.pageUrl)


def read_city_settings():
    return get_public_city_settings()


def save_city_settings(data: CitySettingsPayload):
    return update_city_settings(data.filter_enabled, data.selected_city)


def read_label_settings():
    return get_public_label_settings()


def save_label_settings(data: LabelSettingsPayload):
    return update_labels_directory(data.labels_directory)


def open_synced_listings_directory():
    return {"directory": open_listings_directory()}


def open_collected_orders_directory():
    return {"directory": open_today_orders_directory()}


def get_collect_data(db: Session) -> list[ProductSchema]:
    products = ProductsRepo(db).get_all()
    return [ProductSchema.model_validate(p) for p in products]


def print_search_orders():
    return print_today_orders()
