from __future__ import annotations

from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import HTTPException


def ensure_key_exists(path: Path, key_type: str) -> None:
    if not path.exists():
        raise HTTPException(
            status_code=500,
            detail=f"Missing {key_type} at {path}. Run generate_keys.py first.",
        )


def ensure_rsa_keys(public_key_path: Path, private_key_path: Path) -> None:
    """Ensure RSA key material exists for local encryption/decryption.

    - If both keys are missing, generates a fresh keypair.
    - If private exists but public is missing, derives public from private.
    - If public exists but private is missing, refuses (cannot decrypt previous files).
    """

    if private_key_path.exists():
        if not public_key_path.exists():
            private_key = serialization.load_pem_private_key(
                private_key_path.read_bytes(),
                password=None,
            )
            public_key = private_key.public_key()
            public_pem = public_key.public_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PublicFormat.SubjectPublicKeyInfo,
            )
            public_key_path.parent.mkdir(parents=True, exist_ok=True)
            public_key_path.write_bytes(public_pem)
        return

    if public_key_path.exists() and not private_key_path.exists():
        raise HTTPException(
            status_code=500,
            detail=f"Missing private key at {private_key_path}. Cannot decrypt without it.",
        )

    # Neither exists: generate a new pair.
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    public_key = private_key.public_key()

    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    public_pem = public_key.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )

    private_key_path.parent.mkdir(parents=True, exist_ok=True)
    public_key_path.parent.mkdir(parents=True, exist_ok=True)
    private_key_path.write_bytes(private_pem)
    public_key_path.write_bytes(public_pem)
