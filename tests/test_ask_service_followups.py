from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT_DIR / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.schemas.chat import ConversationMessage
from app.services.ask_service import (
    build_retrieval_query,
    is_meaningful_question_or_followup,
)


class AskServiceFollowupTest(unittest.TestCase):
    def test_nonsense_followup_is_not_validated_by_previous_context(self) -> None:
        conversation = [
            ConversationMessage(role="user", text="Can we accept unlimited liability?"),
            ConversationMessage(role="assistant", text="No, this is a red line."),
        ]

        self.assertFalse(is_meaningful_question_or_followup("banana", conversation))

    def test_explicit_followup_can_use_previous_question_as_context(self) -> None:
        conversation = [
            ConversationMessage(role="user", text="Can we accept unlimited liability?"),
            ConversationMessage(role="assistant", text="No, this is a red line."),
        ]

        self.assertTrue(is_meaningful_question_or_followup("what about that in Germany?", conversation))
        query = build_retrieval_query("what about that in Germany?", conversation)

        self.assertIn("Current question, primary retrieval intent:", query)
        self.assertIn("Previous user question, only for resolving references:", query)

    def test_standalone_question_does_not_include_history(self) -> None:
        conversation = [
            ConversationMessage(role="user", text="Can we accept unlimited liability?"),
        ]

        question = "Can we accept unilateral termination?"

        self.assertEqual(build_retrieval_query(question, conversation), question)


if __name__ == "__main__":
    unittest.main()
