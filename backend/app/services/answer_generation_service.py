import time
import json
from dataclasses import dataclass

from google import genai
from google.genai import errors, types


class AnswerGenerationError(RuntimeError):
    pass


@dataclass(frozen=True)
class AnswerContext:
    source_id: str
    rule_id: str
    section: str
    score: float
    text: str


@dataclass(frozen=True)
class ConversationTurn:
    role: str
    text: str


class GeminiAnswerGenerationService:
    def __init__(
        self,
        project: str | None,
        location: str,
        model: str,
        api_key: str | None = None,
        temperature: float = 0.2,
    ) -> None:
        self.project = project
        self.location = location
        self.model = model
        self.api_key = api_key
        self.temperature = temperature

    def generate_answer(
        self,
        question: str,
        contexts: list[AnswerContext],
        conversation: list[ConversationTurn] | None = None,
    ) -> str:
        if not contexts:
            raise AnswerGenerationError("Cannot generate an answer without retrieved context.")
        if not (self.project or self.api_key):
            return build_extractive_answer(contexts)

        response = None
        client = self._client()
        prompt = build_grounded_answer_prompt(question, contexts, conversation or [])
        for attempt in range(4):
            try:
                response = client.models.generate_content(
                    model=self.model,
                    contents=prompt,
                    config=types.GenerateContentConfig(temperature=self.temperature),
                )
                break
            except errors.APIError as exc:
                if getattr(exc, "code", None) != 429 or attempt == 3:
                    return build_extractive_answer(contexts)
                time.sleep(2**attempt)

        if response is None or not response.text:
            return build_extractive_answer(contexts)
        return response.text.strip()

    def generate_chat_title(self, question: str) -> str:
        fallback = build_chat_title_fallback(question)
        if not (self.project or self.api_key):
            return fallback

        response = None
        client = self._client()
        for attempt in range(3):
            try:
                response = client.models.generate_content(
                    model=self.model,
                    contents=build_chat_title_prompt(question),
                    config=types.GenerateContentConfig(temperature=0.4),
                )
                break
            except errors.APIError as exc:
                if getattr(exc, "code", None) != 429 or attempt == 2:
                    return fallback
                time.sleep(2**attempt)

        if response is None or not response.text:
            return fallback
        return clean_chat_title(response.text, fallback)

    def generate_rule_update_draft(self, rule_markdown: str, instruction: str) -> dict[str, str]:
        if not (self.project or self.api_key):
            raise AnswerGenerationError("Gemini rule update drafting is not configured.")

        response = None
        client = self._client()
        for attempt in range(3):
            try:
                response = client.models.generate_content(
                    model=self.model,
                    contents=build_rule_update_draft_prompt(rule_markdown, instruction),
                    config=types.GenerateContentConfig(
                        temperature=0.3,
                        response_mime_type="application/json",
                    ),
                )
                break
            except errors.APIError as exc:
                if getattr(exc, "code", None) != 429 or attempt == 2:
                    raise AnswerGenerationError(f"Could not draft rule update: {exc}") from exc
                time.sleep(2**attempt)

        if response is None or not response.text:
            raise AnswerGenerationError("Gemini returned an empty rule update draft.")
        return parse_rule_update_draft(response.text)

    def generate_proposed_updates_overview(
        self,
        rule_markdown: str,
        updates: list[dict[str, str]],
    ) -> str:
        fallback = build_proposed_updates_overview_fallback(updates)
        if not (self.project or self.api_key):
            return fallback

        response = None
        client = self._client()
        for attempt in range(3):
            try:
                response = client.models.generate_content(
                    model=self.model,
                    contents=build_proposed_updates_overview_prompt(
                        rule_markdown,
                        updates,
                    ),
                    config=types.GenerateContentConfig(temperature=0.2),
                )
                break
            except errors.APIError:
                if attempt == 2:
                    return fallback
                time.sleep(2**attempt)

        if response is None or not response.text:
            return fallback
        return clean_proposed_updates_overview(response.text, fallback)

    def _client(self) -> genai.Client:
        if self.project:
            return genai.Client(vertexai=True, project=self.project, location=self.location)
        if self.api_key:
            return genai.Client(api_key=self.api_key)
        raise AnswerGenerationError("Gemini answer generation is not configured.")


def build_grounded_answer_prompt(
    question: str,
    contexts: list[AnswerContext],
    conversation: list[ConversationTurn],
) -> str:
    context_text = "\n\n".join(
        (
            f"[{context.source_id}]\n"
            f"Rule: {context.rule_id}\n"
            f"Section: {context.section}\n"
            f"Retrieval score: {context.score:.3f}\n"
            f"Text:\n{context.text}"
        )
        for context in contexts
    )
    conversation_text = build_conversation_context(conversation)
    return f"""You are a legal playbook assistant.

Answer questions based only on the retrieved playbook context.

Rules:
- Use natural, direct language.
- Be concise: 2 to 4 short sentences unless the user asks for more detail.
- Use the prior conversation only to understand pronouns, references, and follow-up intent.
- Do not treat prior assistant answers as legal authority; retrieved playbook context is controlling.
- Do not mechanically list playbook section names unless that makes the answer clearer.
- For yes/no acceptability questions, give a clear recommendation first.
- Use the whole retrieved topic to infer the practical recommendation.
- Treat red lines and escalation logic as controlling over standard/default positions.
- Do not say a clause is acceptable merely because the standard position describes a legal default.
- Do not invent legal positions or facts.
- If the context does not answer the question, say the playbook does not contain enough information.
- Do not cite sources inline; source metadata is returned separately by the API.

User question:
{question}

Prior conversation:
{conversation_text}

Retrieved playbook context:
{context_text}
"""


def build_conversation_context(conversation: list[ConversationTurn], max_turns: int = 8) -> str:
    if not conversation:
        return "_No prior conversation._"
    recent_turns = conversation[-max_turns:]
    lines = []
    for turn in recent_turns:
        role = "User" if turn.role == "user" else "Assistant"
        text = " ".join(turn.text.split())
        if len(text) > 700:
            text = text[:697].rstrip() + "..."
        lines.append(f"{role}: {text}")
    return "\n".join(lines)


def build_chat_title_prompt(question: str) -> str:
    return f"""Create a short workspace title for this legal playbook question.

Rules:
- Return only the title.
- Use 2 to 5 words.
- Be specific to the user's question.
- Do not use quotes, punctuation, or labels.
- Do not answer the question.

Question:
{question}
"""


def build_rule_update_draft_prompt(rule_markdown: str, instruction: str) -> str:
    return f"""You are drafting a precise legal playbook rule update.

Return only JSON with these exact keys:
- "section": one of "Standard Position", "Fallback Position", "Red Line", "Escalation Logic", "Suggested Language"
- "reason": concise explanation for the change
- "new_text": replacement text for that one section

Rules:
- Draft only one section update.
- Keep the replacement concise, natural, and operational.
- Preserve the rule's existing style.
- Do not invent facts outside the existing rule and the user's instruction.
- If the user asks for a broad update, choose the section that should change most directly.

User instruction:
{instruction}

Current rule:
{rule_markdown}
"""


def build_proposed_updates_overview_prompt(
    rule_markdown: str,
    updates: list[dict[str, str]],
) -> str:
    updates_text = "\n\n".join(
        (
            f"Update: {update['update_id']}\n"
            f"Status: {update['status']}\n"
            f"Section: {update['section']}\n"
            f"Reason: {update['reason']}\n"
            f"New text: {update['new_text']}"
        )
        for update in updates
    )
    return f"""Write one overarching proposal overview for all pending updates on this legal playbook rule.

Rules:
- Return 1 to 2 concise sentences.
- Describe the main themes the proposals cover, then the combined policy direction or admin decision point.
- Do not summarize each proposal separately.
- Do not enumerate, number, quote, or mention individual update IDs.
- Write as one combined overview, not as a list.
- Do not invent facts outside the current rule and proposed updates.

Proposed updates:
{updates_text or "_No proposed updates._"}

Current rule:
{rule_markdown}
"""


def parse_rule_update_draft(text: str) -> dict[str, str]:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        cleaned = cleaned.removeprefix("json").strip()
    try:
        payload = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise AnswerGenerationError("Gemini returned invalid JSON for the rule update draft.") from exc

    section = str(payload.get("section", "")).strip()
    reason = str(payload.get("reason", "")).strip()
    new_text = str(payload.get("new_text", "")).strip()
    if section not in {
        "Standard Position",
        "Fallback Position",
        "Red Line",
        "Escalation Logic",
        "Suggested Language",
    }:
        raise AnswerGenerationError("Gemini returned an unsupported rule section.")
    if not reason or not new_text:
        raise AnswerGenerationError("Gemini returned an incomplete rule update draft.")
    return {"section": section, "reason": reason, "new_text": new_text}


def build_proposed_updates_overview_fallback(updates: list[dict[str, str]]) -> str:
    if not updates:
        return "No proposals have been submitted for this rule yet."
    pending_count = sum(1 for update in updates if update["status"] == "pending")
    sections = sorted({update["section"] for update in updates if update["section"]})
    section_text = human_join(sections[:4])
    reasons = [summarize_reason(update["reason"]) for update in updates if update.get("reason")]
    theme_text = human_join(unique_nonempty(reasons)[:3])
    return (
        f"Across {pending_count} pending proposal(s), the themes are {theme_text or 'policy clarification'} "
        f"across {section_text or 'the rule text'}, giving admin a consolidated review point."
    )


def summarize_reason(reason: str) -> str:
    cleaned = " ".join(reason.strip().rstrip(".").split())
    lowered = cleaned.lower()
    if lowered.startswith("clarify "):
        return cleaned
    if lowered.startswith("add "):
        return cleaned
    if lowered.startswith("limit "):
        return cleaned
    if lowered.startswith("constrain "):
        return cleaned
    if len(cleaned) > 72:
        cleaned = cleaned[:69].rstrip() + "..."
    return cleaned


def unique_nonempty(values: list[str]) -> list[str]:
    seen = set()
    result = []
    for value in values:
        normalized = value.lower()
        if not value or normalized in seen:
            continue
        seen.add(normalized)
        result.append(value)
    return result


def human_join(values: list[str]) -> str:
    if not values:
        return ""
    if len(values) == 1:
        return values[0]
    if len(values) == 2:
        return f"{values[0]} and {values[1]}"
    return f"{', '.join(values[:-1])}, and {values[-1]}"


def clean_proposed_updates_overview(text: str, fallback: str) -> str:
    cleaned = " ".join(text.strip().strip("\"'`“”‘’").split())
    if not cleaned:
        return fallback
    if len(cleaned) > 220:
        cleaned = cleaned[:217].rstrip() + "..."
    return cleaned


def build_chat_title_fallback(question: str) -> str:
    words = [word.strip(".,;:!?()[]{}\"'") for word in question.split()]
    title = " ".join(word for word in words if word)[:48].strip()
    return title or "New chat"


def clean_chat_title(title: str, fallback: str) -> str:
    first_line = title.strip().splitlines()[0] if title.strip() else ""
    cleaned = first_line.strip().strip("\"'`“”‘’").rstrip(".,;:!?")
    if not cleaned:
        return fallback
    if len(cleaned) > 48:
        cleaned = cleaned[:45].rstrip() + "..."
    return cleaned


def build_extractive_answer(contexts: list[AnswerContext]) -> str:
    top = contexts[0]
    red_line = extract_markdown_section(top.text, "Red Line")
    escalation = extract_markdown_section(top.text, "Escalation Logic")
    fallback = extract_markdown_section(top.text, "Fallback Position")
    if red_line:
        answer = red_line
        if escalation:
            answer = f"{answer} Escalate when: {escalation}"
        return answer
    if fallback:
        return fallback
    return _body_without_heading(top.text)


def _body_without_heading(text: str) -> str:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if len(lines) <= 2:
        return " ".join(lines)
    return " ".join(lines[2:])


def extract_markdown_section(markdown: str, section: str) -> str:
    lines = markdown.splitlines()
    current_section: str | None = None
    body: list[str] = []
    for line in lines:
        if line.startswith("## "):
            if current_section == section:
                break
            current_section = line.removeprefix("## ").strip()
            continue
        if current_section == section:
            stripped = line.strip()
            if stripped and stripped != "_Not specified._":
                body.append(stripped)
    return " ".join(body)
