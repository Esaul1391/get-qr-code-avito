# backend/app/config.py
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


PROJECT_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    cors_origins: list[str] = ["*"]
    app_name: str = "Codes Harvester DEV Backend"
    runtime_dir: Path = PROJECT_ROOT / ".runtime" / "dev"
    database_url: str | None = None
    print_enabled: bool = False
    printer_name: str = "XP-DT426B"
    sql_echo: bool = False

    model_config = SettingsConfigDict(
        env_file=PROJECT_ROOT / ".env",
        env_file_encoding="utf-8",
        env_prefix="AVITO_DEV_",
        extra="ignore",
    )

    @property
    def resolved_runtime_dir(self) -> Path:
        return self.runtime_dir.expanduser().resolve()


settings = Settings()
