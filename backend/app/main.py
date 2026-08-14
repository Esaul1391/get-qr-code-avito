
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .routers import router as reviews_router

from .database import Base, engine


Base.metadata.create_all(bind=engine)

def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.app_name,
        version="0.7.0-dev",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Подключаем роутеры HTTP-API
    app.include_router(reviews_router)

    return app


# Экземпляр приложения, который подхватывает uvicorn
app = create_app()
