from pydantic.v1 import BaseSettings


class Settings(BaseSettings):
    PROJECT_NAME: str = "Varavu Selavu Service"
    VERSION: str = "1.0.0"
    DEBUG: bool = True

    class Config:
        env_file = ".env"
