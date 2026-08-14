from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.models import Product


class ProductsRepo:
    def __init__(self, session: Session):
        self.session = session

    def get_all(self) -> list[Product]:
        stmt = select(Product)
        return self.session.scalars(stmt).all()