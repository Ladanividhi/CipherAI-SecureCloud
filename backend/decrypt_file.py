"""In-memory AES-CBC decryption with RSA-unwrapped key.

All functions operate on ``bytes`` – no disk I/O happens here.
"""

from __future__ import annotations

from cryptography.hazmat.primitives import hashes, padding, serialization
from cryptography.hazmat.primitives.asymmetric import padding as asym_padding
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes


def decrypt_bytes(
    encrypted_blob: bytes,
    encrypted_aes_key: bytes,
    private_key_pem: bytes,
) -> bytes:
    """Decrypt *encrypted_blob* in memory.

    Parameters
    ----------
    encrypted_blob:    ``IV (16 bytes) || ciphertext`` as produced by ``encrypt_bytes``.
    encrypted_aes_key: RSA-OAEP-wrapped AES key.
    private_key_pem:   PEM-encoded RSA private key.

    Returns
    -------
    The original plaintext bytes.
    """
    # Unwrap AES key
    private_key = serialization.load_pem_private_key(private_key_pem, password=None)
    aes_key = private_key.decrypt(
        encrypted_aes_key,
        asym_padding.OAEP(
            mgf=asym_padding.MGF1(algorithm=hashes.SHA256()),
            algorithm=hashes.SHA256(),
            label=None,
        ),
    )

    # Split IV and ciphertext
    iv = encrypted_blob[:16]
    ciphertext = encrypted_blob[16:]

    # AES-CBC decrypt -> PKCS7 unpad
    cipher = Cipher(algorithms.AES(aes_key), modes.CBC(iv))
    decryptor = cipher.decryptor()
    padded = decryptor.update(ciphertext) + decryptor.finalize()

    unpadder = padding.PKCS7(128).unpadder()
    plaintext = unpadder.update(padded) + unpadder.finalize()

    return plaintext
