import datetime as dt
import importlib.util
import pathlib
import tempfile
import unittest


SCRIPT = pathlib.Path(__file__).with_name("verify-npm-audit.py")
SPEC = importlib.util.spec_from_file_location("verify_npm_audit", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class NpmAuditGateTests(unittest.TestCase):
    TODAY = dt.date(2026, 8, 18)

    def create_policy(self, entries: list[str]) -> pathlib.Path:
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        policy = pathlib.Path(temporary.name) / "security-allowlist.txt"
        policy.write_text("\n".join(entries) + "\n", encoding="utf-8")
        return policy

    @staticmethod
    def image_size_report() -> dict:
        return {
            "vulnerabilities": {
                "metro": {
                    "severity": "high",
                    "via": ["image-size"],
                },
                "image-size": {
                    "severity": "high",
                    "via": [
                        {
                            "severity": "high",
                            "url": "https://github.com/advisories/GHSA-w3rx-r6r6-pgpr",
                        },
                        {
                            "severity": "high",
                            "url": "https://github.com/advisories/GHSA-5p2g-fcmc-qvqq",
                        },
                    ],
                },
            }
        }

    def test_active_scoped_exceptions_allow_the_known_advisories(self) -> None:
        policy = self.create_policy(
            [
                "npm-audit|GHSA-w3rx-r6r6-pgpr|package-lock.json|2026-09-17|security|RISK-1",
                "npm-audit|GHSA-5p2g-fcmc-qvqq|package-lock.json|2026-09-17|security|RISK-1",
            ]
        )

        errors = MODULE.run(
            self.image_size_report(),
            policy_path=policy,
            today=self.TODAY,
        )

        self.assertEqual(errors, [])

    def test_unapproved_high_advisory_fails_closed(self) -> None:
        policy = self.create_policy([])

        errors = MODULE.run(
            self.image_size_report(),
            policy_path=policy,
            today=self.TODAY,
        )

        self.assertIn("unapproved high npm audit advisory: GHSA-W3RX-R6R6-PGPR", errors)
        self.assertIn("unapproved high npm audit advisory: GHSA-5P2G-FCMC-QVQQ", errors)

    def test_expired_exception_is_rejected(self) -> None:
        policy = self.create_policy(
            [
                "npm-audit|GHSA-w3rx-r6r6-pgpr|package-lock.json|2026-08-17|security|RISK-1",
                "npm-audit|GHSA-5p2g-fcmc-qvqq|package-lock.json|2026-08-17|security|RISK-1",
            ]
        )

        errors = MODULE.run(
            self.image_size_report(),
            policy_path=policy,
            today=self.TODAY,
        )

        self.assertTrue(any("exception expired" in error for error in errors))


if __name__ == "__main__":
    unittest.main()
