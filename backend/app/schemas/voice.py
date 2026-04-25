from pydantic import BaseModel, Field


class VoiceTranscriptionResponse(BaseModel):
    text: str


class VoiceWarmupResponse(BaseModel):
    status: str


class VoiceSpeakRequest(BaseModel):
    text: str = Field(min_length=1, max_length=2500)
