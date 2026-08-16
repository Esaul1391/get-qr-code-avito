from datetime import date
from pydantic import BaseModel, Field


class ProductSchema(BaseModel):
    name: str
    quantity: int
    source: str
    at_create: date | None = None
    seller: str | None = None


class ListingHtmlBlock(BaseModel):
    html: str
    marker: str | None = None


class ListingsSyncPayload(BaseModel):
    source: str | None = "avito"
    collectedAt: int | None = None
    pageUrl: str | None = None
    listings: list[ListingHtmlBlock] = Field(default_factory=list)


class CitySettingsPayload(BaseModel):
    filter_enabled: bool = False
    selected_city: str = "Москва"


class LabelSettingsPayload(BaseModel):
    labels_directory: str | None = None
