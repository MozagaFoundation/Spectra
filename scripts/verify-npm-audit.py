#!/usr/bin/env python3
"""Fail closed on high npm audit findings outside active exceptions."""

from __future__ import annotations

import datetime as dt
import json
import pathlib
import re
import subprocess
import sys
from typing import Any


ROOT = pathlib.Path(__file__).resolve().parents[1]
POLICY = ROOT / "scripts" / "security-allowlist.txt"
AUDIT_COMMAND = ["npm", "audit", "--audit-level=high", "--json"]
LOCKFILE_PATH = "package-lock.json"
GHSA_PATTERN = re.compile(r"/(GHSA-[a-z0-9-]+)$", re.IGNORECASE)
HIGH_SEVERITIES = {"high", "critical"}


def active_exception_rules(
    policy_path: pathlib.Path,
    *,
    today: dt.date,
) -> tuple[set[str], list[str]]:
    rules: set[str] = set()
    errors: list[str] = []

    for number, raw in enumerate(policy_path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue

        parts = [part.strip() for part in line.split("|")]
        if len(parts) != 6 or any(not part for part in parts):
            errors.append(f"{policy_path}:{number}: invalid exception record")
            continue

        scanner, rule, path, expires_raw, owner, ticket = parts
        if scanner.lower() != "npm-audit":
            continue
        if path != LOCKFILE_PATH:
            continue
        if not ticket.startswith(("SEC-", "RISK-")) or not owner:
            errors.append(f"{policy_path}:{number}: invalid exception ownership")
            continue

        try:
            expires = dt.date.fromisoformat(expires_raw)
        except ValueError:
            errors.append(f"{policy_path}:{number}: invalid exception expiry")
            continue
        if expires < today:
            errors.append(f"{policy_path}:{number}: npm audit exception expired")
            continue
        if expires > today + dt.timedelta(days=90):
            errors.append(f"{policy_path}:{number}: npm audit exception exceeds 90 days")
            continue
        if not re.fullmatch(r"GHSA-[a-z0-9-]+", rule, re.IGNORECASE):
            errors.append(f"{policy_path}:{number}: npm audit exception must name a GHSA")
            continue

        rules.add(rule.upper())

    return rules, errors


def collect_high_advisories(report: dict[str, Any]) -> tuple[set[str], list[str]]:
    vulnerabilities = report.get("vulnerabilities")
    if not isinstance(vulnerabilities, dict):
        return set(), ["npm audit did not return a vulnerability report"]

    advisories: set[str] = set()
    errors: list[str] = []
    visited: set[str] = set()

    def visit(name: str) -> None:
        if name in visited:
            return
        visited.add(name)

        vulnerability = vulnerabilities.get(name)
        if not isinstance(vulnerability, dict):
            errors.append(f"npm audit references an unknown vulnerability: {name}")
            return

        via = vulnerability.get("via")
        if not isinstance(via, list):
            errors.append(f"npm audit finding has no advisory chain: {name}")
            return

        for source in via:
            if isinstance(source, str):
                visit(source)
                continue
            if not isinstance(source, dict):
                errors.append(f"npm audit finding has an invalid advisory source: {name}")
                continue
            if str(source.get("severity", "")).lower() not in HIGH_SEVERITIES:
                continue

            match = GHSA_PATTERN.search(str(source.get("url", "")))
            if match is None:
                errors.append(f"npm audit advisory lacks a GHSA identifier: {name}")
                continue
            advisories.add(match.group(1).upper())

    for name, vulnerability in vulnerabilities.items():
        if not isinstance(vulnerability, dict):
            errors.append(f"npm audit vulnerability has an invalid record: {name}")
            continue
        if str(vulnerability.get("severity", "")).lower() in HIGH_SEVERITIES:
            visit(name)

    return advisories, errors


def run(
    report: dict[str, Any],
    *,
    policy_path: pathlib.Path = POLICY,
    today: dt.date | None = None,
) -> list[str]:
    exception_rules, errors = active_exception_rules(
        policy_path,
        today=today or dt.date.today(),
    )
    advisories, audit_errors = collect_high_advisories(report)
    errors.extend(audit_errors)

    for advisory in sorted(advisories):
        if advisory not in exception_rules:
            errors.append(f"unapproved high npm audit advisory: {advisory}")

    return errors


def main() -> int:
    result = subprocess.run(
        AUDIT_COMMAND,
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    if result.stderr:
        print(result.stderr, end="", file=sys.stderr)

    try:
        report = json.loads(result.stdout)
    except json.JSONDecodeError:
        print("npm audit did not produce valid JSON", file=sys.stderr)
        return 1

    errors = run(report)
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1

    if result.returncode != 0:
        print("npm audit findings are covered by active, scoped exceptions.")
    else:
        print("npm audit passed with no high-severity findings.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
