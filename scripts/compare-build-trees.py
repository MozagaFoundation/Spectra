#!/usr/bin/env python3
"""Compare two build trees without printing file contents."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import pathlib
import sys


def inventory(root: pathlib.Path) -> dict[str, str]:
    files: dict[str, str] = {}
    for path in sorted(root.rglob("*")):
        relative = path.relative_to(root).as_posix()
        if path.is_symlink():
            raise ValueError(f"symbolic link is not reproducible: {relative}")
        if not path.is_file():
            continue
        digest = hashlib.sha256()
        with path.open("rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(chunk)
        files[relative] = digest.hexdigest()
    return files


def tree_digest(files: dict[str, str]) -> str:
    digest = hashlib.sha256()
    for path, file_digest in sorted(files.items()):
        digest.update(path.encode("utf-8"))
        digest.update(b"\0")
        digest.update(file_digest.encode("ascii"))
        digest.update(b"\n")
    return digest.hexdigest()


def compare(first: pathlib.Path, second: pathlib.Path) -> tuple[dict, list[str]]:
    first_files = inventory(first)
    second_files = inventory(second)
    errors: list[str] = []
    all_paths = sorted(set(first_files) | set(second_files))
    for path in all_paths:
        if path not in first_files:
            errors.append(f"only in second build: {path}")
        elif path not in second_files:
            errors.append(f"only in first build: {path}")
        elif first_files[path] != second_files[path]:
            errors.append(f"content differs: {path}")

    first_digest = tree_digest(first_files)
    second_digest = tree_digest(second_files)
    evidence = {
        "schema_version": 1,
        "reproducible": not errors,
        "file_count": len(first_files),
        "tree_sha256": first_digest if not errors else None,
        "first_tree_sha256": first_digest,
        "second_tree_sha256": second_digest,
    }
    return evidence, errors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("first", type=pathlib.Path)
    parser.add_argument("second", type=pathlib.Path)
    parser.add_argument("--evidence", type=pathlib.Path)
    args = parser.parse_args()
    try:
        evidence, errors = compare(args.first.resolve(), args.second.resolve())
    except (OSError, ValueError) as exc:
        print(f"build comparison failed: {exc}", file=sys.stderr)
        return 1

    if args.evidence:
        args.evidence.parent.mkdir(parents=True, exist_ok=True)
        temporary = args.evidence.with_suffix(args.evidence.suffix + ".tmp")
        temporary.write_text(
            json.dumps(evidence, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        os.replace(temporary, args.evidence)

    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    print(f"Build trees are reproducible: {evidence['tree_sha256']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
