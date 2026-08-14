from sqlalchemy import String, Integer, Date
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class Product(Base):
    __tablename__ = 'Products'

    id: Mapped[int] = mapped_column(primary_key=True, index=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    source: Mapped[str] = mapped_column(String(100), nullable=False)
    at_create: Mapped[int] = mapped_column(Date, nullable=True)
    seller: Mapped[str] = mapped_column(String(100), nullable=True)
