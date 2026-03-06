"""
LLM Engine for Nephro-AI
Handles communication with OpenRouter API to generate responses.
Implements the 'Sandwich Architecture' for Low-Resource Languages.
"""

import sys
import json
import requests
import re
import os
from pathlib import Path
from typing import List, Dict, Any

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from chatbot import config
from chatbot.sinhala_nlu import SinhalaNLUEngine
from chatbot.nlg_glossary import NLGGlossary
from utils.logger import ConsoleLogger as Log

class LLMEngine:
    def __init__(self):
        """Initialize LLM Engine with OpenRouter API"""
        self.api_key = config.OPENROUTER_API_KEY
        self.api_url = "https://openrouter.ai/api/v1/chat/completions"
        
        # RESEARCH NOTE: Using Gemini 2.5 Flash through OpenRouter
        self.model = "google/gemini-2.5-flash"
        
        # Initialize Sinhala NLU
        self.sinhala_nlu = SinhalaNLUEngine()
        
        if not self.api_key:
            print("⚠️ Warning: OPENROUTER_API_KEY not found in config.")
        else:
            print(f"✅ Initialized OpenRouter with model: {self.model}")
            
        # Cache Setup
        self.cache_path = config.DATA_DIR / "translation_cache.json"
        self.translation_cache = self._load_translations()
        
        # Default terms
        if not self.translation_cache:
            self.translation_cache = {
                "වකුගඩු රෝගය": "Kidney Disease",
                "ක්‍රියැටිනින්": "Creatinine",
                "mage": "my",
                "kanna": "eat"
            }
            self._save_translations()

        # Hybrid Search: Load Medical Dictionary
        self.med_dict = {}
        try:
            dict_path = config.DATA_DIR / "sinhala_med_dict.json"
            if dict_path.exists():
                with open(dict_path, "r", encoding="utf-8") as f:
                    raw_dict = json.load(f)
                    # Filter out metadata/comments
                    self.med_dict = {k.lower(): v for k, v in raw_dict.items() if not k.startswith("//") and not k.startswith("__")}
                print(f"✅ Loaded {len(self.med_dict)} Sinhala/Singlish terms from dictionary.")
        except Exception as e:
            print(f"⚠️ Warning: Could not load Sinhala Dictionary: {e}")

        # 🆕 NLG GLOSSARY — Dynamic Code-Mixing & Tone Generation Engine
        self.glossary = NLGGlossary(config.DATA_DIR / "english_to_sinhala.json")

    def _load_translations(self) -> Dict[str, str]:
        if self.cache_path.exists():
            try:
                with open(self.cache_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception: pass
        return {}

    def _save_translations(self):
        try:
            with open(self.cache_path, "w", encoding="utf-8") as f:
                json.dump(self.translation_cache, f, ensure_ascii=False, indent=2)
        except Exception: pass

    def _is_sinhala_or_singlish(self, text: str) -> bool:
        """
        Detects if text is Sinhala (Unicode) OR Singlish.
        UPDATED: Uses substring matching to handle concatenated STT outputs.
        """
        # 1. Unicode Check (Standard Sinhala)
        if any('\u0D80' <= char <= '\u0DFF' for char in text):
            return True
            
        # 2. Singlish Keyword Check (Expanded for Medical/CKD Context)
        singlish_keywords = [
            # --- Pronouns & Question Words ---
            "mage", "mata", "mam", "mama", "api", "ape", "oyage", "oya",
            "mokakda", "monawada", "kohomada", "kawadada", "koheda", "ai", 
            "kawuda", "neda", "ane", "puluwan", "puluwanda", "ba", "bane",
            
            # --- Body Parts (Anatomy) ---
            "wakkugadu", "wakugadu", "kidney", # Kidney
            "kakul", "kakula", "kakuldke", "dath", "atha", "ath", # Legs/Hands
            "oluwa", "his", "hisa", # Head
            "bada", "papuwa", "pappuwa", # Stomach/Chest
            "muthra", "mutra", "chu", "choo", # Urine (Critical for CKD)
            " le ", "lee", "blood", # Blood (Padded ' le ' to avoid matching 'apple')
            "angili", "angilla", # Fingers
            "hama", "skin", # Skin
            
            # --- Symptoms & Feelings ---
            "ridenawa", "redena", "kakkumai", "kakkuma", # Pain
            "idimila", "edimila", "idimuma", "idimenne", "dimenne", # Swelling (Edema)
            "mahansiyi", "mahansi", "weda", # Tiredness/Fatigue
            "karakillai", "karakilla", # Dizziness
            "wamaney", "wamane", "okkara", # Vomiting/Nausea
            "kessai", "kessa", # Cough
            "una", "heat", "rasnei", # Fever/Heat
            "dawillai", "davilla", # Burning sensation
            "amaru", "amarui", # Difficult/Painful
            "bayayi", "baya", # Scared
            "nidimathai", "ninda", # Sleepy
            
            # --- Food & Diet (Critical for CKD) ---
            "kanna", "kana", "kema", "kaama", "kam", # Eat/Food
            "bonna", "bila", "beela", # Drink
            "wathura", "watura", "water", # Water
            "lunu", "salt", # Salt
            "seeni", "sugar", # Sugar
            "thel", "tel", # Oil
            "bath", "bat", "rice", # Rice
            "parippu", "dhal", # Lentils
            "elawalu", "elavalu", # Vegetables
            "palathuru", "palaturu", "fruit", # Fruits
            "mas", "malu", "biththara", "bittara", # Meat/Fish/Eggs
            "kiri", "tea", # Milk/Tea
            "koththamalli", "thambili", # Herbal/King Coconut
            # Specific Fruits/Veg common in queries:
            "kesel", "kehel", "banana",
            "amba", "aba", "mango",
            "papol", "papaya",
            "del", "kos", "jackfruit",
            
            # --- Medical Actions & Terms ---
            "beheth", "behet", "pethi", "peti", # Medicine/Pills
            "injection", "vidda", 
            "check", "pariksha", "test", "report", # Tests
            "doctar", "dosthara", "nurse", # Staff
            "nawaththanna", "nawathanna", # Stop
            "ganna", "gaththa", # Take/Took
            "adui", "wadi", "godak", "tika", # Low/High/Lot/Little
            "pressure", "presha", "bp", # Blood Pressure
            "sugar", "sini", "diabetic", # Diabetes
            "clinic", "hospital", "issaraha", # Locations
            "pramanaya", "kochchara", "koccara", # Quantity
            "nedde", "nadda", # Negative questions
            "etokota", "ethakota" # Then/So
        ]
        
        text_lower = text.lower()
        
        # FIX: Check if keyword is INSIDE the text, not just an exact split
        for keyword in singlish_keywords:
            if keyword in text_lower:
                return True
                
        return False

    def _get_dictionary_hints(self, text: str) -> str:
        """
        [SEMANTIC SEARCH] Scans input for dictionary matches, PRIORITIZING PHRASES.
        Uses word-boundary matching for ASCII keys to prevent substring false-positives
        (e.g. "mata" inside "mata kiyanna" being matched separately).
        """
        matches = []
        text_lower = text.lower()

        # Sort keys longest-first so "kanna hoda nathi" matches before "hoda"
        sorted_keys = sorted(self.med_dict.keys(), key=len, reverse=True)

        # Track character positions already claimed by a longer match
        occupied: set = set()

        for key in sorted_keys:
            if key.startswith("//") or key.startswith("__"):
                continue

            if key.isascii():
                # Word-boundary match for ASCII keys — prevents "mata" inside "mata kiyanna"
                try:
                    pattern = re.compile(r'\b' + re.escape(key) + r'\b', re.IGNORECASE)
                except re.error:
                    pattern = re.compile(re.escape(key), re.IGNORECASE)
                m = pattern.search(text_lower)
                if m:
                    span = range(m.start(), m.end())
                    if not any(pos in occupied for pos in span):
                        occupied.update(span)
                        matches.append(f"'{key}' = '{self.med_dict[key]}'")
            else:
                # Substring match for Sinhala Unicode keys (no Latin word-boundaries in Sinhala)
                idx = text_lower.find(key)
                if idx != -1:
                    span = range(idx, idx + len(key))
                    if not any(pos in occupied for pos in span):
                        occupied.update(span)
                        matches.append(f"'{key}' = '{self.med_dict[key]}'")

        if not matches:
            return ""

        # Limit to top 8 unique matches
        unique_matches = []
        seen = set()
        for m in matches:
            if m not in seen:
                unique_matches.append(m)
                seen.add(m)
                if len(unique_matches) >= 8:
                    break

        return ", ".join(unique_matches)

    def contextualize_query(self, query: str, history: List[Dict]) -> str:
        """
        [INDUSTRY STANDARD] Standalone Query Generator.
        Rewrites the query to include context from history.
        """
        if not history:
            return query
            
        # Take last 2 turns only (for speed)
        short_history = history[-2:]
        history_text = "\n".join([f"{msg['role']}: {msg['content']}" for msg in short_history])
        
        Log.step("🧠", "REWRITER: Contextualizing...", f"History: {len(short_history)} turns")

        # 🚨 FIX: STRICTER PROMPT to stop "As Nephro-AI" hallucinations
        prompt = (
            "You are a query rewriting engine. Your job is to combine the Chat History and the Latest Question "
            "into a single, standalone question that is clear and specific.\n\n"
            
            "RULES:\n"
            "1. Output ONLY the rewritten question. Do NOT add introductions like 'Here is the question' or 'As Nephro-AI'.\n"
            "2. If the question is already clear, output it exactly as is.\n"
            "3. Do NOT answer the question.\n"
            "4. Do NOT introduce yourself.\n\n"
            
            f"Chat History:\n{history_text}\n\n"
            f"Latest Question: {query}\n\n"
            "Standalone Question:"
        )

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "HTTP-Referer": "https://github.com/Nephro-AI",
            "Content-Type": "application/json"
        }

        try:
            payload = {
                "model": self.model,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.1,  # Reduce temp to stop creativity
                "max_tokens": 256
            }
            
            response = requests.post(self.api_url, headers=headers, json=payload, timeout=10)
            
            if response.status_code == 200:
                rewritten = response.json()['choices'][0]['message']['content'].strip()
                
                # 🛡️ Safety Check: If it generated a long monologue, revert to original
                if len(rewritten) > len(query) * 4:
                    Log.warning(f"Rewriter Hallucination detected. Reverting to original.")
                    return query
                
                # 🛡️ Safety Check: If it starts with "As Nephro-AI" or similar, revert
                if rewritten.lower().startswith(("as nephro", "i am", "hello", "hi ")):
                    Log.warning(f"Rewriter introduced itself. Reverting to original.")
                    return query
                    
                Log.step("  ", "Rewrite Result", f"'{query}' -> '{rewritten}'")
                return rewritten
            else:
                Log.error(f"Rewriter API Error: {response.status_code}")
                return query
                 
        except Exception as e:
            Log.error(f"Rewriter Exception: {e}")
            return query

    def translate_to_english(self, text: str, chat_history: List[Dict] = []) -> str:
        """
        [BRIDGE LAYER] Translates Singlish/Sinhala to English for the RAG Engine.
        Now includes DIET & FOOD examples to prevent hallucinations.
        """
        # Log.step("🔄", "BRIDGE: Translating...", f"'{text}'") # Called by RAGEngine already

        # 1. Get Context (What did the Doctor ask last?)
        context_str = "No previous context."
        if chat_history:
            last_doctor_msg = next((msg['content'] for msg in reversed(chat_history) if msg['role'] == 'assistant'), None)
            if last_doctor_msg:
                context_str = f"Doctor previously asked: '{last_doctor_msg}'"

        # 2. Get Dictionary Hints (Hybrid Search)
        dict_hints = self._get_dictionary_hints(text)
        if dict_hints:
            Log.step("  ", "MedDict Hit", f"{{ {dict_hints} }}")
            system_hint_str = f"⚠️ **STRICT DICTIONARY RULES** (from sinhala_med_dict.json): {dict_hints}"
        else:
            # Log.step("ℹ️", "MedDict Miss", "No specific medical terms found.")
            system_hint_str = ""

        # 🚨 THE FIX: Specific Context + Food Examples + Dictionary Injection
        system_prompt = (
            "You are a medical translator for a Nephrology Chatbot. "
            "Translate the user's Singlish or Sinhala input into clear English medical queries.\n"
            f"{system_hint_str}\n\n"
            
            "🎯 FOCUS AREAS:\n"
            "1. **Food Items:** Aligetapera (Avocado), Kesel (Banana), Kos (Jackfruit), Pol (Coconut).\n"
            "2. **Symptoms:** Ridenawa (Pain), Kakkuma (Ache), Kalantha (Dizziness).\n"
            "3. **Context:** If the user asks 'Can I eat...', it is a DIET query, not a symptom query.\n\n"

            "💡 FEW-SHOT EXAMPLES:\n"
            "   - Input: 'Mata aligetapera kilo ekak kanna puluwanda den?'\n"
            "   - Output: 'Can I eat a kilo of avocado right now?'\n\n"
            
            "   - Input: 'Mage bada ridenawa'\n"
            "   - Output: 'I have stomach pain.'\n\n"
            
            "   - Input: 'Kos kanna hondada?'\n"
            "   - Output: 'Is it okay to eat Jackfruit?'\n\n"

            f"CONTEXT: {context_str}\n\n"
            f"Now translate the following input:\nUSER INPUT: {text}"
        )

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "HTTP-Referer": "https://github.com/Nephro-AI",
            "Content-Type": "application/json"
        }

        try:
            payload = {
                "model": self.model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": text}
                ],
                "temperature": 0.1,  # Keep it strictly logical
                "max_tokens": 256
            }
            
            response = requests.post(self.api_url, headers=headers, json=payload, timeout=15)
            
            if response.status_code == 200:
                translation = response.json()['choices'][0]['message']['content'].strip()
                # Remove any quotes or extra explanations
                translation = translation.replace('"', '').replace("'", "")
                print(f"   ↳ Result: '{translation}'")
                return translation
        except Exception as e:
            print(f"❌ Translation Error: {e}")
            pass
            
        return text

    def enforce_spoken_sinhala(self, text: str) -> str:
        """
        [SAFETY NET] Deterministic glossary replacement using NLGGlossary.
        Uses the 'spoken_mixed' register (code-mixed Sinhala) by default.
        Longest-first matching prevents partial-word corruption.
        """
        register = getattr(config, 'NLG_DEFAULT_REGISTER', 'spoken_mixed')
        
        # Structural overrides that correct common LLM translation mistakes.
        # These fix Sinhala→Sinhala errors (not in the English→Sinhala glossary).
        structural_fixes = {
            "පැතිකඩ": "වර්තමාන තත්ත්වය",
            "වත්මන් පැතිකඩ": "වර්තමාන තත්ත්වය",
            "අසමත්": "පාලනය නොකළ",
            # FIX: Natural phrasing for uncontrolled diseases
            "පාලනය නොකළ Pressure": "කන්ට්‍රෝල් නැති Pressure",
            "පාලනය නොකළ රුධිර පීඩනය": "කන්ට්‍රෝල් නැති Pressure",
            "පාලනය නොකළ දියවැඩියාව": "කන්ට්‍රෝල් නැති ඩයබිටීස්",
            "අවාසනාවන්තයි": "කණගාටුයි",
            "දොස්තර": "Doctor",
            "සායනය": "Clinic එක",
            "මැදුරු රෝගය": "Diabetes",
        }
        for old, new in structural_fixes.items():
            text = text.replace(old, new)
        
        # Apply the full glossary (sorted longest-first inside enforce_glossary)
        text = self.glossary.enforce_glossary(text, register)
        
        # SAFETY SWEEP: Fix stuttering caused by glossary overlaps
        text = text.replace("එක එක", "එක")
        text = text.replace("අගය අගය", "අගය")
        text = text.replace("Risk එක එක", "Risk එක")
        
        return text

    def translate_to_sinhala_fallback(self, text: str) -> str:
        """
        [STYLE LAYER] Translates medical advice to Natural Spoken Sinhala.
        
        Research-grade pipeline:
          1. Scan English text for glossary terms → build register-aware hints
          2. Inject hints as vocabulary constraints into the LLM prompt
          3. LLM generates grammatically correct Sinhala with code-mixing
          4. Deterministic safety-net pass (enforce_spoken_sinhala) catches remainders
        
        The LLM sees both 'spoken_mixed' and 'pure_sinhala' registers so it can
        choose the culturally appropriate form based on sentence context.
        """
        print(f"⚠️ Style: Transforming to Natural Spoken Sinhala (v2 — Code-Mixing Engine)...")

        register = getattr(config, 'NLG_DEFAULT_REGISTER', 'spoken_mixed')
        max_hints = getattr(config, 'NLG_HINT_LIMIT', 25)

        # 1. GENERATE REGISTER-AWARE HINTS via NLGGlossary
        hint_strings, matched_entries = self.glossary.get_hints_for_text(
            text, register=register, max_hints=max_hints
        )
        hint_str = "\n   ".join(hint_strings) if hint_strings else "(No specific terms detected)"
        print(f"   💡 Style Hints ({len(hint_strings)} terms matched)")
        
        # 2. REGISTER-AWARE PROMPT WITH STRUCTURED HINTS
        system_prompt = (
            "You are a compassionate Sri Lankan medical assistant who speaks like a real \n"
            "doctor at a government hospital OPD. Rewrite the input into **CASUAL SPOKEN \n"
            "SINHALA (Katha Wahara — the way real doctors talk to patients in Sri Lanka)**.\n\n"
            
            "🔥 CRITICAL VOCABULARY CONSTRAINTS (YOU MUST USE THESE EXACT TERMS):\n"
            f"   {hint_str}\n\n"
            
            "🔬 CODE-MIXING REGISTER RULES:\n"
            "   DEFAULT: Use the 'spoken_mixed' form (code-mixed with English medical terms).\n"
            "   Sri Lankan patients understand 'Pressure එක' better than 'අධි රුධිර පීඩනය'.\n"
            "   Keep English terms like Creatinine, eGFR, Dialysis, Biopsy, CT Scan as-is.\n"
            "   Only use 'pure_sinhala' forms when the surrounding sentence is 100% Unicode.\n\n"
            
            "🔥 STYLE RULES:\n"
            "1. **Opener:** Start with 'ඔයාගේ තත්ත්වයත් එක්ක බලද්දී...' (Considering your condition...).\n"
            "2. **Empathy:** Translate 'I'm sorry to hear' as 'ඒක අහන්න ලැබීමත් කණගාටුයි'.\n"
            "3. **Anatomy:** Do NOT use 'පිටුපස' (Back) for 'Stomach'. Use 'බඩේ' for stomach.\n"
            "4. **Tone:** Use warm words like 'පුළුවන් නම්' (If possible), 'වගේ දේවල්' (Things like).\n"
            "5. **Code-Mixing (CRITICAL):** Use English medical terms naturally, but DO NOT put them in brackets as translations. NEVER write 'අවදානම් (High Risk)' or 'ඩයබිටීස් (දියවැඩියාව)'. Choose ONE language. Write 'අවදානම් තත්ත්වයක්' or 'ඩයබිටීස්'.\n"
            "6. **Natural Phrasing:** Avoid literal translations like 'පාලනය නොකළ Pressure'. Instead, say 'Pressure එක කන්ට්\u200dරෝල් නැහැ' or 'Pressure එක වැඩියි'.\n"
            "7. **Formatting:** Use Bullet points for lists.\n\n"

            "💡 GOLDEN EXAMPLE (MIMIC THIS EXACTLY):\n"
            "--------------------------------------------------\n"
            "📥 English Input:\n"
            "   'For your condition, it is best to avoid fruits high in potassium like Bananas, Oranges, Kiwi, and Avocados. Instead, eat apples and berries. Consult your dietitian.'\n\n"
            "📤 Sinhala Output (Target):\n"
            "   'ඔයාගේ තත්ත්වයත් එක්ක බලද්දී, පොටෑසියම් වැඩි පලතුරු කන එක අඩු කරන එක තමයි වඩාත්ම හොඳ. මේ තියෙන්නේ ඔයා අඩුවෙන් කන්න ඕන, නැත්නම් පුළුවන් නම් නොකා ඉන්න ඕන පලතුරු ටිකක්:\n\n"
            "   * කෙසෙල්\n"
            "   * දොඩම්\n"
            "   * කිවි (Kiwi)\n"
            "   * අලිගැටපේර\n"
            "   * වේලපු පලතුරු (වියළි මිදි/මුද්දරප්පලම් වගේ දේවල්)\n\n"
            "   ඒ වෙනුවට පොටෑසියම් අඩු පලතුරු ජාති වන ඇපල්, බෙරි වර්ග, මිදි සහ පෙයාර්ස් වගේ දේවල් කන්න පුළුවන්.\n"
            "   හැබැයි ඔයාටම හරියන කෑම බීම ගැන හරියටම දැනගන්න පෝෂණවේදියෙක් (Dietitian) හමුවෙලා උපදෙස් ගන්න අමතක කරන්න එපා.\n"
            "   තව මොනවා හරි දැනගන්න ඕන නම් අපෙන් අහන්න!'\n"
            "--------------------------------------------------\n\n"

            "Now, rewrite the following input using this exact natural style:\n\n"
            f"{text}"
        )

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "HTTP-Referer": "https://github.com/Nephro-AI",
            "Content-Type": "application/json"
        }
        
        try:
            payload = {
                "model": self.model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": text}
                ],
                "temperature": 0.2,
                "max_tokens": 2048
            }
            
            response = requests.post(self.api_url, headers=headers, json=payload, timeout=30)
            
            if response.status_code == 200:
                translation = response.json()['choices'][0]['message']['content'].strip()
                
                # 🛡️ SAFETY NET: Apply full glossary deterministic sweep
                # This catches LLM mistakes (e.g. "මැදුරු රෝගය" for Diabetes)
                translation = self.enforce_spoken_sinhala(translation)
                
                print(f"✅ Natural Output: {translation}") 
                return translation
        except Exception as e:
            print(f"❌ Style Layer Error: {e}")
            pass
            
        return text 

    def _generate_system_prompt(self, patient_context: str) -> str:
        return f"""
        You are 'Nephro-AI', a wise and efficient medical assistant.
        PATIENT CONTEXT (BACKGROUND ONLY): {patient_context}

        ⚠️ PATIENT CONTEXT USAGE RULES (READ FIRST):
        - The patient context above is BACKGROUND INFO to inform your advice.
        - Do NOT recite or dump the patient's profile (name, age, eGFR, diagnosis, medications) back to them.
        - Do NOT open with "Based on your profile, [Name] (age X) has..." — this feels robotic.
        - ONLY cite a specific lab value (e.g. eGFR, Creatinine) when directly answering a medical question about that value.
        - For general questions like "Do I have a risk?", answer conversationally first ("Let me check your recent results..."), then reference 1–2 relevant values if needed.

        YOUR GOAL: Triage -> Investigate (Briefly) -> Advise.

        BEHAVIOR PROTOCOL:
        1. 👋 **GREETINGS & RE-GREETINGS**:
           - If the user says "Hi", "Hello", or "How are you", reply warmly with ONLY a greeting.
           - Even if history exists, just greet them again — do NOT launch into medical advice unprompted.

        2. 🚨 **RED FLAG CHECK**: 
           - Chest pain, difficulty breathing, severe bleeding -> STOP -> Hospital Advice.

        3. 🛑 **THE "2-QUESTION" RULE** (MEDICAL QUERIES ONLY):
           - Do not ask more than 2 clarifying questions in a row.
           - If history exists AND the current query is a medical question, provide advice now.
           - This rule does NOT apply to greetings, acknowledgements, or casual chat.

        4. 🔍 **INVESTIGATE**: 
           - Ask specific questions for vague symptoms.

        5. 💡 **PROVIDE SOLUTION**:
           - Diagnosis hypothesis + Home remedy + Safety Net.
        
        6. ✅ **ACKNOWLEDGEMENTS & CLOSURES**:
           - If the user says "Ok", "Okay", "Thanks", "Thank you", or "Fine":
           - **DO NOT** restart the conversation.
           - **DO NOT** say "Hello" or introduce yourself.
           - REPLY POLITELY: "You're welcome! Take care of your health." or "Glad I could help. Stay safe."

        7. **TONE**: Empathetic, professional, decisive. Like a experienced doctor at a government hospital OPD — warm but focused.

        🤖 TOOL USE INSTRUCTIONS:
        - If you recommend a specific hospital or location based on the context, you MUST append a search tag at the very end of your response.
        - Format: [MAPS: <Location Name>]
        - Example: "The nearest facility is Anuradhapura Teaching Hospital. [MAPS: Anuradhapura Teaching Hospital]"
        - If you don't know the location, advise the user to search online and append: [MAPS: Hospitals near me]
        """


    def generate_response(
        self, 
        query: str, 
        context_documents: List[str], 
        patient_context: str,
        history: List[Dict[str, str]] = []
    ) -> str:
        """
        Pure Brain Layer: Generates response based on provided English Query & Context.
        (Translation is handled externally by RAGEngine)
        """
        print("\n[2] 🧠 BRAIN LAYER (Generating Response...)")
        
        # 1. Base System Prompt
        system_prompt = self._generate_system_prompt(patient_context)
        knowledge_context = "\n\n".join(context_documents[:3])
        
        # 2. Construct Message List
        messages = [{"role": "system", "content": system_prompt}]
        
        # 3. Inject History (Limit to last 4 turns)
        if history:
            valid_history = history[-4:] 
            for msg in valid_history:
                role = "user" if msg['role'] == "user" else "assistant"
                messages.append({"role": role, "content": msg['content']})

        # 4. Add Current User Question with RAG Context
        user_message_content = f"KNOWLEDGE BASE:\n{knowledge_context}\n\nCURRENT PATIENT QUERY:\n{query}"
        messages.append({"role": "user", "content": user_message_content})

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "HTTP-Referer": "https://github.com/Nephro-AI",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": self.model,
            "messages": messages, 
            "temperature": 0.7,
            # 🚨 FIX: INCREASE MAX TOKENS to prevent "Here's..." cutoff
            "max_tokens": 2048
        }

        try:
            response = requests.post(self.api_url, headers=headers, json=payload, timeout=30)
            if response.status_code == 200:
                english_response = response.json()['choices'][0]['message']['content'].strip()
                
                # 🛡️ Safety Check: If response is incomplete (ends mid-sentence), log warning
                if english_response and english_response[-1] not in '.!?")\'\u0d9a\u0d85\u0d8b':
                    print(f"⚠️ Warning: Response may be truncated: ...{english_response[-50:]}")
                
                print(f"✅ Brain Output: {english_response}")
                return english_response
            else:
                return f"Error: {response.status_code}"
        except Exception as e:
            return f"Error: {str(e)}"

if __name__ == "__main__":
    llm = LLMEngine()
    print(llm.generate_response("mage kakul idimila wage", [], "No Context"))
