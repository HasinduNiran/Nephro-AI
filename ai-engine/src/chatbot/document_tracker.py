import hashlib
import json
import os
from pathlib import Path


class DocumentTracker:
    """
    Enterprise-grade deduplication tracker using SHA-256 content hashing.

    Generates a cryptographic fingerprint of each PDF's raw bytes and records
    it in a local JSON manifest.  Before extraction, the pipeline checks the
    manifest — if the fingerprint already exists the file is skipped instantly,
    regardless of filename.

    Key properties:
      • RAM-safe: reads files in 4 MB chunks (handles multi-GB textbooks).
      • Crash-resilient: only marks a file after *successful* extraction.
      • True dedup: identical content from different paths / names is detected.
    """

    def __init__(self, manifest_path="data/processed/processed_manifest.json"):
        self.manifest_path = Path(manifest_path)
        self.processed_files = self._load_manifest()

    def _load_manifest(self) -> dict:
        """Loads the JSON file containing the hashes of already processed PDFs."""
        if self.manifest_path.exists():
            with open(self.manifest_path, "r", encoding="utf-8") as f:
                return json.load(f)
        return {}

    def _save_manifest(self):
        """Saves the updated dictionary back to the JSON file."""
        # Ensure the directory exists
        self.manifest_path.parent.mkdir(parents=True, exist_ok=True)
        with open(self.manifest_path, "w", encoding="utf-8") as f:
            json.dump(self.processed_files, f, indent=4)

    def get_file_hash(self, filepath: str) -> str:
        """
        Reads the PDF in binary chunks and generates a SHA-256 fingerprint.
        Chunking prevents RAM crashes on massive 3,000-page books.
        """
        sha256_hash = hashlib.sha256()
        with open(filepath, "rb") as f:
            # Read in 4MB chunks to save RAM
            for byte_block in iter(lambda: f.read(4096 * 1024), b""):
                sha256_hash.update(byte_block)
        return sha256_hash.hexdigest()

    def is_already_processed(self, filepath: str) -> bool:
        """Checks if the file's fingerprint is already in our manifest."""
        file_hash = self.get_file_hash(filepath)
        return file_hash in self.processed_files

    def mark_as_processed(self, filepath: str, chunk_count: int = 0):
        """Records the file as processed so it is never extracted again."""
        file_hash = self.get_file_hash(filepath)
        filename = os.path.basename(filepath)

        self.processed_files[file_hash] = {
            "filename": filename,
            "chunks_extracted": chunk_count,
            "status": "COMPLETED"
        }
        self._save_manifest()
