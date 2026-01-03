from __future__ import annotations

from pathlib import Path
from secrets import token_bytes

from cryptography.hazmat.primitives import hashes, padding, serialization
from cryptography.hazmat.primitives.asymmetric import padding as asym_padding
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

BASE_DIR = Path(__file__).resolve().parent.parent
FILES_DIR = BASE_DIR / "files"
KEYS_DIR = BASE_DIR / "keys"


def encrypt_file(
    input_path: Path,
    output_path: Path,
    public_key_path: Path,
    encrypted_key_path: Path,
) -> None:
    """Encrypt the file at ``input_path`` to ``output_path`` using a fresh AES key."""

    if not input_path.exists():
        raise FileNotFoundError(f"Input file not found: {input_path}")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    encrypted_key_path.parent.mkdir(parents=True, exist_ok=True)

    data = input_path.read_bytes()
    aes_key = token_bytes(32)
    iv = token_bytes(16)

    padder = padding.PKCS7(128).padder()
    padded_data = padder.update(data) + padder.finalize()

    cipher = Cipher(algorithms.AES(aes_key), modes.CBC(iv))
    encryptor = cipher.encryptor()
    encrypted_data = encryptor.update(padded_data) + encryptor.finalize()

    # Persist IV + ciphertext in a single blob for easier transport.
    output_path.write_bytes(iv + encrypted_data)

    public_key = serialization.load_pem_public_key(public_key_path.read_bytes())
    encrypted_aes_key = public_key.encrypt(
        aes_key,
        asym_padding.OAEP(
            mgf=asym_padding.MGF1(algorithm=hashes.SHA256()),
            algorithm=hashes.SHA256(),
            label=None,
        ),
    )

    encrypted_key_path.write_bytes(encrypted_aes_key)


def encrypt_sample_file() -> None:
    """Preserve the original CLI behavior for quick manual testing."""

    input_file = FILES_DIR / "sample.pdf"
    output_file = FILES_DIR / "sample_encrypted.bin"
    encrypted_key_file = KEYS_DIR / "sample_encrypted_aes.key"

    encrypt_file(
        input_path=input_file,
        output_path=output_file,
        public_key_path=KEYS_DIR / "public.pem",
        encrypted_key_path=encrypted_key_file,
    )

    print("File encrypted + AES key encrypted successfully!")


if __name__ == "__main__":
    encrypt_sample_file()
