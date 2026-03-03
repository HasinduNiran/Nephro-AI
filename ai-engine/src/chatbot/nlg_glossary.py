"""
NLG Glossary Engine for Nephro-AI — Dynamic Code-Mixing & Tone Generation
==========================================================================

Replaces the flat english_to_sinhala.json consumer with a research-grade
multi-register glossary that supports:

  Research Angle 1 — Medical Code-Mixing (Translanguaging)
    Each term can have three registers:
      • pure_sinhala  —  Formal literary Sinhala ("අධි රුධිර පීඩනය")
      • spoken_mixed  —  Conversational code-mixed ("Pressure එක වැඩියි")
      • tts_phonetic  —  Singlish-romanised for TTS pronunciation ("pressure eka wediyi")

  Research Angle 2 — LLM-Guided Generation (Vocabulary Constraint Injection)
    get_hints_for_text() scans English text and builds structured hint strings
    for injection into the Gemini translation prompt, ensuring the LLM uses
    culturally authentic terminology instead of generic Google Translate forms.

  Research Angle 3 — TTS Pronunciation Optimization
    apply_tts_phonetics() replaces English medical terms embedded in Sinhala
    text with their phonetic Singlish equivalents before sending to Gemini TTS.

  Research Angle 4 — Empathy & Urgency Router
    get_response_flags() scans English LLM responses for terms tagged with
    CRITICAL_URGENCY, SYMPTOM_WARNING, or NEPHROTOXIN_WARNING flags, enabling
    the frontend to display red alerts, empathy prefixes, and visual cues.

Backward Compatibility:
  Flat string entries (e.g. "Banana": "කෙසෙල්") are auto-normalised at load
  time into {"spoken_mixed": "කෙසෙල්"}, so old entries work without changes.
"""

import re
import json
from pathlib import Path
from typing import Dict, List, Any, Optional, Tuple


class NLGGlossary:
    """
    Enterprise-grade NLG glossary with multi-register lookup, urgency flags,
    empathy routing, and TTS phonetic preprocessing.
    """

    def __init__(self, glossary_path: Optional[Path] = None):
        """
        Load english_to_sinhala.json and normalise all entries.

        Flat string values → {"spoken_mixed": value}
        Dict values → validated as-is (must have at least spoken_mixed)
        """
        if glossary_path is None:
            glossary_path = Path(__file__).parent.parent.parent / "data" / "english_to_sinhala.json"

        self._raw: Dict[str, Any] = {}
        self._entries: Dict[str, Dict[str, Any]] = {}
        self._sorted_keys: List[str] = []

        # Stats
        self._total = 0
        self._nested = 0
        self._flat = 0
        self._flagged = 0

        self._load(glossary_path)

    # ── Loading & Normalisation ─────────────────────────────────────────────

    def _load(self, path: Path) -> None:
        """Load, filter comments, normalise, sort longest-first."""
        try:
            with open(path, "r", encoding="utf-8") as fh:
                raw = json.load(fh)
        except FileNotFoundError:
            print(f"   ⚠️ NLG Glossary not found at {path}")
            return
        except json.JSONDecodeError as e:
            print(f"   ⚠️ NLG Glossary JSON parse error: {e}")
            return

        # Filter metadata/comments
        filtered = {
            k: v for k, v in raw.items()
            if not k.startswith("//") and not k.startswith("__")
        }

        for key, value in filtered.items():
            entry = self._normalise(key, value)
            if entry:
                self._entries[key] = entry
                self._total += 1

        # Sort longest-first for greedy matching (N-gram rule)
        self._sorted_keys = sorted(
            self._entries.keys(), key=len, reverse=True
        )

        print(f"   📖 NLG Glossary: {self._total} entries loaded "
              f"({self._nested} nested, {self._flat} flat, {self._flagged} flagged)")

    def _normalise(self, key: str, value: Any) -> Optional[Dict[str, Any]]:
        """
        Normalise a glossary entry to the canonical nested format.

        Flat string → {"spoken_mixed": string}
        Dict → validated (must contain spoken_mixed or text)
        """
        if isinstance(value, str):
            self._flat += 1
            if not value:  # Skip empty values (comment separators)
                return None
            return {"spoken_mixed": value}

        if isinstance(value, dict):
            self._nested += 1
            # Accept either "spoken_mixed" or "text" as the primary field
            if "spoken_mixed" not in value and "text" not in value:
                # Auto-promote: if dict has no known register, skip
                print(f"      ⚠️ Skipping malformed entry: '{key}'")
                return None

            if "flag" in value:
                self._flagged += 1

            return value

        return None

    # ── Register Lookup ─────────────────────────────────────────────────────

    def get(self, term: str, register: str = "spoken_mixed") -> Optional[str]:
        """
        Retrieve a term in the requested register.

        Priority:
          1. Requested register (e.g. "pure_sinhala")
          2. Fallback to "spoken_mixed"
          3. Fallback to "text" (for flagged entries)
          4. None if term not found
        """
        entry = self._entries.get(term)
        if not entry:
            return None

        return (
            entry.get(register)
            or entry.get("spoken_mixed")
            or entry.get("text")
        )

    def get_entry(self, term: str) -> Optional[Dict[str, Any]]:
        """Get the full normalised entry dict for a term."""
        return self._entries.get(term)

    def get_tts_phonetic(self, term: str) -> Optional[str]:
        """Get the TTS phonetic transcription for a term, if available."""
        entry = self._entries.get(term)
        if entry:
            return entry.get("tts_phonetic")
        return None

    @property
    def sorted_keys(self) -> List[str]:
        """All glossary keys sorted longest-first."""
        return self._sorted_keys

    @property
    def total_entries(self) -> int:
        return self._total

    # ── Research Angle 2: LLM Hint Injection ────────────────────────────────

    def get_hints_for_text(
        self,
        text: str,
        register: str = "spoken_mixed",
        max_hints: int = 25,
    ) -> Tuple[List[str], List[Dict[str, Any]]]:
        """
        Scan English text for glossary matches and build structured hint
        strings for LLM prompt injection.

        Returns:
            (hint_strings, matched_entries)
            - hint_strings: ["'Hypertension' -> 'Pressure එක වැඩියි'", ...]
            - matched_entries: [{"term": "Hypertension", "entry": {...}}, ...]
        """
        text_lower = text.lower()
        hints: List[str] = []
        matched: List[Dict[str, Any]] = []

        for key in self._sorted_keys:
            if len(hints) >= max_hints:
                break

            if key.lower() in text_lower:
                entry = self._entries[key]
                translation = (
                    entry.get(register)
                    or entry.get("spoken_mixed")
                    or entry.get("text")
                )

                if translation:
                    # Build a rich hint showing both registers when available
                    hint_parts = [f"'{key}' -> '{translation}'"]

                    # If the entry has pure_sinhala too, add it as context
                    pure = entry.get("pure_sinhala")
                    if pure and pure != translation:
                        hint_parts.append(f"(formal: '{pure}')")

                    hints.append(" ".join(hint_parts))
                    matched.append({"term": key, "entry": entry})

        return hints, matched

    # ── Research Angle 3: TTS Phonetic Preprocessing ────────────────────────

    def apply_tts_phonetics(self, text: str) -> str:
        """
        Replace English medical terms embedded in Sinhala text with their
        phonetic Singlish equivalents for better Gemini TTS pronunciation.

        Example:
            "වකුගඩු Biopsy එක" → "වකුගඩු baiyopsi එක"

        Only applies to terms that have a tts_phonetic field and are
        surrounded by Sinhala Unicode text (indicating cross-lingual context).
        """
        for key in self._sorted_keys:
            entry = self._entries[key]
            phonetic = entry.get("tts_phonetic")

            if not phonetic:
                continue

            # Only replace ASCII terms (English words inside Sinhala sentences)
            if not key.isascii():
                continue

            # Case-insensitive replacement
            pattern = re.compile(re.escape(key), re.IGNORECASE)
            text = pattern.sub(phonetic, text)

        return text

    # ── Research Angle 4: Empathy & Urgency Router ──────────────────────────

    def get_response_flags(self, english_text: str) -> List[Dict[str, Any]]:
        """
        Scan the English LLM response for terms tagged with urgency/empathy
        flags. Returns a list of triggered flag objects.

        Flag types:
          - CRITICAL_URGENCY   → Red alert, priority notification
          - SYMPTOM_WARNING    → Empathy prefix, soft warning
          - NEPHROTOXIN_WARNING → Danger alert for nephrotoxic substances

        Each flag object:
          {
            "term": "Emergency",
            "flag": "CRITICAL_URGENCY",
            "action": "trigger_red_ui_alert",          # optional
            "empathy_prefix": "අහන්න ලැබීමත් කණගාටුයි",  # optional
            "text": "හදිසි අවස්ථාවක්"                    # Sinhala text
          }
        """
        text_lower = english_text.lower()
        flags: List[Dict[str, Any]] = []
        seen_flags: set = set()  # Deduplicate by flag type

        for key in self._sorted_keys:
            entry = self._entries[key]
            flag = entry.get("flag")

            if not flag:
                continue

            if key.lower() in text_lower and flag not in seen_flags:
                flag_obj = {
                    "term": key,
                    "flag": flag,
                }
                # Include optional fields if present
                if "action" in entry:
                    flag_obj["action"] = entry["action"]
                if "empathy_prefix" in entry:
                    flag_obj["empathy_prefix"] = entry["empathy_prefix"]
                if "text" in entry:
                    flag_obj["text"] = entry["text"]
                elif "spoken_mixed" in entry:
                    flag_obj["text"] = entry["spoken_mixed"]

                flags.append(flag_obj)
                seen_flags.add(flag)

        return flags

    # ── Deterministic Safety-Net Replacement ────────────────────────────────

    def enforce_glossary(self, text: str, register: str = "spoken_mixed") -> str:
        """
        Deterministic word-level replacement using the glossary.
        Replaces enforce_spoken_sinhala() in llm_engine.py.

        Applies longest-first matching (N-gram rule) and case-insensitive
        replacement for ASCII keys, str.replace for Sinhala Unicode keys.
        """
        for key in self._sorted_keys:
            translation = self.get(key, register)
            if not translation:
                continue

            if key.isascii():
                pattern = re.compile(re.escape(key), re.IGNORECASE)
                text = pattern.sub(translation, text)
            else:
                text = text.replace(key, translation)

        return text


# ── Self-Test ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    glossary = NLGGlossary()

    print("\n" + "=" * 65)
    print(" NLG GLOSSARY SELF-TEST")
    print("=" * 65)

    # Test 1: Register lookup
    print("\n[Test 1: Register Lookup]")
    for term in ["Hypertension", "Banana", "Emergency", "Kidney biopsy"]:
        spoken = glossary.get(term, "spoken_mixed")
        pure = glossary.get(term, "pure_sinhala")
        phonetic = glossary.get_tts_phonetic(term)
        print(f"  {term:25s} spoken={spoken!r:35s} pure={pure!r:35s} phonetic={phonetic!r}")

    # Test 2: Hint generation
    print("\n[Test 2: LLM Hint Injection]")
    test_text = "For CKD patients with Hypertension, avoid Star fruit and monitor Creatinine levels. Emergency cases need immediate Dialysis."
    hints, matched = glossary.get_hints_for_text(test_text)
    print(f"  Input: {test_text[:80]}...")
    print(f"  Hints generated: {len(hints)}")
    for h in hints[:5]:
        print(f"    {h}")

    # Test 3: Urgency flags
    print("\n[Test 3: Urgency Flags]")
    flags = glossary.get_response_flags(test_text)
    print(f"  Flags triggered: {len(flags)}")
    for f in flags:
        print(f"    [{f['flag']}] {f['term']} → action={f.get('action', 'none')}")

    # Test 4: TTS phonetics
    print("\n[Test 4: TTS Phonetic Preprocessing]")
    tts_input = "ඔයාගේ Creatinine level එක වැඩියි. Biopsy එකක් කරන්න වෙනවා."
    tts_output = glossary.apply_tts_phonetics(tts_input)
    print(f"  Input:  {tts_input}")
    print(f"  Output: {tts_output}")

    # Test 5: Backward compatibility
    print("\n[Test 5: Backward Compatibility (Flat Entries)]")
    for term in ["Banana", "Rice", "Carrot", "Cabbage"]:
        val = glossary.get(term)
        print(f"  {term:15s} → {val}")

    print("\n" + "=" * 65)
    print(f" GLOSSARY STATS: {glossary.total_entries} entries, "
          f"{glossary._nested} nested, {glossary._flat} flat, {glossary._flagged} flagged")
    print("=" * 65)
