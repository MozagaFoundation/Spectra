#!/usr/bin/env python3
import datetime as dt
import pathlib
import sys


ROOT = pathlib.Path(__file__).resolve().parents[1]
POLICY = ROOT / "scripts" / "security-allowlist.txt"
TODAY = dt.date.today()


def main() -> int:
    errors: list[str] = []
    for number, raw in enumerate(POLICY.read_text(encoding="utf-8").splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split("|")
        if len(parts) != 6 or any(not part.strip() for part in parts):
            errors.append(f"line {number}: expected six non-empty fields")
            continue
        scanner, rule, path, expires_raw, owner, ticket = (part.strip() for part in parts)
        try:
            expires = dt.date.fromisoformat(expires_raw)
        except ValueError:
            errors.append(f"line {number}: invalid expiry")
            continue
        if expires < TODAY:
            errors.append(f"line {number}: exception expired")
        if expires > TODAY + dt.timedelta(days=90):
            errors.append(f"line {number}: exception exceeds 90 days")
        if pathlib.PurePosixPath(path).is_absolute() or ".." in pathlib.PurePosixPath(path).parts:
            errors.append(f"line {number}: path must be repository-relative")
        if not ticket.startswith(("SEC-", "RISK-")):
            errors.append(f"line {number}: ticket must start SEC- or RISK-")
        if scanner.lower() not in {
            "codeql",
            "deno-audit",
            "deno-lint",
            "gitleaks",
            "npm-audit",
            "supabase-db-lint",
        }:
            errors.append(f"line {number}: unsupported scanner {scanner}")
        if not rule or not owner:
            errors.append(f"line {number}: rule and owner are required")
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    print("security allowlist policy valid")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
