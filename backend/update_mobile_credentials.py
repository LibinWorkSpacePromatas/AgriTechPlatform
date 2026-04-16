from __future__ import annotations

import argparse
from dataclasses import dataclass

from sqlalchemy import text

from app.core.password_security import hash_password
from app.db.bootstrap import ensure_user_auth_columns
from app.db.database import engine


@dataclass(frozen=True)
class UserCredential:
    name: str
    email: str
    password: str
    role: str
    aliases: tuple[str, ...] = ()


DEFAULT_CREDENTIALS = [
    UserCredential("Alex Buyer", "alex.buyer@agritech.app", "AlexBuyer@123", "bidder"),
    UserCredential("David Anderson", "david.anderson@agritech.app", "DavidAnderson@123", "farmer"),
    UserCredential("Emma Williams", "emma.williams@agritech.app", "EmmaWilliams@123", "farmer"),
    UserCredential(
        "James Mitchall",
        "james.mitchell@agritech.app",
        "JamesMitchell@123",
        "farmer",
        aliases=("James Mitchell",),
    ),
    UserCredential("Michael Chen", "michael.chen@agritech.app", "MichaelChen@123", "farmer"),
    UserCredential("Olivia Parker", "olivia.parker@agritech.app", "OliviaParker@123", "farmer"),
    UserCredential("Sarah Thompson", "sarah.thompson@agritech.app", "SarahThompson@123", "farmer"),
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Apply mobile login email/password credentials to existing users."
    )
    parser.add_argument(
        "--name",
        action="append",
        dest="names",
        help="Only update specific user names. Can be passed multiple times.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show which rows would be updated without writing to the database.",
    )
    return parser.parse_args()


def selected_credentials(names: list[str] | None) -> list[UserCredential]:
    if not names:
        return DEFAULT_CREDENTIALS

    selected_names = {name.strip().lower() for name in names if name.strip()}
    return [credential for credential in DEFAULT_CREDENTIALS if credential.name.lower() in selected_names]


def apply_credentials(credentials: list[UserCredential], dry_run: bool) -> int:
    if not credentials:
        print("No matching credentials selected.")
        return 1

    ensure_user_auth_columns()

    updated: list[str] = []
    missing: list[str] = []

    with engine.begin() as connection:
        for credential in credentials:
            matched_name = None
            for candidate_name in (credential.name, *credential.aliases):
                row = connection.execute(
                    text("SELECT id FROM users WHERE name = :name"),
                    {"name": candidate_name},
                ).fetchone()
                if row:
                    matched_name = candidate_name
                    break

            if not matched_name:
                missing.append(credential.name)
                continue

            if dry_run:
                updated.append(f"{credential.name} -> {credential.email}")
                continue

            connection.execute(
                text(
                    """
                    UPDATE users
                    SET
                        email = :email,
                        password_hash = :password_hash,
                        role = COALESCE(role, :role)
                    WHERE name = :name
                    """
                ),
                {
                    "name": matched_name,
                    "email": credential.email.strip().lower(),
                    "password_hash": hash_password(credential.password),
                    "role": credential.role,
                },
            )
            updated.append(f"{credential.name} -> {credential.email}")

    action = "Would update" if dry_run else "Updated"
    if updated:
        print(f"{action} {len(updated)} user(s):")
        for item in updated:
            print(f"  - {item}")

    if missing:
        print(f"Missing {len(missing)} user(s):")
        for name in missing:
            print(f"  - {name}")

    return 0 if updated else 1


if __name__ == "__main__":
    args = parse_args()
    raise SystemExit(apply_credentials(selected_credentials(args.names), args.dry_run))
