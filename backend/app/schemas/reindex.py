from typing import Literal

from pydantic import BaseModel

from app.schemas.ids import SafeId

ReindexStatus = Literal["complete", "queued", "failed"]


class ReindexRequest(BaseModel):
    playbook_id: SafeId


class ReindexResponse(BaseModel):
    playbook_id: SafeId
    chunks_indexed: int
    status: ReindexStatus
