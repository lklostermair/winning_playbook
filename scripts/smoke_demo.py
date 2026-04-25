from __future__ import annotations

import argparse
from datetime import datetime, timezone

import httpx


def main() -> None:
    parser = argparse.ArgumentParser(description="Run a local API smoke test for the demo flow.")
    parser.add_argument("--base-url", default="http://localhost:8000")
    parser.add_argument("--playbook-id", default="nda")
    parser.add_argument("--question", default="Can we accept unlimited liability?")
    parser.add_argument(
        "--write-review",
        action="store_true",
        help="also create and reject a temporary proposed update.",
    )
    args = parser.parse_args()

    with httpx.Client(base_url=args.base_url, timeout=60.0) as client:
        health = require_ok(client.get("/health"), "health").json()
        print(f"[ok] health: {health['status']}")

        playbooks = require_ok(client.get("/playbooks"), "playbooks").json()["playbooks"]
        if not any(playbook["playbook_id"] == args.playbook_id for playbook in playbooks):
            raise SystemExit(f"Playbook `{args.playbook_id}` was not returned by /playbooks.")
        print(f"[ok] playbooks: {len(playbooks)} available")

        rules = require_ok(
            client.get(f"/playbooks/{args.playbook_id}/rules"),
            "rules",
        ).json()["rules"]
        if not rules:
            raise SystemExit(f"Playbook `{args.playbook_id}` has no rules.")
        print(f"[ok] rules: {len(rules)} available")

        answer = require_ok(
            client.post(
                "/ask",
                json={
                    "playbook_id": args.playbook_id,
                    "task_type": "ask_playbook",
                    "question": args.question,
                },
            ),
            "ask",
        ).json()
        if not answer["sources"]:
            raise SystemExit("Ask response had no sources.")
        print(
            "[ok] ask: "
            f"{answer['confidence']['label']} confidence, {len(answer['sources'])} source(s)"
        )

        if args.write_review:
            smoke_review_flow(client, args.playbook_id, rules[0]["rule_id"])


def smoke_review_flow(client: httpx.Client, playbook_id: str, rule_id: str) -> None:
    marker = datetime.now(timezone.utc).isoformat(timespec="seconds")
    created = require_ok(
        client.post(
            "/updates",
            json={
                "playbook_id": playbook_id,
                "target_rule_id": rule_id,
                "reason": f"Smoke test proposal generated at {marker}",
                "proposed_change": {
                    "section": "Rationale",
                    "new_text": f"Smoke test proposal. Do not approve. Generated at {marker}.",
                },
                "suggested_by": "smoke-test",
            },
        ),
        "create proposed update",
    ).json()
    update_id = created["update_id"]
    print(f"[ok] proposed update created: {update_id}")

    require_ok(
        client.post(
            f"/updates/{update_id}/reject",
            json={"rejected_by": "smoke-test", "reason": "Smoke test cleanup."},
        ),
        "reject proposed update",
    )
    print(f"[ok] proposed update rejected: {update_id}")


def require_ok(response: httpx.Response, label: str) -> httpx.Response:
    if response.status_code >= 400:
        raise SystemExit(f"{label} failed: {response.status_code} {response.text}")
    return response


if __name__ == "__main__":
    main()
