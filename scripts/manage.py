#!/usr/bin/env python3
"""Link skills without replacing unrelated files; unlink only exact owned links."""

import argparse
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def skills(root: Path) -> dict[str, Path]:
    directory = root / "skills"
    return {
        path.name: path.resolve()
        for path in sorted(directory.iterdir())
        if not path.is_symlink() and path.is_dir() and (path / "SKILL.md").is_file()
    }


def owned_link(destination: Path, source: Path) -> bool:
    return destination.is_symlink() and destination.resolve() == source.resolve()


def manage(action: str, target: Path, selected: dict[str, Path], dry_run=False) -> int:
    conflicts = 0
    if target.exists() and not target.is_dir():
        print(f"conflict: target is not a directory: {target}")
        return 1
    for name, source in selected.items():
        destination = target / name
        owned = owned_link(destination, source)
        occupied = destination.exists() or destination.is_symlink()
        if action == "status":
            state = "linked" if owned else "conflict" if occupied else "absent"
            print(f"{state}: {destination}")
        elif action == "link":
            if owned:
                print(f"linked: {destination}")
            elif occupied:
                print(f"conflict (kept): {destination}")
                conflicts += 1
            else:
                if not dry_run:
                    target.mkdir(parents=True, exist_ok=True)
                    destination.symlink_to(source, target_is_directory=True)
                print(f"{'would link' if dry_run else 'linked'}: {destination} -> {source}")
        elif action == "unlink":
            if owned:
                if not dry_run:
                    destination.unlink()
                print(f"{'would unlink' if dry_run else 'unlinked'}: {destination}")
            elif occupied:
                print(f"foreign (kept): {destination}")
            else:
                print(f"absent: {destination}")
    return 1 if conflicts else 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["link", "status", "unlink"])
    parser.add_argument("--target", required=True, type=Path)
    parser.add_argument("--skill", action="append", help="Select a skill; repeat for several. Default: all.")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    available = skills(ROOT)
    if args.skill:
        unknown = set(args.skill) - available.keys()
        if unknown:
            parser.error("Unknown skills: " + ", ".join(sorted(unknown)))
        available = {name: available[name] for name in sorted(set(args.skill))}
    try:
        return manage(args.action, args.target.expanduser().absolute(), available, args.dry_run)
    except (OSError, RuntimeError) as error:
        print(f"error: {error}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
