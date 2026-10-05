#!/usr/bin/env python3
"""Validate skill structure and evaluation fixtures, not document semantics."""

import json
import re
from pathlib import Path
from urllib.parse import unquote, urlsplit

import yaml


ROOT = Path(__file__).resolve().parents[1]
NAME = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")
LINK = re.compile(r"(?<!!)\[[^\]\n]+\]\(([^)\n]+)\)")
ALLOWED = {"name", "description", "license", "compatibility", "metadata", "allowed-tools"}


def inside(path: Path, directory: Path) -> bool:
    return path.resolve().is_relative_to(directory.resolve())


def load_skill(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")
    match = re.match(r"\A---\n(.*?)\n---(?:\n|$)", text, re.DOTALL)
    if not match:
        raise ValueError("missing or invalid YAML frontmatter")
    data = yaml.safe_load(match.group(1))
    if not isinstance(data, dict):
        raise ValueError("frontmatter must be a mapping")
    if set(data) - ALLOWED:
        raise ValueError("unsupported frontmatter fields: " + ", ".join(sorted(set(data) - ALLOWED)))
    name = data.get("name")
    if not isinstance(name, str) or len(name) > 64 or not NAME.fullmatch(name):
        raise ValueError("invalid skill name")
    if name != path.parent.name:
        raise ValueError("skill name must match its directory")
    description = data.get("description")
    if not isinstance(description, str) or not description.strip() or len(description) > 1024:
        raise ValueError("description must be a non-empty string of at most 1024 characters")
    for field in ("license", "allowed-tools"):
        if field in data and (not isinstance(data[field], str) or not data[field].strip()):
            raise ValueError(f"{field} must be a non-empty string")
    if "compatibility" in data:
        compatibility = data["compatibility"]
        if not isinstance(compatibility, str) or not compatibility.strip() or len(compatibility) > 500:
            raise ValueError("invalid compatibility")
    if "metadata" in data:
        metadata = data["metadata"]
        if not isinstance(metadata, dict) or any(
            not isinstance(key, str) or not isinstance(value, str) for key, value in metadata.items()
        ):
            raise ValueError("metadata must map string keys to string values")
    return data


def check_links(path: Path, boundary: Path) -> list[str]:
    errors = []
    # Links in fenced examples are not live references.
    text = re.sub(r"(?ms)^```[^\n]*\n.*?^```\s*$", "", path.read_text(encoding="utf-8"))
    for target in LINK.findall(text):
        target = target.strip().strip("<>")
        url = urlsplit(target)
        if url.scheme or url.netloc or not url.path:
            continue
        destination = path.parent / unquote(url.path)
        if not inside(destination, boundary):
            errors.append(f"{path}: reference escapes its package: {target}")
        elif not destination.exists():
            errors.append(f"{path}: missing reference: {target}")
    return errors


def check_cases(path: Path, name: str) -> None:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict) or data.get("schema_version") != 1 or data.get("skill") != name:
        raise ValueError("invalid evaluation header")
    cases = data.get("cases")
    if not isinstance(cases, list) or not cases:
        raise ValueError("evaluation requires cases")
    seen = set()
    trigger_values = set()
    behaviors = 0
    for case in cases:
        if not isinstance(case, dict):
            raise ValueError("each case must be an object")
        identifier = case.get("id")
        if not isinstance(identifier, str) or not identifier or identifier in seen:
            raise ValueError("case IDs must be unique non-empty strings")
        seen.add(identifier)
        if not isinstance(case.get("request"), str) or not case["request"].strip():
            raise ValueError(f"{identifier}: request is required")
        if case.get("kind") == "trigger":
            expected = case.get("expected_trigger")
            if type(expected) is not bool:
                raise ValueError(f"{identifier}: expected_trigger must be boolean")
            trigger_values.add(expected)
        elif case.get("kind") == "behavior":
            behaviors += 1
            if not isinstance(case.get("input"), str) or not case["input"].strip():
                raise ValueError(f"{identifier}: input is required")
            for field in ("must_preserve", "must_not", "should_improve"):
                values = case.get(field)
                if not isinstance(values, list) or not values or any(
                    not isinstance(value, str) or not value.strip() for value in values
                ):
                    raise ValueError(f"{identifier}: {field} must be a non-empty string list")
        else:
            raise ValueError(f"{identifier}: unknown case kind")
    if trigger_values != {True, False} or not behaviors:
        raise ValueError("evaluations require positive/negative triggers and behavior cases")


def validate(root: Path) -> list[str]:
    errors = []
    directory = root / "skills"
    if not directory.is_dir():
        return ["missing skills directory"]
    packages = sorted(directory.iterdir())
    if not packages:
        return ["no skills found"]
    for package in packages:
        if package.is_symlink() or not package.is_dir():
            errors.append(f"{package}: skills must be real directories")
            continue
        for resource in package.rglob("*"):
            if resource.is_symlink():
                errors.append(f"{resource}: package resources must not be symlinks")
        try:
            data = load_skill(package / "SKILL.md")
            for document in package.rglob("*.md"):
                errors.extend(check_links(document, package))
            interface_path = package / "agents" / "openai.yaml"
            if interface_path.exists():
                interface_data = yaml.safe_load(interface_path.read_text(encoding="utf-8"))
                if not isinstance(interface_data, dict):
                    raise ValueError("openai.yaml must be a mapping")
                interface = interface_data.get("interface", {})
                if not isinstance(interface, dict):
                    raise ValueError("interface must be a mapping")
                for field in ("display_name", "short_description", "default_prompt"):
                    value = interface.get(field)
                    if not isinstance(value, str) or not value.strip():
                        raise ValueError(f"interface.{field} must be a non-empty string")
                if not 25 <= len(interface["short_description"]) <= 64:
                    raise ValueError("short_description must be 25–64 characters")
                if f"${data['name']}" not in interface["default_prompt"]:
                    raise ValueError("default_prompt must mention the skill")
            check_cases(root / "evals" / package.name / "cases.json", package.name)
        except (OSError, ValueError, yaml.YAMLError) as error:
            errors.append(f"{package}: {error}")
    for document in [root / "README.md", root / "AGENTS.md", *(root / "docs").glob("*.md")]:
        if document.is_file():
            errors.extend(check_links(document, root))
    return errors


def main() -> int:
    errors = validate(ROOT)
    for error in errors:
        print(f"ERROR: {error}")
    if errors:
        return 1
    print("Skill structure, references and evaluation fixtures are valid; model behavior is not evaluated.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
