from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT_DIR / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.schemas.playbook import PlaybookSummary, RuleTemplate
from app.schemas.update import CreateProposedUpdateRequest, ProposedChange
from app.services.proposed_update_service import ProposedUpdateError, ProposedUpdateService
from app.services.vault_service import VaultService


class ProposedUpdateServiceTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.vault = VaultService(Path(self.temp_dir.name))
        self.vault.write_playbook_manifest(PlaybookSummary(playbook_id="test", name="Test"))
        self.rule = RuleTemplate(
            playbook_id="test",
            rule_id="liability",
            topic="Liability",
            standard_position="Keep liability limited.",
            fallback_positions=["Escalate uncapped liability."],
            red_line="Do not accept unlimited liability.",
            rationale="Protect downside risk.",
            status="approved",
        )
        self.vault.write_rule(self.rule)
        self.service = ProposedUpdateService(self.vault)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_create_reject_update_does_not_change_rule(self) -> None:
        record = self.service.create_update(
            CreateProposedUpdateRequest(
                playbook_id="test",
                target_rule_id="liability",
                reason="Smoke-test change.",
                proposed_change=ProposedChange(
                    section="Rationale",
                    new_text="Updated rationale.",
                ),
                suggested_by="unit-test",
            )
        )

        rejected = self.service.reject_update(record.update_id, "lawyer", "No change needed.")

        self.assertEqual(rejected.status, "rejected")
        self.assertEqual(self.vault.read_rule("test", "liability").rationale, "Protect downside risk.")

    def test_approve_update_changes_json_and_markdown(self) -> None:
        record = self.service.create_update(
            CreateProposedUpdateRequest(
                playbook_id="test",
                target_rule_id="liability",
                reason="Add clearer rationale.",
                proposed_change=ProposedChange(
                    section="Rationale",
                    new_text="Updated rationale.",
                ),
                suggested_by="unit-test",
            )
        )

        approved, rule = self.service.approve_update(record.update_id, "lawyer")

        self.assertEqual(approved.status, "approved")
        self.assertEqual(rule.rationale, "Updated rationale.")
        self.assertIn("Updated rationale.", self.vault.read_rule_markdown("test", "liability"))

    def test_noop_update_is_rejected(self) -> None:
        with self.assertRaises(ProposedUpdateError):
            self.service.create_update(
                CreateProposedUpdateRequest(
                    playbook_id="test",
                    target_rule_id="liability",
                    reason="No-op.",
                    proposed_change=ProposedChange(
                        section="Rationale",
                        new_text="Protect downside risk.",
                    ),
                    suggested_by="unit-test",
                )
            )


if __name__ == "__main__":
    unittest.main()
