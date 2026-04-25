from fastapi import APIRouter

from app.schemas.playbook import ListPlaybooksResponse, PlaybookRulesResponse

router = APIRouter(tags=["playbooks"])


@router.get("/playbooks", response_model=ListPlaybooksResponse)
async def list_playbooks() -> ListPlaybooksResponse:
    return ListPlaybooksResponse(
        playbooks=[
            {
                "playbook_id": "nda",
                "name": "NDA Playbook",
                "description": "Seed playbook for confidentiality and non-disclosure agreements.",
            }
        ]
    )


@router.get("/playbooks/{playbook_id}/rules", response_model=PlaybookRulesResponse)
async def list_rules(playbook_id: str) -> PlaybookRulesResponse:
    return PlaybookRulesResponse(
        playbook_id=playbook_id,
        rules=[
            {
                "rule_id": "liability-for-correctness",
                "topic": "Liability for Correctness",
                "status": "approved",
            },
            {
                "rule_id": "contractual-penalty",
                "topic": "Contractual Penalty",
                "status": "approved",
            },
            {
                "rule_id": "confidentiality-period",
                "topic": "Contract Term / Confidentiality Period",
                "status": "approved",
            },
        ],
    )
