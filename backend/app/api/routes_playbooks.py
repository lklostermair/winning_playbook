from fastapi import APIRouter, HTTPException, status
from starlette.concurrency import run_in_threadpool

from app.core.config import get_settings
from app.schemas.playbook import (
    ListPlaybooksResponse,
    PlaybookRulesResponse,
    PlaybookSummary,
    RuleDetailResponse,
    RuleSummary,
)
from app.services.git_service import GitService, GitServiceError
from app.services.vault_service import RuleNotFoundError, VaultService

router = APIRouter(tags=["playbooks"])


def get_vault_service() -> VaultService:
    return VaultService(get_settings().vault_dir)


def get_git_service() -> GitService:
    return GitService()


@router.get("/playbooks", response_model=ListPlaybooksResponse)
async def list_playbooks() -> ListPlaybooksResponse:
    playbooks = await run_in_threadpool(get_vault_service().list_playbooks)
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
    vault = get_vault_service()
    git = get_git_service()
    try:
        listed_rules = await run_in_threadpool(vault.list_rules, playbook_id)
        rules = []
        for rule in listed_rules:
            git_metadata = await run_in_threadpool(
                git.get_last_change_metadata,
                vault.rule_markdown_path(playbook_id, rule.rule_id),
            )
            rules.append(
                RuleSummary(
                    rule_id=rule.rule_id,
                    topic=rule.topic,
                    status=rule.status,
                    git_metadata=git_metadata,
                )
            )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except GitServiceError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc
    return PlaybookRulesResponse(playbook_id=playbook_id, rules=rules)


@router.get("/playbooks/{playbook_id}/rules/{rule_id}", response_model=RuleDetailResponse)
async def get_rule(playbook_id: str, rule_id: str) -> RuleDetailResponse:
    vault = get_vault_service()
    try:
        rule = await run_in_threadpool(vault.read_rule, playbook_id, rule_id)
        markdown = await run_in_threadpool(vault.read_rule_markdown, playbook_id, rule_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except RuleNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    try:
        git_metadata = await run_in_threadpool(
            get_git_service().get_last_change_metadata,
            vault.rule_markdown_path(playbook_id, rule_id),
        )
    except GitServiceError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc
    return RuleDetailResponse(
        playbook_id=playbook_id,
        rule=rule,
        markdown=markdown,
        git_metadata=git_metadata,
    )
