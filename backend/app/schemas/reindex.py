from typing import Literal

from pydantic import BaseModel

ReindexStatus = Literal["complete", "queued", "failed"]


class ReindexRequest(BaseModel):
    playbook_id: str


class ReindexResponse(BaseModel):
    playbook_id: str
    chunks_indexed: int
    status: ReindexStatus
