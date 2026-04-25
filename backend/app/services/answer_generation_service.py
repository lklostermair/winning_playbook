import time
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

    def generate_answer(self, question: str, contexts: list[AnswerContext]) -> str:
        if not contexts:
            raise AnswerGenerationError("Cannot generate an answer without retrieved context.")
        if not (self.project or self.api_key):
            return build_extractive_answer(contexts)

        response = None
        client = self._client()
        prompt = build_grounded_answer_prompt(question, contexts)
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

    def _client(self) -> genai.Client:
        if self.project:
            return genai.Client(vertexai=True, project=self.project, location=self.location)
        if self.api_key:
            return genai.Client(api_key=self.api_key)
        raise AnswerGenerationError("Gemini answer generation is not configured.")


def build_grounded_answer_prompt(question: str, contexts: list[AnswerContext]) -> str:
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
    return f"""You are a legal playbook assistant.

Answer questions based only on the retrieved playbook context.

Rules:
- Use natural, direct language.
- Be concise: 2 to 4 short sentences unless the user asks for more detail.
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

Retrieved playbook context:
{context_text}
"""


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
