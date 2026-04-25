from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Living Playbook API"
    api_host: str = "0.0.0.0"
    api_port: int = 8000

    vault_dir: Path = Field(default=Path("./vault"), alias="VAULT_DIR")
    data_dir: Path = Field(default=Path("./data"), alias="DATA_DIR")
    chroma_dir: Path = Field(default=Path("./chroma"), alias="CHROMA_DIR")
    default_playbook_id: str = Field(default="nda", alias="DEFAULT_PLAYBOOK_ID")

    openai_api_key: str | None = Field(default=None, alias="OPENAI_API_KEY")
    google_application_credentials: str | None = Field(
        default=None,
        alias="GOOGLE_APPLICATION_CREDENTIALS",
    )
    gemini_model: str = Field(default="gemini-1.5-pro", alias="GEMINI_MODEL")
    openai_embedding_model: str = Field(
        default="text-embedding-3-small",
        alias="OPENAI_EMBEDDING_MODEL",
    )

    def ensure_runtime_directories(self) -> None:
        for directory in (self.vault_dir, self.data_dir, self.chroma_dir):
            directory.mkdir(parents=True, exist_ok=True)


@lru_cache
def get_settings() -> Settings:
    return Settings()
