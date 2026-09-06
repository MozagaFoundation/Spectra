import json
import importlib.util
import pathlib
import tempfile
import unittest


SCRIPT = pathlib.Path(__file__).with_name("verify-supply-chain.py")
SPEC = importlib.util.spec_from_file_location("verify_supply_chain", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class SupplyChainPolicyTests(unittest.TestCase):
    def test_mutable_action_and_image_references_fail(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            workflow = pathlib.Path(temporary) / "workflow.yml"
            workflow.write_text(
                """
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
    steps:
      - uses: actions/checkout@v4
      - name: Scan
        run: docker run --rm scanner/tool:latest scan .
""",
                encoding="utf-8",
            )
            errors: list[str] = []
            MODULE.validate_workflow(workflow, errors)
            self.assertTrue(any("full commit SHA" in error for error in errors))
            self.assertTrue(any("sha256 digest" in error for error in errors))
            self.assertTrue(any("mutable runner" in error for error in errors))

    def test_pinned_action_and_image_references_pass(self) -> None:
        sha = "a" * 40
        digest = "b" * 64
        with tempfile.TemporaryDirectory() as temporary:
            workflow = pathlib.Path(temporary) / "workflow.yml"
            workflow.write_text(
                f"""
jobs:
  test:
    runs-on: ubuntu-24.04
    services:
      postgres:
        image: postgres:16@sha256:{digest}
    steps:
      - uses: actions/checkout@{sha}
      - name: Scan
        run: docker run --rm scanner/tool:1@sha256:{digest} scan .
""",
                encoding="utf-8",
            )
            errors: list[str] = []
            MODULE.validate_workflow(workflow, errors)
            self.assertEqual(errors, [])

    def test_remote_supabase_mutation_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            workflow = pathlib.Path(temporary) / "workflow.yml"
            workflow.write_text(
                """
jobs:
  deploy:
    runs-on: ubuntu-24.04
    steps:
      - run: supabase functions deploy spectra-api
""",
                encoding="utf-8",
            )
            errors: list[str] = []
            MODULE.validate_workflow(workflow, errors)
            self.assertTrue(any("remote Supabase mutation" in error for error in errors))

    def test_deno_imports_require_exact_locked_integrity(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = pathlib.Path(temporary)
            functions = root / "supabase" / "functions"
            functions.mkdir(parents=True)
            (root / "supabase" / "deno.json").write_text(
                json.dumps({"imports": {"example": "npm:example@1.0.0"}}),
                encoding="utf-8",
            )
            (functions / "deno.json").write_text(
                json.dumps({"imports": {"example": "npm:example@1.0.0/subpath"}}),
                encoding="utf-8",
            )
            (functions / "deno.lock").write_text(
                json.dumps(
                    {
                        "version": "5",
                        "specifiers": {"npm:example@1.0.0": "1.0.0"},
                        "npm": {
                            "example@1.0.0": {
                                "integrity": "sha512-Zml4dHVycmU=",
                            }
                        },
                    }
                ),
                encoding="utf-8",
            )
            errors: list[str] = []
            MODULE.validate_deno_lockfiles(root, errors)
            self.assertEqual(errors, [])

            (functions / "deno.json").write_text(
                json.dumps({"imports": {"example": "npm:example@^1.0.0"}}),
                encoding="utf-8",
            )
            MODULE.validate_deno_lockfiles(root, errors)
            self.assertTrue(any("exact npm version" in error for error in errors))


if __name__ == "__main__":
    unittest.main()
