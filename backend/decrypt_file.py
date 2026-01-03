from __future__ import annotations

from pathlib import Path

from cryptography.hazmat.primitives import hashes, padding, serialization
from cryptography.hazmat.primitives.asymmetric import padding as asym_padding
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

BASE_DIR = Path(__file__).resolve().parent.parent
FILES_DIR = BASE_DIR / "files"
KEYS_DIR = BASE_DIR / "keys"


def decrypt_file(
    encrypted_file_path: Path,
    encrypted_key_path: Path,
    output_path: Path,
    private_key_path: Path,
) -> None:
    """Decrypt ``encrypted_file_path`` into ``output_path`` using stored AES material."""

    if not encrypted_file_path.exists():
        raise FileNotFoundError(f"Encrypted file not found: {encrypted_file_path}")

    if not encrypted_key_path.exists():
        raise FileNotFoundError(f"Encrypted AES key not found: {encrypted_key_path}")

    encrypted_key = encrypted_key_path.read_bytes()
    private_key = serialization.load_pem_private_key(
        private_key_path.read_bytes(),
        password=None,
    )

    aes_key = private_key.decrypt(
        encrypted_key,
        asym_padding.OAEP(
            mgf=asym_padding.MGF1(algorithm=hashes.SHA256()),
            algorithm=hashes.SHA256(),
            label=None,
        ),
    )

    blob = encrypted_file_path.read_bytes()
    iv, ciphertext = blob[:16], blob[16:]

    cipher = Cipher(algorithms.AES(aes_key), modes.CBC(iv))
    decryptor = cipher.decryptor()
    padded_data = decryptor.update(ciphertext) + decryptor.finalize()

    unpadder = padding.PKCS7(128).unpadder()
    data = unpadder.update(padded_data) + unpadder.finalize()

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(data)


def decrypt_sample_file() -> None:
    """Original CLI behavior preserved for manual checks."""

    encrypted_file = FILES_DIR / "sample_encrypted.bin"
    output_file = FILES_DIR / "sample_decrypted.pdf"
    encrypted_key_file = KEYS_DIR / "sample_encrypted_aes.key"

    decrypt_file(
        encrypted_file_path=encrypted_file,
        encrypted_key_path=encrypted_key_file,
        output_path=output_file,
        private_key_path=KEYS_DIR / "private.pem",
    )

    print("File decrypted successfully!")


if __name__ == "__main__":
    decrypt_sample_file()
