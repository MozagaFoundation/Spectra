#!/usr/bin/env python3
"""Fail-closed static checks for Spectra build and dependency provenance."""

from __future__ import annotations

import argparse
import json
import pathlib
import re
import sys


ACTION_SHA = re.compile(r"^[0-9a-f]{40}$")
IMAGE_DIGEST = re.compile(r"@sha256:[0-9a-f]{64}$")
EXACT_DENO_NPM = re.compile(
    r"^npm:(?P<name>@[^/]+/[^@/]+|[^@/]+)@"
    r"(?P<version>\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)(?:/.*)?$"
)
ROOT = pathlib.Path(__file__).resolve().parents[1]


def _error(errors: list[str], source: pathlib.Path | str, message: str) -> None:
    errors.append(f"{source}: {message}")


def validate_workflow(path: pathlib.Path, errors: list[str]) -> None:
    text = path.read_text(encoding="utf-8")

    for line_number, line in enumerate(text.splitlines(), 1):
        uses = re.match(r"\s*(?:-\s*)?uses:\s*([^\s#]+)", line)
        if uses:
            reference = uses.group(1)
            if not reference.startswith("./"):
                _, separator, revision = reference.rpartition("@")
                if not separator or not ACTION_SHA.fullmatch(revision):
                    _error(errors, path, f"line {line_number}: action is not pinned to a full commit SHA")

        image = re.match(r"\s*image:\s*([^\s#]+)", line)
        if image and not IMAGE_DIGEST.search(image.group(1)):
            _error(errors, path, f"line {line_number}: service image is not pinned by sha256 digest")

        runner = re.match(r"\s*runs-on:\s*([^\s#]+)", line)
        if runner and runner.group(1).endswith("-latest"):
            _error(errors, path, f"line {line_number}: mutable runner label is forbidden")

    step_boundaries = [match.start() for match in re.finditer(r"(?m)^\s{6}- (?:name:|uses:)", text)]
    step_boundaries.append(len(text))
    for index, start in enumerate(step_boundaries[:-1]):
        block = text[start : step_boundaries[index + 1]]
        if (
            "docker run" in block
            and not re.search(r"@sha256:[0-9a-f]{64}", block)
        ):
            _error(errors, path, "docker run step uses an image without a sha256 digest")
        if (
            re.search(r"\bcurl\b[^\n]*(?:--output|-o)\b", block)
            and not re.search(r"sha256sum\s+--check", block)
        ):
            _error(errors, path, "download step does not verify a pinned SHA-256 checksum")

    forbidden = {
        r"\bnpm\s+(?:install|i)\b": "workflow must use npm ci, never npm install",
        r"\b(?:printenv|set\s+-x)\b": "workflow contains a secrets-unsafe diagnostic command",
        r"toJSON\s*\(\s*secrets": "workflow attempts to serialize secrets",
        r"\$\{\{\s*secrets\.[^}]+\}\}": "secret interpolation into shell commands is forbidden",
        r"\bsupabase\s+(?:link|db\s+push|functions\s+deploy|secrets\s+set)\b": (
            "workflow must not perform a remote Supabase mutation"
        ),
    }
    for pattern, message in forbidden.items():
        if re.search(pattern, text):
            _error(errors, path, message)


def validate_lockfiles(root: pathlib.Path, errors: list[str]) -> None:
    package_path = root / "package.json"
    lock_path = root / "package-lock.json"
    try:
        package = json.loads(package_path.read_text(encoding="utf-8"))
        lock = json.loads(lock_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        _error(errors, root, f"cannot parse npm manifests: {exc}")
        return

    if lock.get("lockfileVersion") != 3:
        _error(errors, lock_path, "lockfileVersion must be 3")
    root_lock = lock.get("packages", {}).get("", {})
    for field in ("dependencies", "devDependencies"):
        if package.get(field, {}) != root_lock.get(field, {}):
            _error(errors, lock_path, f"root {field} do not exactly match package.json")

    for package_key, metadata in lock.get("packages", {}).items():
        if not isinstance(metadata, dict) or metadata.get("link"):
            continue
        resolved = metadata.get("resolved")
        if resolved and not (
            resolved.startswith("https://registry.npmjs.org/")
            or resolved.startswith("file:")
        ):
            _error(errors, lock_path, f"{package_key or '<root>'} has an unapproved source")
        if resolved and resolved.startswith("https://") and not metadata.get("integrity"):
            _error(errors, lock_path, f"{package_key or '<root>'} is missing an integrity hash")

    validate_deno_lockfiles(root, errors)


def validate_deno_lockfiles(root: pathlib.Path, errors: list[str]) -> None:
    lock_path = root / "supabase" / "functions" / "deno.lock"
    config_paths = [
        root / "supabase" / "deno.json",
        root / "supabase" / "functions" / "deno.json",
    ]
    try:
        lock = json.loads(lock_path.read_text(encoding="utf-8"))
        configs = [
            json.loads(path.read_text(encoding="utf-8"))
            for path in config_paths
        ]
    except (OSError, json.JSONDecodeError) as exc:
        _error(errors, root, f"cannot parse Deno lock metadata: {exc}")
        return

    if lock.get("version") != "5":
        _error(errors, lock_path, "Deno lockfile version must be 5")
    npm_packages = lock.get("npm")
    specifiers = lock.get("specifiers")
    if not isinstance(npm_packages, dict) or not isinstance(specifiers, dict):
        _error(errors, lock_path, "Deno lockfile npm metadata is malformed")
        return

    for package, metadata in sorted(npm_packages.items()):
        if not isinstance(metadata, dict) or not re.fullmatch(
            r"sha512-[A-Za-z0-9+/]+={0,2}",
            str(metadata.get("integrity", "")),
        ):
            _error(errors, lock_path, f"npm:{package} is missing a sha512 integrity hash")

    for path, config in zip(config_paths, configs, strict=True):
        imports = config.get("imports", {})
        if not isinstance(imports, dict):
            _error(errors, path, "Deno imports must be an object")
            continue
        for alias, dependency in sorted(imports.items()):
            match = EXACT_DENO_NPM.fullmatch(str(dependency))
            if not match:
                _error(errors, path, f"{alias} is not pinned to an exact npm version")
                continue
            canonical = f"npm:{match.group('name')}@{match.group('version')}"
            if canonical not in specifiers:
                _error(errors, lock_path, f"{canonical} is missing from lock specifiers")
            package_key = f"{match.group('name')}@{match.group('version')}"
            if package_key not in npm_packages:
                _error(errors, lock_path, f"{package_key} is missing from locked npm packages")


def validate_package_manager_config(root: pathlib.Path, errors: list[str]) -> None:
    npmrc_path = root / ".npmrc"
    try:
        entries = {
            line.strip()
            for line in npmrc_path.read_text(encoding="utf-8").splitlines()
            if line.strip() and not line.lstrip().startswith("#")
        }
    except OSError as exc:
        _error(errors, npmrc_path, f"cannot read npm policy: {exc}")
        return
    for required in {
        "engine-strict=true",
        "legacy-peer-deps=true",
        "package-lock=true",
        "save-exact=true",
    }:
        if required not in entries:
            _error(errors, npmrc_path, f"missing {required}")


def validate_eas_config(root: pathlib.Path, errors: list[str]) -> None:
    path = root / "eas.json"
    try:
        config = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        _error(errors, path, f"cannot parse EAS config: {exc}")
        return

    cli = config.get("cli", {})
    if not re.fullmatch(r"\d+\.\d+\.\d+", str(cli.get("version", ""))):
        _error(errors, path, "EAS CLI must be pinned to one exact version")
    if cli.get("appVersionSource") != "remote":
        _error(errors, path, "production version authority must remain remote")

    production = config.get("build", {}).get("production", {})
    expectations = {
        "environment": "production",
        "distribution": "store",
        "node": "20.19.4",
        "autoIncrement": True,
    }
    for field, expected in expectations.items():
        if production.get(field) != expected:
            _error(errors, path, f"production.{field} must be {expected!r}")
    if production.get("developmentClient", False):
        _error(errors, path, "production cannot enable a development client")
    if production.get("android", {}).get("buildType") != "app-bundle":
        _error(errors, path, "production Android output must explicitly be an app bundle")


def validate_required_controls(root: pathlib.Path, errors: list[str]) -> None:
    workflow = (root / ".github" / "workflows" / "production-readiness.yml").read_text(
        encoding="utf-8"
    )
    package_path = root / "package.json"
    package = json.loads(package_path.read_text(encoding="utf-8"))
    scripts = package.get("scripts", {})
    required_workflow_markers = {
        "npm run supabase:db:replay": "local migration replay",
        "npm run supabase:db:lint": "local database lint",
        "npm run supabase:deploy:validate": "safe Edge deploy validation",
        "deno audit --level=high --lock=supabase/functions/deno.lock": "Deno audit",
        "python3 scripts/verify-npm-audit.py": "npm audit",
        "npm sbom --sbom-format cyclonedx": "npm SBOM",
        "verify-reproducible-mobile-export.sh": "mobile export reproducibility check",
        "verify-dependency-licenses.py": "dependency license gate",
        "npm ci": "lockfile-enforced npm install",
    }
    for marker, label in required_workflow_markers.items():
        if marker not in workflow:
            _error(errors, "production-readiness.yml", f"missing {label}")

    npm_audit_gate = root / "scripts" / "verify-npm-audit.py"
    if not npm_audit_gate.is_file():
        _error(errors, npm_audit_gate, "missing npm audit gate")
    elif (
        'AUDIT_COMMAND = ["npm", "audit", "--audit-level=high", "--json"]'
        not in npm_audit_gate.read_text(encoding="utf-8")
    ):
        _error(errors, npm_audit_gate, "must execute npm audit at high severity")

    required_scripts = {
        "supabase:start": "supabase start",
        "supabase:stop": "supabase stop --no-backup",
        "supabase:db:replay": "supabase db reset --local",
        "supabase:db:lint": "supabase db lint --local",
        "supabase:edge:check": "deno task",
        "supabase:edge:test": "deno test",
        "supabase:contracts": "deno task",
        "supabase:deploy:validate": "supabase:contracts",
    }
    for name, marker in required_scripts.items():
        command = str(scripts.get(name, ""))
        if marker not in command:
            _error(errors, package_path, f"{name} must include {marker!r}")
    if re.search(
        r"\bsupabase\s+(?:link|db\s+push|functions\s+deploy|secrets\s+set)\b",
        "\n".join(str(command) for command in scripts.values()),
    ):
        _error(errors, package_path, "npm scripts must not perform a remote Supabase mutation")

    supabase_version = str(package.get("devDependencies", {}).get("supabase", ""))
    if not re.fullmatch(r"\d+\.\d+\.\d+", supabase_version):
        _error(errors, package_path, "Supabase CLI must be an exact devDependency")
    if "supabase" in package.get("dependencies", {}):
        _error(errors, package_path, "Supabase CLI must not be a mobile runtime dependency")

    easignore = (root / ".easignore").read_text(encoding="utf-8").splitlines()
    if "/supabase/" not in {line.strip() for line in easignore}:
        _error(errors, ".easignore", "Supabase sources must be excluded from mobile archives")

    tsconfig = json.loads((root / "tsconfig.json").read_text(encoding="utf-8"))
    if "supabase" not in tsconfig.get("exclude", []):
        _error(errors, "tsconfig.json", "Supabase Deno sources must be excluded from mobile TypeScript")


def run(root: pathlib.Path) -> list[str]:
    errors: list[str] = []
    workflows = sorted((root / ".github" / "workflows").glob("*.y*ml"))
    if not workflows:
        _error(errors, root, "no CI workflows found")
    for workflow in workflows:
        validate_workflow(workflow, errors)

    validate_lockfiles(root, errors)
    validate_package_manager_config(root, errors)
    validate_eas_config(root, errors)
    validate_required_controls(root, errors)
    return errors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=pathlib.Path, default=ROOT)
    args = parser.parse_args()
    errors = run(args.root.resolve())
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    print("Supply-chain provenance policy verified.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
