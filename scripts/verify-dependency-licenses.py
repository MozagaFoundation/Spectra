#!/usr/bin/env python3
"""Validate dependency license metadata and time-bounded exceptions."""

from __future__ import annotations

import argparse
import datetime as dt
import json
import pathlib
import re
import sys


ROOT = pathlib.Path(__file__).resolve().parents[1]
EXCEPTIONS = ROOT / "scripts" / "supply-chain-exceptions.txt"
DENO_NPM_LICENSES = {
    "@noble/curves@1.4.0": "MIT",
    "@noble/curves@2.0.1": "MIT",
    "@noble/hashes@1.4.0": "MIT",
    "@noble/hashes@1.5.0": "MIT",
    "@noble/hashes@2.0.1": "MIT",
    "@noble/post-quantum@0.5.4": "MIT",
    "@supabase/auth-js@2.110.9": "MIT",
    "@supabase/functions-js@2.110.9": "MIT",
    "@supabase/phoenix@0.4.5": "MIT",
    "@supabase/postgrest-js@2.110.9": "MIT",
    "@supabase/realtime-js@2.110.9": "MIT",
    "@supabase/storage-js@2.110.9": "MIT",
    "@supabase/supabase-js@2.110.9": "MIT",
    "iceberg-js@0.8.1": "MIT",
    "postgres@3.4.9": "Unlicense",
    "tslib@2.8.1": "0BSD",
}
APPROVED_LICENSE_IDS = {
    "0BSD",
    "AGPL-3.0-only",
    "Apache-2.0",
    "Artistic-2.0",
    "BSD-2-Clause",
    "BSD-3-Clause",
    "BlueOak-1.0.0",
    "CC-BY-3.0",
    "CC-BY-4.0",
    "CC0-1.0",
    "ISC",
    "MIT",
    "MIT-0",
    "MPL-2.0",
    "OFL-1.1",
    "Python-2.0",
    "LicenseRef-Beerware",
    "LicenseRef-Public-Domain",
    "Unicode-3.0",
    "Unicode-DFS-2016",
    "Unlicense",
    "WTFPL",
    "Zlib",
}
OPERATORS = {"AND", "OR", "WITH"}


def license_ids(expression: str) -> set[str]:
    normalized = expression.replace("(", " ").replace(")", " ")
    return {
        token
        for token in re.split(r"\s+", normalized.strip())
        if token and token not in OPERATORS
    }


def is_approved(expression: str, *, is_project: bool = False) -> bool:
    expression = expression.strip()
    while expression.startswith("(") and expression.endswith(")"):
        expression = expression[1:-1].strip()
    alternatives = re.split(r"\s+OR\s+", expression)
    if len(alternatives) > 1:
        return any(is_approved(alternative, is_project=is_project) for alternative in alternatives)
    requirements = re.split(r"\s+AND\s+", expression)
    if len(requirements) > 1:
        return all(is_approved(requirement, is_project=is_project) for requirement in requirements)
    identifiers = license_ids(expression)
    if not identifiers:
        return False
    if is_project:
        identifiers.discard("LicenseRef-Spectra-Commercial")
    return bool(identifiers) and identifiers.issubset(APPROVED_LICENSE_IDS)


def load_exceptions(path: pathlib.Path, today: dt.date) -> tuple[set[tuple[str, str]], list[str]]:
    allowed: set[tuple[str, str]] = set()
    errors: list[str] = []
    for number, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        fields = [field.strip() for field in line.split("|")]
        if len(fields) != 7 or any(not field for field in fields):
            errors.append(f"{path}: line {number}: expected seven non-empty fields")
            continue
        kind, component, finding, expiry_raw, owner, ticket, rationale = fields
        if kind not in {"license", "vulnerability"}:
            errors.append(f"{path}: line {number}: unsupported exception kind")
        try:
            expiry = dt.date.fromisoformat(expiry_raw)
        except ValueError:
            errors.append(f"{path}: line {number}: invalid expiry")
            continue
        if expiry < today:
            errors.append(f"{path}: line {number}: exception expired")
        if expiry > today + dt.timedelta(days=90):
            errors.append(f"{path}: line {number}: exception exceeds 90 days")
        if not ticket.startswith(("SEC-", "RISK-")):
            errors.append(f"{path}: line {number}: ticket must start SEC- or RISK-")
        if len(rationale) < 12:
            errors.append(f"{path}: line {number}: rationale is too short")
        if not owner:
            errors.append(f"{path}: line {number}: owner is required")
        allowed.add((kind, f"{component}|{finding}"))
    return allowed, errors


def validate_npm(root: pathlib.Path, exceptions: set[tuple[str, str]], errors: list[str]) -> None:
    lock_path = root / "package-lock.json"
    lock = json.loads(lock_path.read_text(encoding="utf-8"))
    overrides_path = root / "scripts" / "npm-license-overrides.json"
    overrides = json.loads(overrides_path.read_text(encoding="utf-8"))
    seen_overrides: set[str] = set()
    for package_key, metadata in sorted(lock.get("packages", {}).items()):
        if not package_key or metadata.get("link"):
            continue
        name = package_key.removeprefix("node_modules/")
        version = str(metadata.get("version", "unknown"))
        component = f"npm:{name}@{version}"
        expression = metadata.get("license")
        finding = str(expression or "MISSING")
        if expression and is_approved(str(expression)):
            continue
        override = overrides.get(component)
        if isinstance(override, dict):
            reviewed_license = str(override.get("license", ""))
            evidence = str(override.get("evidence", ""))
            if is_approved(reviewed_license) and len(evidence) >= 20:
                seen_overrides.add(component)
                continue
            errors.append(f"{overrides_path}: invalid reviewed metadata for {component}")
            continue
        if ("license", f"{component}|{finding}") not in exceptions:
            errors.append(f"{lock_path}: {component} has unapproved license metadata {finding!r}")
    for stale in sorted(set(overrides) - seen_overrides):
        errors.append(f"{overrides_path}: stale license metadata override {stale}")


def validate_deno(
    root: pathlib.Path,
    exceptions: set[tuple[str, str]],
    errors: list[str],
) -> None:
    lock_path = root / "supabase" / "functions" / "deno.lock"
    lock = json.loads(lock_path.read_text(encoding="utf-8"))
    packages = lock.get("npm")
    if not isinstance(packages, dict):
        errors.append(f"{lock_path}: Deno npm metadata is malformed")
        return
    for package in sorted(packages):
        expression = DENO_NPM_LICENSES.get(package)
        component = f"deno-npm:{package}"
        if expression is None:
            errors.append(f"{lock_path}: missing reviewed license metadata for {component}")
            continue
        if is_approved(expression):
            continue
        if ("license", f"{component}|{expression}") not in exceptions:
            errors.append(f"{lock_path}: {component} has unapproved license {expression!r}")


def _component_license_expressions(component: dict) -> list[str]:
    expressions: list[str] = []
    for entry in component.get("licenses", []):
        if not isinstance(entry, dict):
            continue
        if isinstance(entry.get("expression"), str):
            expressions.append(entry["expression"])
        license_entry = entry.get("license")
        if isinstance(license_entry, dict):
            value = license_entry.get("id") or license_entry.get("name")
            if isinstance(value, str):
                expressions.append(value)
    return expressions


def validate_sbom(
    path: pathlib.Path,
    npm_overrides: dict[str, dict],
    exceptions: set[tuple[str, str]],
    errors: list[str],
) -> None:
    sbom = json.loads(path.read_text(encoding="utf-8"))
    if sbom.get("bomFormat") != "CycloneDX":
        errors.append(f"{path}: SBOM must use CycloneDX")
    if not sbom.get("serialNumber"):
        errors.append(f"{path}: SBOM serial number is missing")
    components = sbom.get("components")
    if not isinstance(components, list) or not components:
        errors.append(f"{path}: SBOM has no components")
        return
    for component in components:
        if not isinstance(component, dict):
            errors.append(f"{path}: malformed component entry")
            continue
        name = str(component.get("name", "unknown"))
        version = str(component.get("version", "unknown"))
        identity = str(component.get("purl") or f"{name}@{version}")
        for expression in _component_license_expressions(component):
            if is_approved(expression, is_project=name == "spectra"):
                continue
            override = npm_overrides.get(f"npm:{name}@{version}")
            if (
                isinstance(override, dict)
                and is_approved(str(override.get("license", "")))
                and len(str(override.get("evidence", ""))) >= 20
            ):
                continue
            if ("license", f"sbom:{identity}|{expression}") not in exceptions:
                errors.append(
                    f"{path}: sbom:{identity} has unapproved license {expression!r}"
                )


def run(
    root: pathlib.Path,
    *,
    sbom_path: pathlib.Path | None = None,
    today: dt.date | None = None,
) -> list[str]:
    today = today or dt.date.today()
    exceptions_path = root / "scripts" / "supply-chain-exceptions.txt"
    exceptions, errors = load_exceptions(exceptions_path, today)
    validate_npm(root, exceptions, errors)
    validate_deno(root, exceptions, errors)
    if sbom_path is not None:
        npm_overrides = json.loads(
            (root / "scripts" / "npm-license-overrides.json").read_text(encoding="utf-8")
        )
        validate_sbom(sbom_path, npm_overrides, exceptions, errors)
    return errors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=pathlib.Path, default=ROOT)
    parser.add_argument("--sbom", type=pathlib.Path)
    args = parser.parse_args()
    root = args.root.resolve()
    sbom = args.sbom.resolve() if args.sbom else None
    try:
        errors = run(root, sbom_path=sbom)
    except (OSError, json.JSONDecodeError) as exc:
        print(f"dependency license policy could not be evaluated: {exc}", file=sys.stderr)
        return 1
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    print("Dependency license policy verified.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
