import contextlib
import importlib.util
import io
import json
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


manage = load("manage")
validator = load("validate")


class LinkTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.source = self.root / "repo" / "skills" / "c-example"
        self.source.mkdir(parents=True)
        self.target = self.root / "client" / "skills"
        self.selected = {"c-example": self.source}

    def run_action(self, action, dry_run=False):
        with contextlib.redirect_stdout(io.StringIO()):
            return manage.manage(action, self.target, self.selected, dry_run)

    def test_link_is_idempotent_and_unlink_removes_owned_link(self):
        self.assertEqual(self.run_action("link"), 0)
        self.assertEqual(self.run_action("link"), 0)
        destination = self.target / "c-example"
        self.assertEqual(destination.resolve(), self.source.resolve())
        self.assertEqual(self.run_action("unlink"), 0)
        self.assertFalse(destination.is_symlink())
        self.assertTrue(self.source.is_dir())

    def test_existing_directory_is_never_replaced_or_removed(self):
        destination = self.target / "c-example"
        destination.mkdir(parents=True)
        marker = destination / "personal.txt"
        marker.write_text("keep", encoding="utf-8")
        self.assertEqual(self.run_action("link"), 1)
        self.run_action("unlink")
        self.assertEqual(marker.read_text(), "keep")

    def test_foreign_dangling_link_is_kept(self):
        self.target.mkdir(parents=True)
        destination = self.target / "c-example"
        foreign = self.root / "missing-foreign-skill"
        destination.symlink_to(foreign)
        self.assertEqual(self.run_action("link"), 1)
        self.run_action("unlink")
        self.assertTrue(destination.is_symlink())
        self.assertEqual(destination.readlink(), foreign)

    def test_relative_owned_link_can_be_removed(self):
        self.target.mkdir(parents=True)
        destination = self.target / "c-example"
        destination.symlink_to("../../repo/skills/c-example")
        self.run_action("unlink")
        self.assertFalse(destination.is_symlink())

    def test_dry_run_and_status_do_not_create_or_remove_files(self):
        self.run_action("link", dry_run=True)
        self.run_action("status")
        self.assertFalse(self.target.exists())
        self.run_action("link")
        self.run_action("unlink", dry_run=True)
        self.assertTrue((self.target / "c-example").is_symlink())


class ValidationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.package = self.root / "skills" / "c-example"
        self.package.mkdir(parents=True)
        self.skill = self.package / "SKILL.md"
        self.skill.write_text("---\nname: c-example\ndescription: A specific task.\n---\n# Example\n", encoding="utf-8")

    def test_invalid_yaml_and_mismatched_names_are_rejected(self):
        self.skill.write_text("---\nname: [\n---\n", encoding="utf-8")
        self.assertTrue(validator.validate(self.root))
        self.skill.write_text("---\nname: wrong-name\ndescription: A task.\n---\n", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "directory"):
            validator.load_skill(self.skill)

    def test_missing_and_escaping_references_are_rejected(self):
        self.skill.write_text("[Missing](references/missing.md)\n[Outside](../../private.md)\n", encoding="utf-8")
        errors = validator.check_links(self.skill, self.package)
        self.assertEqual(len(errors), 2)

    def test_url_and_valid_local_reference_are_accepted(self):
        reference = self.package / "references" / "guide.md"
        reference.parent.mkdir()
        reference.write_text("# Guide", encoding="utf-8")
        self.skill.write_text("[Local](references/guide.md#guide)\n[Web](https://example.com/page)\n", encoding="utf-8")
        self.assertEqual(validator.check_links(self.skill, self.package), [])

    def test_duplicate_evaluation_ids_are_rejected(self):
        path = self.root / "cases.json"
        case = {"id": "duplicate", "kind": "trigger", "request": "Write a README", "expected_trigger": True}
        path.write_text(json.dumps({"schema_version": 1, "skill": "c-example", "cases": [case, case]}))
        with self.assertRaisesRegex(ValueError, "unique"):
            validator.check_cases(path, "c-example")

    def test_incomplete_behavior_rubric_is_rejected(self):
        path = self.root / "cases.json"
        case = {"id": "behavior", "kind": "behavior", "request": "Rewrite", "input": "A fact."}
        path.write_text(json.dumps({"schema_version": 1, "skill": "c-example", "cases": [case]}))
        with self.assertRaisesRegex(ValueError, "must_preserve"):
            validator.check_cases(path, "c-example")


if __name__ == "__main__":
    unittest.main()
