from fastapi import APIRouter, HTTPException, status

from app.core.config import get_settings
from app.schemas.playbook import (
    ListPlaybooksResponse,
    PlaybookRulesResponse,
    PlaybookSummary,
    RuleDetailResponse,
)
from app.services.vault_service import RuleNotFoundError, VaultService

router = APIRouter(tags=["playbooks"])


def get_vault_service() -> VaultService:
    return VaultService(get_settings().vault_dir)


@router.get("/playbooks", response_model=ListPlaybooksResponse)
async def list_playbooks() -> ListPlaybooksResponse:
    playbooks = get_vault_service().list_playbooks()
    if not playbooks:
        playbooks = [
            PlaybookSummary(
                playbook_id=get_settings().default_playbook_id,
                name="NDA Playbook",
                description="Default playbook workspace. Seed data will populate this in WP3.",
            )
        ]
    return ListPlaybooksResponse(playbooks=playbooks)


@router.get("/playbooks/{playbook_id}/rules", response_model=PlaybookRulesResponse)
async def list_rules(playbook_id: str) -> PlaybookRulesResponse:
    return PlaybookRulesResponse(playbook_id=playbook_id, rules=get_vault_service().list_rules(playbook_id))


@router.get("/playbooks/{playbook_id}/rules/{rule_id}", response_model=RuleDetailResponse)
async def get_rule(playbook_id: str, rule_id: str) -> RuleDetailResponse:
    vault = get_vault_service()
    try:
        rule = vault.read_rule(playbook_id, rule_id)
        markdown = vault.read_rule_markdown(playbook_id, rule_id)
    except RuleNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return RuleDetailResponse(playbook_id=playbook_id, rule=rule, markdown=markdown)
