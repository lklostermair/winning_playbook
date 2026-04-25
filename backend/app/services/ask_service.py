import re
from typing import Any

from app.schemas.chat import AskQuestionResponse, Confidence, ConversationMessage
from app.schemas.source import GitMetadata, SourceReference
from app.services.answer_generation_service import (
    AnswerContext,
    ConversationTurn,
    GeminiAnswerGenerationService,
)
from app.services.retrieval_service import RetrievalService

MIN_RETRIEVAL_SCORE = 0.52
TOP_K = 5
ANSWER_SECTION_PRIORITY = {
    "Topic": 0,
    "Red Line": 0,
    "Escalation Logic": 1,
    "Standard Position": 2,
    "Fallback Position": 3,
}
QUESTION_STOPWORDS = frozenset(
    {
        "about",
        "accept",
        "after",
        "before",
        "does",
        "have",
        "that",
        "this",
        "what",
        "when",
        "where",
        "which",
        "with",
        "would",
        "could",
        "should",
        "playbook",
        "contract",
        "clause",
    }
)
FOLLOW_UP_TERMS = frozenset(
    {
        "also",
        "and",
        "same",
        "previous",
        "before",
        "above",
        "there",
        "that",
        "this",
        "it",
        "they",
        "them",
        "those",
        "these",
    }
)
QUESTION_TERMS = frozenset(
    {
        "can",
        "could",
        "should",
        "may",
        "must",
        "what",
        "when",
        "where",
        "which",
        "who",
        "why",
        "how",
        "is",
        "are",
        "does",
        "do",
    }
)


class AskService:
    def __init__(
        self,
        retrieval_service: RetrievalService,
        answer_generation_service: GeminiAnswerGenerationService,
    ) -> None:
        self.retrieval_service = retrieval_service
        self.answer_generation_service = answer_generation_service

    def ask(
        self,
        playbook_ids: list[str],
        question: str,
        conversation: list[ConversationMessage] | None = None,
    ) -> AskQuestionResponse:
        conversation = conversation or []
        playbook_ids = dedupe_playbook_ids(playbook_ids)
        if not playbook_ids:
            raise ValueError("Select at least one playbook for retrieval.")
        if not is_meaningful_question_or_followup(question, conversation):
            return AskQuestionResponse(
                answer="I could not tell what you want to check. Please ask a concrete playbook question.",
                confidence=Confidence(
                    score=0.0,
                    label="low",
                    reason="The current question was not specific enough to search the selected playbooks.",
                ),
                sources=[],
            )

        retrieval_query = build_retrieval_query(question, conversation)
        hits = self.retrieval_service.search_playbooks(playbook_ids, retrieval_query, top_k=TOP_K)
        if not hits:
            for playbook_id in playbook_ids:
                self.retrieval_service.reindex_playbook(playbook_id)
            hits = self.retrieval_service.search_playbooks(playbook_ids, retrieval_query, top_k=TOP_K)

        relevant_hits = [
            hit
            for hit in hits
            if float(hit["score"]) >= MIN_RETRIEVAL_SCORE
            and has_question_term_overlap(retrieval_query, str(hit["document"]))
        ]
        confidence = calculate_confidence(relevant_hits)
        sources = [source_reference_from_hit(hit) for hit in relevant_hits]

        if confidence.label == "low":
            return AskQuestionResponse(
                answer=(
                    "The playbook does not contain enough source-supported guidance to answer "
                    "that question. Please check the playbook source or ask legal to add a rule."
                ),
                confidence=confidence,
                sources=sources,
            )

        answer_hits = sorted(
            relevant_hits,
            key=lambda hit: ANSWER_SECTION_PRIORITY.get(str(hit["metadata"].get("section", "")), 99),
        )
        contexts = [answer_context_from_hit(index + 1, hit) for index, hit in enumerate(answer_hits)]
        answer = self.answer_generation_service.generate_answer(
            question,
            contexts,
            [ConversationTurn(role=message.role, text=message.text) for message in conversation],
        )
        return AskQuestionResponse(answer=answer, confidence=confidence, sources=sources)


def build_retrieval_query(question: str, conversation: list[ConversationMessage]) -> str:
    if not should_use_conversation_context(question, conversation):
        return question
    previous_user_question = [message.text for message in conversation if message.role == "user"][-1:]
    if not previous_user_question:
        return question
    return (
        f"Current question, primary retrieval intent:\n{question}\n\n"
        f"Previous user question, only for resolving references:\n{previous_user_question[0]}"
    )


def is_meaningful_question_or_followup(question: str, conversation: list[ConversationMessage]) -> bool:
    terms = significant_terms(question)
    if len(terms) >= 2:
        return True
    normalized_words = words(question)
    has_question_shape = "?" in question or bool(normalized_words.intersection(QUESTION_TERMS))
    if len(terms) >= 1 and has_question_shape:
        return True
    return should_use_conversation_context(question, conversation) and len(terms) >= 1


def should_use_conversation_context(question: str, conversation: list[ConversationMessage]) -> bool:
    if not conversation:
        return False
    normalized_words = words(question)
    if "?" in question and len(significant_terms(question)) >= 2:
        return False
    return bool(normalized_words.intersection(FOLLOW_UP_TERMS))


def dedupe_playbook_ids(playbook_ids: list[str]) -> list[str]:
    seen: set[str] = set()
    deduped: list[str] = []
    for playbook_id in playbook_ids:
        normalized = playbook_id.strip()
        if normalized and normalized not in seen:
            seen.add(normalized)
            deduped.append(normalized)
    return deduped


def calculate_confidence(hits: list[dict[str, Any]]) -> Confidence:
    if not hits:
        return Confidence(
            score=0.0,
            label="low",
            reason="No retrieved playbook source met the minimum relevance threshold.",
        )

    top_score = max(float(hit["score"]) for hit in hits)
    section_names = {str(hit["metadata"].get("section", "")) for hit in hits}
    source_count_bonus = min(len(hits), 3) / 3 * 0.15
    direct_section_bonus = 0.15 if section_names.intersection({"Topic", "Red Line", "Standard Position"}) else 0.0
    score = min(1.0, top_score * 0.8 + source_count_bonus + direct_section_bonus)
    label = "high" if score >= 0.8 else "medium" if score >= 0.55 else "low"

    if label == "high":
        reason = "The retrieved playbook topic directly supports the answer."
    elif label == "medium":
        reason = "The answer is supported by retrieved playbook sections, but source support is limited."
    else:
        reason = "Retrieved playbook context is weak or indirect."
    return Confidence(score=round(score, 3), label=label, reason=reason)


def source_reference_from_hit(hit: dict[str, Any]) -> SourceReference:
    metadata = hit["metadata"]
    return SourceReference(
        playbook_id=str(metadata["playbook_id"]),
        rule_id=str(metadata["rule_id"]),
        file=str(metadata["source_file"]),
        section=str(metadata["section"]),
        snippet=snippet_from_document(str(hit["document"])),
        retrieval_score=round(float(hit["score"]), 3),
        git_metadata=GitMetadata.model_validate(
            {
                "last_changed_by": metadata["last_changed_by"],
                "last_changed_at": metadata["last_changed_at"],
                "last_commit_hash": metadata["last_commit_hash"],
                "last_commit_message": metadata["last_commit_message"],
            }
        ),
    )


def answer_context_from_hit(index: int, hit: dict[str, Any]) -> AnswerContext:
    metadata = hit["metadata"]
    return AnswerContext(
        source_id=f"S{index}",
        rule_id=str(metadata["rule_id"]),
        section=str(metadata["section"]),
        score=float(hit["score"]),
        text=str(hit["document"]),
    )


def snippet_from_document(document: str, max_chars: int = 360) -> str:
    lines = [line.strip() for line in document.splitlines() if line.strip()]
    snippet_lines = [
        line
        for line in lines
        if not line.startswith("#") and not line.startswith("##") and line != "_Not specified._"
    ]
    snippet = " ".join(snippet_lines)
    if len(snippet) <= max_chars:
        return snippet
    return snippet[: max_chars - 3].rstrip() + "..."


def has_question_term_overlap(question: str, document: str) -> bool:
    question_terms = significant_terms(question)
    if not question_terms:
        return False
    document_terms = significant_terms(document)
    expanded_document_terms = set(document_terms)
    if "uncapped" in document_terms:
        expanded_document_terms.add("unlimited")
    if "unlimited" in document_terms:
        expanded_document_terms.add("uncapped")
    return bool(question_terms.intersection(expanded_document_terms))


def significant_terms(text: str) -> set[str]:
    terms = set()
    for term in words(text):
        normalized = term.strip("-")
        if len(normalized) >= 4 and normalized not in QUESTION_STOPWORDS:
            terms.add(normalized)
    return terms


def words(text: str) -> set[str]:
    return {term.strip("-") for term in re.findall(r"[a-zA-Z][a-zA-Z-]{1,}", text.lower())}
