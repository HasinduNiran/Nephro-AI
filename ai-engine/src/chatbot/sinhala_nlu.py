"""
Sinhala NLU Engine for Nephro-AI — Enterprise Edition
=======================================================
Upgrades over the flat-JSON v1:

  A. Longest-String-First (N-gram rule)
     Dictionary keys are sorted longest-first on load.  Multi-word phrases
     like "sudu bath" (White Rice) are matched before their sub-words ("bath").
     Without this, "sudu bath" would become "sudu Rice" and confuse the LLM.

  B. Sinhala Suffix Stripper (Stemming)
     Sinhala is agglutinative.  "wakugadu" (kidney) appears in real speech as
     "wakugaduwa", "wakugaduwata", "wakugaduwe", "wakugaduwen" etc.
     A regex strips common Singlish and Sinhala-romanised suffixes before the
     dictionary lookup so we don't need to hardcode every morphological form.

  C. Singlish Fuzzy Matching (Levenshtein / rapidfuzz)
     Singlish has no standard spelling.  One patient types "creatinin",
     another "kriatinin", another "creatin".  rapidfuzz.process.extractOne
     returns the best dictionary key with >= FUZZY_THRESHOLD (85 %) similarity
     so all phonetic variants map to the same English term.

Pipeline order inside extract_entities_hybrid():
  1. Unicode Sinhala  -> exact match (no stemming needed; Unicode is canonical)
  2. Singlish / Latin -> suffix-strip -> exact match
  3. Singlish / Latin -> fuzzy match (catches remaining phonetic variants)
  4. English entities -> direct MEDICAL_ENTITIES substring scan (code-switching)
"""

import re
import numpy as np
import sys
import json
from pathlib import Path
from typing import Dict, List, Any, Optional, Tuple

from sentence_transformers import SentenceTransformer, util

try:
    from rapidfuzz import process as fuzz_process, fuzz
    RAPIDFUZZ_AVAILABLE = True
except ImportError:
    RAPIDFUZZ_AVAILABLE = False
    print("   ⚠️ rapidfuzz not installed — fuzzy Singlish matching disabled. "
          "Run: pip install rapidfuzz")

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))
from chatbot.config import MEDICAL_ENTITIES


# ── Constants ──────────────────────────────────────────────────────────────────

# Minimum Levenshtein similarity (0-100) to accept a fuzzy match.
# 85 catches "creatinin" -> "creatinine" while rejecting false positives.
FUZZY_THRESHOLD = 85

# Sinhala / Singlish romanised suffixes kept for the legacy _strip_sinhala_suffixes
# method (still used as a fallback stem in the fuzzy stage).
SINHALA_SUFFIXES = re.compile(
    r'(walata|wagen|wata|wen|wa|ta|ge|la|ka)$',
    re.IGNORECASE
)

# Suffix cluster injected directly into per-key regex patterns so a single pass
# matches both the root and any grammatical suffix attached to it.
# Sorted longest-to-shortest (critical — alternation is greedy left-to-right).
# The group is optional (?:…)? so root-only forms still match.
# Examples:  wakugadu·wala, wakugadu·wata, wakugadu·wen, pressure·wa
_SUFFIX_CLUSTER = r'(?:walata|walin|wagen|wala|wata|wen|we|wa|tath|ta|gen|ge|yi|da|i)?'

# Symptom and food buckets for entity categorisation
SYMPTOM_TERMS = {
    "swelling", "pain", "vomiting", "dizziness", "fatigue", "nausea",
    "breathlessness", "itching", "cramps", "weakness", "headache",
    "frequent urination", "foamy urine", "blood in urine",
}
FOOD_TERMS = {
    "banana", "rice", "white rice", "red rice", "milk", "coconut", "salt",
    "fish", "meat", "chicken", "egg", "bread", "sugar", "tea", "coffee",
    "spinach", "potato", "tomato", "orange", "mango", "papaya",
}


class SinhalaNLUEngine:
    """
    Enterprise-grade Sinhala / Singlish NLU engine with:
      * LaBSE zero-shot intent classification (cross-lingual)
      * Longest-string-first dictionary translation
      * Sinhala suffix stemming before lookup
      * Fuzzy Levenshtein matching for phonetic Singlish variants
    """

    # ── Initialisation ─────────────────────────────────────────────────────────

    def __init__(self):
        print("🇱🇰 Initializing Sinhala NLU Engine (Enterprise Edition)...")

        # LaBSE model — maps Sinhala and English into the same vector space
        self.model = SentenceTransformer('sentence-transformers/LaBSE')

        # Intent anchor sentences (English — LaBSE maps Sinhala to these)
        self.intent_anchors = {
            "ask_diet": [
                "What can I eat?", "Is this food good for me?",
                "Diet plan for CKD", "Can I eat bananas?", "Food restrictions",
                "Which foods should I avoid?",
            ],
            "ask_symptoms": [
                "I have pain", "My legs are swelling", "I feel dizzy",
                "Symptoms of kidney disease", "Is this normal?",
                "I feel tired all the time", "Frequent urination",
            ],
            "ask_medication": [
                "Medicine side effects", "Should I take this pill?",
                "Treatment options", "Drugs for blood pressure",
                "What is this medicine for?",
            ],
            "get_lab_result": [
                "Check my creatinine", "What is my GFR?",
                "Blood test results", "Is my potassium high?",
                "What does my urine report mean?",
            ],
            "ask_emergency": [
                "I cannot breathe", "Severe chest pain",
                "Emergency help", "Call an ambulance",
                "I feel very sick right now",
            ],
            "greeting": [
                "Hello doctor", "Ayubowan", "Good morning", "Hi",
                "Kohomada", "Machan",
            ],
            "ask_general_health": [
                "How is my health condition?", "What is my health status?",
                "How am I doing overall?", "Is my health good or bad?",
                "Give me a summary of my condition",
                "How is my kidney condition?", "What is my overall health?",
            ],
        }

        # Pre-compute anchor embeddings once at startup
        self.anchor_embeddings: Dict[str, Any] = {}
        print("   Computing intent anchor embeddings...")
        for intent, phrases in self.intent_anchors.items():
            self.anchor_embeddings[intent] = self.model.encode(phrases)

        # Load and prepare dictionary (sorting + splitting)
        self._load_dictionary()
        print("✅ Sinhala NLU Engine ready!")

    # ── Dictionary loading ─────────────────────────────────────────────────────

    def _load_dictionary(self) -> None:
        """
        Load sinhala_med_dict.json and pre-process it for fast lookup:

          1. Sort all keys longest-first (N-gram rule — Enhancement A).
             Multi-word phrases are matched before any of their sub-words.

          2. Separate Unicode Sinhala keys from Latin/Singlish keys so the two
             code-paths in extract_entities_hybrid() never cross.

          3. Build a lowercase Latin lookup table for O(1) exact match,
             and a sorted list of Latin keys for the fuzzy candidate pool.
        """
        raw: Dict[str, str] = {}

        dict_path = Path(__file__).parent.parent.parent / "data" / "sinhala_med_dict.json"
        if not dict_path.exists():
            dict_path = Path(__file__).parent.parent / "data" / "sinhala_med_dict.json"

        try:
            with open(dict_path, "r", encoding="utf-8") as fh:
                raw = json.load(fh)
            print(f"   Loaded {len(raw)} terms from dictionary.")
        except FileNotFoundError:
            print("   ⚠️ Dictionary not found — using built-in fallback terms.")
            raw = {
                "වකුගඩු": "Kidney",
                "දියවැඩියාව": "Diabetes",
                "කෙසල්": "Banana",
                "බත්": "Rice",
                "ඉදිමීම": "Swelling",
                "කැක්කුම": "Pain",
                "ලේ": "Blood",
                "පීඩනය": "Pressure",
            }

        # Enhancement A: sort ALL keys longest-first
        sorted_items: List[Tuple[str, str]] = sorted(
            raw.items(), key=lambda kv: len(kv[0]), reverse=True
        )

        # Split into Unicode Sinhala vs Latin/Singlish
        self.unicode_dict: Dict[str, str] = {}
        self.latin_dict: Dict[str, str] = {}

        for key, value in sorted_items:
            # Characters in the Sinhala Unicode block: U+0D80 to U+0DFF
            if any('\u0D80' <= ch <= '\u0DFF' for ch in key):
                self.unicode_dict[key] = value
            else:
                self.latin_dict[key.lower()] = value

        # Sorted list of Latin keys — used as the rapidfuzz candidate pool
        self._latin_keys: List[str] = list(self.latin_dict.keys())

        print(f"   Dictionary split: {len(self.unicode_dict)} Unicode Sinhala | "
              f"{len(self.latin_dict)} Latin/Singlish keys")

    # ── Enhancement B: Sinhala suffix stripper ────────────────────────────────

    def _strip_sinhala_suffixes(self, word: str) -> str:
        """
        Strip one layer of common Singlish / Sinhala-romanised suffixes so that
        inflected forms like "wakugaduwa" -> "wakugadu" hit the dictionary.

        Only strips if the resulting stem has >= 4 characters to avoid
        over-stemming short words (e.g. "kata" must not become "ka").
        """
        match = SINHALA_SUFFIXES.search(word)
        if match:
            stem = word[: match.start()]
            if len(stem) >= 4:
                return stem
        return word

    # ── Enhancement C: fuzzy Singlish lookup ─────────────────────────────────

    def _fuzzy_lookup(self, word: str) -> Optional[str]:
        """
        Find the best-matching Latin/Singlish dictionary key using Levenshtein
        similarity via rapidfuzz (C-accelerated, handles 1,000-key pools in
        microseconds).  Returns the English translation if the best match
        scores >= FUZZY_THRESHOLD (85), otherwise None.
        """
        if not RAPIDFUZZ_AVAILABLE or not self._latin_keys:
            return None

        # Short-word guard: words under 4 chars must be exact matches only.
        # Prevents hallucinations like "ho" or "ada" matching inside longer words
        # (e.g. "thattwaya" spuriously matching the key "ada").
        if len(word) < 4:
            return None

        # Length-band filter: only compare against keys of similar length (±3
        # chars). A 3-letter key can never legitimately score >= 85 against an
        # 8-letter input, so excluding them prevents false positives and speeds
        # up the search on large dictionaries.
        min_len = max(1, len(word) - 3)
        max_len = len(word) + 3
        filtered_keys = [k for k in self._latin_keys if min_len <= len(k) <= max_len]
        if not filtered_keys:
            return None

        result = fuzz_process.extractOne(
            word,
            filtered_keys,
            scorer=fuzz.ratio,
            score_cutoff=FUZZY_THRESHOLD,
        )
        if result:
            matched_key, _score, _idx = result
            return self.latin_dict[matched_key]
        return None

    # ── Core translation pipeline ─────────────────────────────────────────────

    def translate_to_english(self, text: str) -> str:
        """
        Translate a raw Sinhala / Singlish / mixed query into English tokens
        using the three-stage pipeline:

          Stage 1 — Unicode exact match (longest-first, word-boundary regex)
          Stage 2 — Latin whole-text regex per key with optional suffix cluster
                    (longest-key-first, token consumption — no over-stemming)
          Stage 3 — Latin fuzzy match (Levenshtein >= 85 %) on remaining tokens

        Returns the translated string. Untranslated tokens are left as-is so
        the LaBSE embedding step handles them cross-lingually.
        """
        # Stage 1: replace Unicode Sinhala words with strict word-boundary
        # matching + token consumption so a matched key can't re-fire as a
        # substring of a later, shorter key.
        working = text
        for si_key, en_value in self.unicode_dict.items():
            pattern = r'\b' + re.escape(si_key) + r'\b'
            if re.search(pattern, working, re.UNICODE):
                working = re.sub(pattern, f" {en_value} ", working, flags=re.UNICODE)

        # Stage 2: per-key regex with optional suffix cluster on the whole text.
        # latin_dict is already sorted longest-key-first by _load_dictionary, so
        # "kahata" (Plain Tea) is evaluated before "kaha" (Yellow) — no over-stemming.
        # Each match is consumed immediately, so a shorter key can never fire on
        # the leftover letters of an already-matched longer word.
        for key, en_value in self.latin_dict.items():
            pattern = r'\b' + re.escape(key) + _SUFFIX_CLUSTER + r'\b'
            working = re.sub(pattern, f" {en_value} ", working, flags=re.IGNORECASE)

        # Stage 3: fuzzy match on any remaining un-translated Latin tokens.
        # At this point every matched Singlish word has been replaced with its
        # English value; only truly unknown tokens survive.
        final_tokens: List[str] = []
        for token in working.split():
            token_lower = token.lower().strip(".,!?;:'\"()")

            # Skip if this token is already an English translation (a value that
            # was injected in Stage 2 — it will already be the right word).
            # We detect this heuristically: if it contains only ASCII letters it
            # may still need fuzzy checking, so we let it through.
            fuzzy_hit = self._fuzzy_lookup(token_lower)
            if fuzzy_hit:
                final_tokens.append(fuzzy_hit)
            else:
                final_tokens.append(token)

        return " ".join(final_tokens)

    # ── Intent detection ───────────────────────────────────────────────────────

    def _detect_intent(self, query_embedding) -> Dict[str, float]:
        """
        Compare query embedding to pre-computed anchor embeddings.
        Returns a dict of {intent: cosine_similarity_score}.
        """
        scores: Dict[str, float] = {}
        for intent, anchors in self.anchor_embeddings.items():
            sim = util.cos_sim(query_embedding, anchors)
            scores[intent] = float(np.max(sim.numpy()))
        return scores

    # ── Entity extraction ──────────────────────────────────────────────────────

    def _categorise(self, en_term: str, entities: Dict[str, List[str]]) -> None:
        """Add an English term to the correct entity bucket, deduplicating."""
        term_lower = en_term.lower()
        if term_lower in FOOD_TERMS:
            bucket = "foods"
        elif term_lower in SYMPTOM_TERMS:
            bucket = "symptoms"
        else:
            bucket = "medical_terms"
        if en_term not in entities[bucket]:
            entities[bucket].append(en_term)

    def extract_entities_hybrid(self, text: str) -> Dict[str, List[str]]:
        """
        Four-layer entity extraction:

          Layer 1 — Unicode Sinhala exact match (longest-first)
          Layer 2 — Latin exact match after suffix stripping
          Layer 3 — Latin fuzzy match (Levenshtein >= 85 %)
          Layer 4 — English MEDICAL_ENTITIES substring scan
                    (catches Singlish code-switching: "Mage creatinine wadi")
        """
        entities: Dict[str, List[str]] = {
            "medical_terms": [],
            "foods": [],
            "symptoms": [],
        }

        # Layer 1: Unicode Sinhala — word-boundary regex (longest-first order
        # from _load_dictionary). Raw `in` substring check would match a short
        # key inside a longer unrelated word.
        for si_key, en_value in self.unicode_dict.items():
            pattern = r'\b' + re.escape(si_key) + r'\b'
            if re.search(pattern, text, re.UNICODE):
                self._categorise(en_value, entities)

        # Layers 2 & 3: whole-text regex per key with optional suffix cluster.
        # latin_dict is longest-key-first so "kahata" fires before "kaha".
        # We build a consumed copy of the text so no key fires on the leftover
        # letters of an already-matched longer word.  The original `text` is
        # preserved for Layer 4.
        consumed = text.lower()
        for key, en_value in self.latin_dict.items():
            pattern = r'\b' + re.escape(key) + _SUFFIX_CLUSTER + r'\b'
            if re.search(pattern, consumed, re.IGNORECASE):
                self._categorise(en_value, entities)
                # Consume the match so shorter keys can't fire on its letters
                consumed = re.sub(pattern, " [MATCHED] ", consumed, flags=re.IGNORECASE)

        # Layer 3b: fuzzy match on tokens that survived the regex pass.
        for token in consumed.split():
            if token == "[MATCHED]":
                continue
            token_lower = token.strip(".,!?;:'\"()")
            fuzzy_hit = self._fuzzy_lookup(token_lower)
            if fuzzy_hit:
                self._categorise(fuzzy_hit, entities)

        # Layer 4: English MEDICAL_ENTITIES (Singlish code-switching, e.g.
        # "Mage creatinine wadi"). Word-boundary regex prevents "GFR" matching
        # inside longer tokens like "eGFRcal".
        text_lower = text.lower()
        for entity in MEDICAL_ENTITIES:
            pattern = r'\b' + re.escape(entity.lower()) + r'\b'
            if re.search(pattern, text_lower) and entity not in entities["medical_terms"]:
                entities["medical_terms"].append(entity)

        return entities

    # ── Public API ─────────────────────────────────────────────────────────────

    def analyze_query(self, query: str) -> Dict[str, Any]:
        """
        Main entry point.  Full pipeline:
          1. Translate raw query to English tokens (Unicode + stem + fuzzy)
          2. Embed the translated query with LaBSE
          3. Zero-shot intent classification
          4. Multi-layer entity extraction (runs on original raw text)
          5. Build a clean English query string for the RAG engine
        """
        # Step 1: translate
        translated_text = self.translate_to_english(query)

        # Step 2: embed translated form (better cross-lingual alignment)
        query_embedding = self.model.encode(translated_text)

        # Step 3: intent classification
        intent_scores = self._detect_intent(query_embedding)
        top_intent = max(intent_scores, key=intent_scores.get)
        confidence = intent_scores[top_intent]

        # Step 4: entity extraction on the original raw text
        entities = self.extract_entities_hybrid(query)

        # Step 5: build RAG query string
        all_entities = (
            entities["medical_terms"] +
            entities["foods"] +
            entities["symptoms"]
        )
        if confidence > 0.5 and all_entities:
            mapped_query = f"{top_intent.replace('_', ' ')} {' '.join(all_entities)}"
        elif confidence > 0.5:
            mapped_query = translated_text
        else:
            mapped_query = translated_text

        return {
            "original_query":   query,
            "translated_query": mapped_query,
            "translated_text":  translated_text,
            "detected_intent":  top_intent,
            "confidence":       round(confidence, 3),
            "entities":         entities,
            "intent_scores":    {k: round(v, 3) for k, v in intent_scores.items()},
        }


# ── Self-test ──────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    nlu = SinhalaNLUEngine()

    tests = [
        ("Pure Sinhala — can I eat bananas?",  "මට කෙසල් කන්න පුළුවන්ද?"),
        ("Singlish — my creatinine is high",   "Mage creatinine wadi wela"),
        ("Suffix form — kidney",               "wakugaduwa dukkay karannawa"),
        ("Fuzzy — misspelled creatinine",      "mage kriatinin wadi"),
        ("Fuzzy — misspelled eGFR",            "ege efar wadi wenawa"),
        ("Code-switch — potassium",            "mage potassium level wadi da?"),
        ("English direct",                     "What foods should I avoid for CKD?"),
    ]

    print("\n" + "=" * 65)
    print(" SINHALA NLU SELF-TEST")
    print("=" * 65)
    for desc, q in tests:
        result = nlu.analyze_query(q)
        print(f"\n[{desc}]")
        print(f"  Input      : {q}")
        print(f"  Translated : {result['translated_text']}")
        print(f"  RAG query  : {result['translated_query']}")
        print(f"  Intent     : {result['detected_intent']} (conf={result['confidence']})")
        print(f"  Entities   : {result['entities']}")
