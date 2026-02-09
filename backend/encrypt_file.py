"""In-memory AES-CBC encryption with RSA-wrapped key.

All functions operate on ``bytes`` – no disk I/O happens here.
"""

from __future__ import annotations

from secrets import token_bytes

from cryptography.hazmat.primitives import hashes, padding, serialization
from cryptography.hazmat.primitives.asymmetric import padding as asym_padding
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes


def encrypt_bytes(
    plaintext: bytes,
    public_key_pem: bytes,
) -> tuple[bytes, bytes]:
    """Encrypt *plaintext* in memory using a fresh AES-256-CBC key.

    Parameters
    ----------
    plaintext:       Raw file content.
    public_key_pem:  PEM-encoded RSA public key used to wrap the AES key.

    Returns
    -------
    A 2-tuple ``(encrypted_blob, encrypted_aes_key)`` where
    *encrypted_blob* = ``IV (16 bytes) || ciphertext`` and
    *encrypted_aes_key* is the RSA-OAEP-wrapped AES key.
    """
    aes_key = token_bytes(32)
    iv = token_bytes(16)

    # PKCS7 pad -> AES-CBC encrypt
    padder = padding.PKCS7(128).padder()
    padded = padder.update(plaintext) + padder.finalize()

    cipher = Cipher(algorithms.AES(aes_key), modes.CBC(iv))
    encryptor = cipher.encryptor()
    ciphertext = encryptor.update(padded) + encryptor.finalize()

    encrypted_blob = iv + ciphertext

    # Wrap AES key with RSA public key
    public_key = serialization.load_pem_public_key(public_key_pem)
    encrypted_aes_key = public_key.encrypt(
        aes_key,
        asym_padding.OAEP(
            mgf=asym_padding.MGF1(algorithm=hashes.SHA256()),
            algorithm=hashes.SHA256(),
            label=None,
        ),
    )

    return encrypted_blob, encrypted_aes_key


def rewrap_aes_key(
    encrypted_aes_key: bytes,
    owner_private_key_pem: bytes,
    recipient_public_key_pem: bytes,
) -> bytes:
    """Decrypt the AES key with the owner's private key, then re-encrypt
    it with the recipient's public key.

    Parameters
    ----------
    encrypted_aes_key:        RSA-OAEP-wrapped AES key (owner-encrypted).
    owner_private_key_pem:    PEM-encoded RSA private key of the file owner.
    recipient_public_key_pem: PEM-encoded RSA public key of the share recipient.

    Returns
    -------
    The AES key re-wrapped with the recipient's RSA public key.
    """
    # Unwrap with owner's private key
    owner_private_key = serialization.load_pem_private_key(
        owner_private_key_pem, password=None
    )
    aes_key = owner_private_key.decrypt(
        encrypted_aes_key,
        asym_padding.OAEP(
            mgf=asym_padding.MGF1(algorithm=hashes.SHA256()),
            algorithm=hashes.SHA256(),
            label=None,
        ),
    )

    # Re-wrap with recipient's public key
    recipient_public_key = serialization.load_pem_public_key(recipient_public_key_pem)
    rewrapped = recipient_public_key.encrypt(
        aes_key,
        asym_padding.OAEP(
            mgf=asym_padding.MGF1(algorithm=hashes.SHA256()),
            algorithm=hashes.SHA256(),
            label=None,
        ),
    )

    return rewrapped
