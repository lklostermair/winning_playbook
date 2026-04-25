from dataclasses import dataclass
from pathlib import Path

CORE_INDEX_SECTIONS = frozenset(
    {
        "Standard Position",
        "Fallback Position",
        "Red Line",
        "Escalation Logic",
        "Suggested Language",
    }
)
TOPIC_SECTION = "Topic"


@dataclass(frozen=True)
class MarkdownChunk:
    chunk_id: str
    playbook_id: str
    rule_id: str
    topic: str
    section: str
    text: str
    source_file: Path


def chunk_rule_markdown(
    playbook_id: str,
    rule_id: str,
    source_file: Path,
    markdown: str,
    include_sections: frozenset[str] | None = None,
) -> list[MarkdownChunk]:
    lines = markdown.splitlines()
    topic = rule_id
    sections: list[tuple[str, list[str]]] = []
    current_section: str | None = None
    current_lines: list[str] = []

    for line in lines:
        if line.startswith("# "):
            topic = line.removeprefix("# ").strip() or rule_id
            continue
        if line.startswith("## "):
            if current_section is not None:
                sections.append((current_section, current_lines))
            current_section = line.removeprefix("## ").strip()
            current_lines = []
            continue
        if current_section is not None:
            current_lines.append(line)

    if current_section is not None:
        sections.append((current_section, current_lines))

    chunks = []
    for section, body_lines in sections:
        if include_sections is not None and section not in include_sections:
            continue
        body = "\n".join(body_lines).strip()
        if not body or body == "_Not specified._" or section == "Metadata":
            continue
        text = f"{topic}\n{section}\n{body}"
        chunks.append(
            MarkdownChunk(
                chunk_id=f"{playbook_id}:{rule_id}:{slugify_section(section)}",
                playbook_id=playbook_id,
                rule_id=rule_id,
                topic=topic,
                section=section,
                text=text,
                source_file=source_file,
            )
        )
    return chunks


def chunk_rule_topic_markdown(
    playbook_id: str,
    rule_id: str,
    source_file: Path,
    markdown: str,
) -> list[MarkdownChunk]:
    topic = rule_id
    body_lines = []
    in_metadata = False
    for line in markdown.splitlines():
        if line.startswith("# "):
            topic = line.removeprefix("# ").strip() or rule_id
        if line.startswith("## Metadata"):
            in_metadata = True
            continue
        if not in_metadata:
            body_lines.append(line)

    body = "\n".join(body_lines).strip()
    if not body:
        return []
    return [
        MarkdownChunk(
            chunk_id=f"{playbook_id}:{rule_id}:topic",
            playbook_id=playbook_id,
            rule_id=rule_id,
            topic=topic,
            section=TOPIC_SECTION,
            text=body,
            source_file=source_file,
        )
    ]


def slugify_section(section: str) -> str:
    return "".join(character.lower() if character.isalnum() else "-" for character in section).strip("-")
