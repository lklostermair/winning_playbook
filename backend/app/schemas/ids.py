import re
from typing import Annotated

from pydantic import Field

ID_PATTERN = r"^[a-z0-9][a-z0-9-]{0,80}$"
UPDATE_ID_PATTERN = r"^[a-z0-9][a-z0-9_-]{0,100}$"
ID_RE = re.compile(ID_PATTERN)
UPDATE_ID_RE = re.compile(UPDATE_ID_PATTERN)

SafeId = Annotated[str, Field(pattern=ID_PATTERN)]
SafeUpdateId = Annotated[str, Field(pattern=UPDATE_ID_PATTERN)]


def is_safe_id(value: str) -> bool:
    return bool(ID_RE.fullmatch(value))


def is_safe_update_id(value: str) -> bool:
    return bool(UPDATE_ID_RE.fullmatch(value))
