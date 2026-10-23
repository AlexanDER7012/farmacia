from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",          
    )

    DATABASE_URL: str
    DB_ECHO: bool = False       

    SECRET_KEY: str = Field(min_length=32)
    ALGORITHM: str = "HS256"

    SESSION_INACTIVITY_MINUTES: int = Field(15, ge=1)
    SESSION_MAX_HOURS: int = Field(12, ge=1)
    COOKIE_NAME: str = "farmacia_session"
    COOKIE_SECURE: bool = False  

    MAX_LOGIN_ATTEMPTS: int = Field(5, ge=1)
    LOCKOUT_MINUTES: int = Field(15, ge=1)
    RECOVERY_CODE_MINUTES: int = Field(15, ge=1)

    FRONTEND_ORIGIN: str = "http://localhost:8000"

settings = Settings()