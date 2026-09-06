import importlib.util
import pathlib
import tempfile
import unittest


SCRIPT = pathlib.Path(__file__).with_name("compare-build-trees.py")
SPEC = importlib.util.spec_from_file_location("compare_build_trees", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class CompareBuildTreesTests(unittest.TestCase):
    def test_identical_trees_have_one_stable_digest(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = pathlib.Path(temporary)
            first = root / "first"
            second = root / "second"
            (first / "nested").mkdir(parents=True)
            (second / "nested").mkdir(parents=True)
            (first / "nested" / "artifact").write_bytes(b"same")
            (second / "nested" / "artifact").write_bytes(b"same")

            evidence, errors = MODULE.compare(first, second)

            self.assertEqual(errors, [])
            self.assertTrue(evidence["reproducible"])
            self.assertEqual(evidence["first_tree_sha256"], evidence["second_tree_sha256"])

    def test_difference_reports_path_without_contents(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = pathlib.Path(temporary)
            first = root / "first"
            second = root / "second"
            first.mkdir()
            second.mkdir()
            (first / "artifact").write_text("first secret", encoding="utf-8")
            (second / "artifact").write_text("second secret", encoding="utf-8")

            evidence, errors = MODULE.compare(first, second)

            self.assertFalse(evidence["reproducible"])
            self.assertEqual(errors, ["content differs: artifact"])
            self.assertNotIn("secret", "\n".join(errors))


if __name__ == "__main__":
    unittest.main()
