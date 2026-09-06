import datetime as dt
import importlib.util
import json
import pathlib
import tempfile
import unittest


SCRIPT = pathlib.Path(__file__).with_name("verify-dependency-licenses.py")
SPEC = importlib.util.spec_from_file_location("verify_dependency_licenses", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class DependencyLicensePolicyTests(unittest.TestCase):
    def create_fixture(self, npm_license: str | None = "MIT") -> pathlib.Path:
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        root = pathlib.Path(temporary.name)
        (root / "scripts").mkdir()
        (root / "supabase" / "functions").mkdir(parents=True)
        package = {"version": "1.0.0"}
        if npm_license is not None:
            package["license"] = npm_license
        (root / "package-lock.json").write_text(
            json.dumps(
                {
                    "lockfileVersion": 3,
                    "packages": {
                        "": {"name": "fixture", "version": "1.0.0"},
                        "node_modules/example": package,
                    },
                }
            ),
            encoding="utf-8",
        )
        (root / "supabase" / "functions" / "deno.lock").write_text(
            json.dumps(
                {
                    "version": "5",
                    "npm": {
                        "postgres@3.4.9": {
                            "integrity": "sha512-Zml4dHVycmU=",
                        }
                    },
                }
            ),
            encoding="utf-8",
        )
        (root / "scripts" / "npm-license-overrides.json").write_text("{}", encoding="utf-8")
        (root / "scripts" / "supply-chain-exceptions.txt").write_text("", encoding="utf-8")
        return root

    def test_approved_npm_and_deno_licenses_pass(self) -> None:
        errors = MODULE.run(self.create_fixture(), today=dt.date(2026, 7, 10))
        self.assertEqual(errors, [])

    def test_missing_license_fails_closed(self) -> None:
        errors = MODULE.run(
            self.create_fixture(npm_license=None),
            today=dt.date(2026, 7, 10),
        )
        self.assertTrue(any("MISSING" in error for error in errors))

    def test_expired_exception_is_rejected(self) -> None:
        root = self.create_fixture(npm_license=None)
        (root / "scripts" / "supply-chain-exceptions.txt").write_text(
            "license|npm:example@1.0.0|MISSING|2026-07-09|security|RISK-1|"
            "Temporary metadata investigation\n",
            encoding="utf-8",
        )
        errors = MODULE.run(root, today=dt.date(2026, 7, 10))
        self.assertTrue(any("exception expired" in error for error in errors))

    def test_unreviewed_deno_dependency_fails_closed(self) -> None:
        root = self.create_fixture()
        lock_path = root / "supabase" / "functions" / "deno.lock"
        lock = json.loads(lock_path.read_text(encoding="utf-8"))
        lock["npm"]["example@1.0.0"] = {"integrity": "sha512-Zml4dHVycmU="}
        lock_path.write_text(json.dumps(lock), encoding="utf-8")
        errors = MODULE.run(root, today=dt.date(2026, 7, 10))
        self.assertTrue(any("deno-npm:example@1.0.0" in error for error in errors))

    def test_sbom_license_gate_rejects_unapproved_license(self) -> None:
        root = self.create_fixture()
        sbom = root / "source-sbom.cdx.json"
        sbom.write_text(
            json.dumps(
                {
                    "bomFormat": "CycloneDX",
                    "serialNumber": "urn:uuid:fixture",
                    "components": [
                        {
                            "name": "unsafe",
                            "version": "1.0.0",
                            "purl": "pkg:npm/unsafe@1.0.0",
                            "licenses": [{"license": {"id": "GPL-3.0-only"}}],
                        }
                    ],
                }
            ),
            encoding="utf-8",
        )
        errors = MODULE.run(root, sbom_path=sbom, today=dt.date(2026, 7, 10))
        self.assertTrue(any("GPL-3.0-only" in error for error in errors))

    def test_sbom_license_gate_accepts_approved_license(self) -> None:
        root = self.create_fixture()
        sbom = root / "source-sbom.cdx.json"
        sbom.write_text(
            json.dumps(
                {
                    "bomFormat": "CycloneDX",
                    "serialNumber": "urn:uuid:fixture",
                    "components": [
                        {
                            "name": "safe",
                            "version": "1.0.0",
                            "licenses": [{"license": {"id": "MIT"}}],
                        }
                    ],
                }
            ),
            encoding="utf-8",
        )
        errors = MODULE.run(root, sbom_path=sbom, today=dt.date(2026, 7, 10))
        self.assertEqual(errors, [])


if __name__ == "__main__":
    unittest.main()
