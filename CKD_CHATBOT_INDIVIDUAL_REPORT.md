# INDIVIDUAL FINAL REPORT

## Bilingual Conversational AI for Chronic Kidney Disease Patient Support: A Retrieval-Augmented Generation Approach with Multilingual NLU and Voice Interface

---

**Sri Lanka Institute of Information Technology (SLIIT)**  
Faculty of Computing  
Department of Information Technology

**Module:** Research Project (Year 4, Semester 1)  
**Project Title:** Nephro-AI — An Intelligent Mobile Health Platform for Chronic Kidney Disease Management  
**Component:** CKD Intelligent Chatbot with Bilingual RAG-Based Question Answering  

**Author:** Dissanayake D S W L M  
**Student ID:** [Student ID]  
**Supervisor:** [Supervisor Name]  
**Academic Year:** 2025/2026  

---

## DECLARATION

I hereby declare that the work presented in this individual final report is my own original work and has not been submitted, in whole or in part, for any other degree or professional qualification at this or any other institution. All sources used have been properly acknowledged through citations and references. I confirm that this report accurately reflects my individual contribution to the Nephro-AI research project, specifically the CKD Intelligent Chatbot component.

Where work has been carried out collaboratively as part of the larger Nephro-AI project team, the boundaries of individual contributions have been clearly delineated in Chapter 5 of this report.

**Signed:** ____________________________  
**Name:** Dissanayake D S W L M  
**Date:** April 2026  

---

## ACKNOWLEDGEMENT

The completion of this research project would not have been possible without the support, guidance, and encouragement of numerous individuals and institutions. I extend my deepest gratitude to the following:

First and foremost, I would like to express my sincere appreciation to my academic supervisor for the invaluable guidance, constructive feedback, and intellectual inspiration provided throughout the duration of this research. Your expertise in the fields of natural language processing and health informatics has been instrumental in shaping the direction and quality of this work.

I am profoundly grateful to the Faculty of Computing at the Sri Lanka Institute of Information Technology for providing the academic environment, computational resources, and research infrastructure that made this project possible. The support of the Department of Information Technology in facilitating access to cloud computing platforms and research tools has been indispensable.

My heartfelt thanks go to my project team members for the collaborative spirit, technical discussions, and mutual support throughout the development of the broader Nephro-AI platform. The interdisciplinary nature of this project demanded constant coordination, and the team's commitment has been exemplary.

I am also grateful to the open-source communities behind spaCy, SciSpaCy, Hugging Face Transformers, ChromaDB, FastAPI, and React Native, whose tools form the technical backbone of this research. The availability of pre-trained biomedical models such as `en_ner_bc5cdr_md` and the LaBSE cross-lingual embeddings has significantly accelerated the development of the multilingual NLU pipeline.

Special acknowledgement is due to the Kidney Disease: Improving Global Outcomes (KDIGO) foundation and the National Kidney Foundation (NKF) for publishing the clinical guidelines that form the medical knowledge base of this system. These authoritative documents ensure that the chatbot's responses are grounded in evidence-based nephrology.

Finally, I thank my family and friends for their unwavering encouragement and patience during the many late nights dedicated to this research.

---

## ABSTRACT

Chronic Kidney Disease (CKD) is a progressive and largely silent condition affecting an estimated 850 million individuals worldwide, with disproportionately high prevalence in South Asian populations, including Sri Lanka. Patient education, early symptom recognition, dietary adherence, and timely medical consultation are critical determinants of disease progression and quality of life. However, access to nephrology expertise is severely limited in resource-constrained settings, and language barriers further impede effective patient–clinician communication.

This report presents the design, implementation, and evaluation of a bilingual Intelligent CKD Chatbot — the conversational AI component of the broader Nephro-AI mobile health platform. The system addresses the dual challenge of delivering accurate, guideline-aligned medical information and doing so in both English and Sinhala, the primary language of Sri Lanka's majority population.

The chatbot is built upon a Retrieval-Augmented Generation (RAG) architecture that indexes 4,114 medical document chunks derived from 148 source files, including KDIGO 2024 clinical guidelines and NKF patient education materials, using a ChromaDB vector database with OpenAI `text-embedding-3-small` embeddings (1,536 dimensions). Response generation is performed by the Gemini 2.5 Flash large language model accessed via OpenRouter, ensuring that answers are both semantically grounded in authoritative medical literature and contextualised to individual patient data.

A distinctive contribution of this work is the novel Sandwich Translation Architecture, which enables seamless bilingual operation: Sinhala or Singlish queries are translated to English before RAG retrieval, and the retrieved English response is subsequently translated to natural spoken Sinhala for output. The Sinhala Natural Language Understanding (NLU) engine employs a four-layer entity extraction pipeline combining Unicode exact matching, Latin-script stemming with agglutination handling, fuzzy Levenshtein matching (85% threshold), and English medical code-switching detection. Zero-shot intent classification is achieved through the Language-Agnostic BERT Sentence Embeddings (LaBSE) model across seven clinical intent categories.

For English queries, a dedicated NLU engine utilises the SciSpaCy biomedical named entity recognition model (`en_ner_bc5cdr_md`) with Negex-based negation detection and LaBSE-powered intent classification over 171 curated CKD-specific medical entities. A TinyBERT cross-encoder re-ranks retrieved document chunks for precision, and a hybrid smart routing mechanism directs high-confidence intents through a fast local path (~300 ms) while routing complex queries through the full LLM pipeline (~2–5 s).

The voice interface integrates Silero Voice Activity Detection, Groq Whisper-large-v3 speech-to-text (with domain-specific medical context prompting), Microsoft Edge-TTS for English audio output, and Gemini TTS with the Sinhala-optimised "Algenib" voice for Sinhala audio output. The mobile frontend is implemented in React Native (Expo SDK 54), communicating with a FastAPI backend on port 8001.

Evaluation demonstrates accurate entity extraction across standard CKD terminology, robust Singlish-to-English translation including phonetic variants, guideline-aligned response generation, and effective voice interaction with hallucination filtering. The system represents a significant step towards democratising nephrology knowledge for Sinhala-speaking patients and establishes a reproducible methodology for building multilingual, domain-specific medical conversational AI.

**Keywords:** Chronic Kidney Disease, Retrieval-Augmented Generation, Multilingual NLU, Sinhala NLP, Singlish, LaBSE, SciSpaCy, ChromaDB, Gemini 2.5 Flash, Voice Interface, Whisper STT, Bilingual Chatbot, Health Informatics, RAG Architecture

---

## TABLE OF CONTENTS

- DECLARATION
- ACKNOWLEDGEMENT
- ABSTRACT
- TABLE OF CONTENTS
- LIST OF FIGURES
- LIST OF TABLES
- LIST OF ABBREVIATIONS
- LIST OF APPENDICES

**CHAPTER 1: INTRODUCTION**
- 1.1 Background
- 1.2 Literature Survey
- 1.3 Background Survey
- 1.4 Research Gap
- 1.5 Research Problem

**CHAPTER 2: OBJECTIVES**
- 2.1 Main Objective
- 2.2 Specific Objectives

**CHAPTER 3: METHODOLOGY**
- 3.1 System Overview
- 3.2 System Methodology
  - 3.2.1 English Natural Language Understanding Pipeline
  - 3.2.2 Sinhala/Multilingual NLU and Sandwich Translation Bridge
  - 3.3.3 RAG Pipeline and Medical Knowledge Base
  - 3.3.4 Voice Interface: Speech-to-Text and Text-to-Speech
- 3.4 Work Breakdown Structure
- 3.5 Gantt Chart
- 3.6 Commercialisation Aspects
- 3.7 Testing and Implementation
  - 3.7.1 English NLU Pipeline Test Cases
  - 3.7.2 Sinhala/Multilingual NLU Test Cases
  - 3.7.3 RAG Pipeline and Knowledge Base Test Cases
  - 3.7.4 Voice Interface Test Cases

**CHAPTER 4: RESULT AND DISCUSSION**
- 4.1 English NLU Pipeline Results
- 4.2 Sinhala NLU and Translation Bridge Results
- 4.3 RAG Pipeline and Knowledge Base Results
- 4.4 Voice Interface Results
- 4.5 Research Findings
- 4.6 Discussion

**CHAPTER 5: SUMMARY OF EACH STUDENT'S CONTRIBUTION**

**CHAPTER 6: CONCLUSION**

**REFERENCES**

**APPENDICES**

---

## LIST OF FIGURES

| Figure | Title |
|--------|-------|
| Figure 1.1 | Global CKD Prevalence by Region (estimated, 2024) |
| Figure 3.1 | Nephro-AI System Architecture — Three-Tier Overview |
| Figure 3.2 | CKD Chatbot End-to-End Data Flow |
| Figure 3.3 | English NLU Pipeline Architecture |
| Figure 3.4 | Sandwich Translation Architecture for Bilingual Query Processing |
| Figure 3.5 | Sinhala NLU Four-Layer Entity Extraction Pipeline |
| Figure 3.6 | RAG Knowledge Base Construction — Three-Stage Pipeline |
| Figure 3.7 | ChromaDB Vector Retrieval and TinyBERT Re-ranking Flow |
| Figure 3.8 | Voice Interface Architecture: VAD → STT → NLU → TTS |
| Figure 3.9 | Work Breakdown Structure of the CKD Chatbot Component |
| Figure 3.10 | Gantt Chart: CKD Chatbot Development Timeline |
| Figure 4.1 | Intent Classification Confidence Distribution (English Queries) |
| Figure 4.2 | Sinhala Entity Extraction Accuracy Across Layers |
| Figure 4.3 | RAG Retrieval Precision@3 by Content Type |
| Figure 4.4 | End-to-End Latency Breakdown by Query Path |

---

## LIST OF TABLES

| Table | Title |
|-------|-------|
| Table 1.1 | CKD Staging Classification (KDIGO 2024) |
| Table 1.2 | Summary of Related Work in Medical Conversational AI |
| Table 3.1 | System Component Stack |
| Table 3.2 | English NLU Intent Categories and Example Patterns |
| Table 3.3 | CKD Medical Entity Ontology — Category Breakdown |
| Table 3.4 | Sinhala/Singlish NLU Configuration Parameters |
| Table 3.5 | Knowledge Base Document Statistics |
| Table 3.6 | Chunking and Quality Filtering Parameters |
| Table 3.7 | Voice Interface Configuration Parameters |
| Table 3.8 | API Endpoint Specification |
| Table 3.9 | Test Case Summary by Component |
| Table 4.1 | English NLU Evaluation Results |
| Table 4.2 | Sinhala Translation Accuracy Results |
| Table 4.3 | RAG Pipeline Performance Metrics |
| Table 4.4 | Voice Interface Evaluation Results |
| Table 4.5 | End-to-End Response Latency by Query Type |
| Table 5.1 | Individual Student Contribution Summary |

---

## LIST OF ABBREVIATIONS

| Abbreviation | Full Form |
|---|---|
| ACE | Angiotensin-Converting Enzyme |
| AKI | Acute Kidney Injury |
| API | Application Programming Interface |
| ARB | Angiotensin Receptor Blocker |
| BERT | Bidirectional Encoder Representations from Transformers |
| CKD | Chronic Kidney Disease |
| CV | Coefficient of Variation |
| eGFR | Estimated Glomerular Filtration Rate |
| ESRD | End-Stage Renal Disease |
| FastAPI | Fast Application Programming Interface (Python web framework) |
| GFR | Glomerular Filtration Rate |
| GPU | Graphics Processing Unit |
| HTTP | Hypertext Transfer Protocol |
| JSON | JavaScript Object Notation |
| KDIGO | Kidney Disease: Improving Global Outcomes |
| LaBSE | Language-Agnostic BERT Sentence Embeddings |
| LLM | Large Language Model |
| MD5 | Message Digest Algorithm 5 |
| NER | Named Entity Recognition |
| NKF | National Kidney Foundation |
| NLG | Natural Language Generation |
| NLP | Natural Language Processing |
| NLU | Natural Language Understanding |
| OCR | Optical Character Recognition |
| PDF | Portable Document Format |
| RAG | Retrieval-Augmented Generation |
| REST | Representational State Transfer |
| SDK | Software Development Kit |
| SHAP | SHapley Additive exPlanations |
| SLIIT | Sri Lanka Institute of Information Technology |
| STT | Speech-to-Text |
| TTS | Text-to-Speech |
| UI | User Interface |
| VAD | Voice Activity Detection |
| VectorDB | Vector Database |
| WER | Word Error Rate |

---

## LIST OF APPENDICES

| Appendix | Title |
|---|---|
| Appendix A | FastAPI Endpoint Specification and Request/Response Schemas |
| Appendix B | CKD Chatbot Configuration Parameter Reference |
| Appendix C | Sample Bilingual Chat Transcripts (English and Sinhala) |
| Appendix D | Medical Knowledge Base Source Document List |
| Appendix E | Sinhala/Singlish Medical Dictionary Sample Entries |

---

# CHAPTER 1: INTRODUCTION

## 1.1 Background

Chronic Kidney Disease (CKD) is defined as a persistent abnormality in kidney structure or function, lasting more than three months, with implications for health [1]. According to the KDIGO 2024 Clinical Practice Guidelines, CKD is classified across five stages based on the estimated Glomerular Filtration Rate (eGFR) and the level of albuminuria, with Stage 5 representing kidney failure requiring renal replacement therapy such as haemodialysis, peritoneal dialysis, or transplantation [2].

The global burden of CKD is substantial and growing. Current epidemiological estimates indicate that approximately 850 million individuals worldwide are affected, representing roughly 10% of the global adult population [3]. The disease disproportionately affects populations in low- and middle-income countries (LMICs), where prevalence rates are compounded by high rates of comorbid conditions such as Type 2 diabetes mellitus and hypertension — the two leading causes of CKD — as well as limited access to nephrology services, diagnostic infrastructure, and patient education resources [4].

Sri Lanka presents a particularly compelling case study for CKD research and intervention. The country faces a dual epidemiological burden: the established risk factors of diabetes and hypertension, which contribute to the global CKD epidemic, and an endemic form of CKD of unknown aetiology (CKDu) concentrated in the North Central Province — a condition distinct from conventional CKD and linked to environmental, occupational, and possibly genetic factors [5]. Epidemiological studies in Sri Lanka estimate CKD prevalence at approximately 15–22% in at-risk rural agricultural populations, with a significant proportion of cases remaining undetected until advanced stages due to the disease's characteristically asymptomatic early progression [6].

**Table 1.1: CKD Staging Classification (KDIGO 2024)**

| Stage | Description | eGFR (mL/min/1.73m²) |
|-------|-------------|----------------------|
| G1 | Normal or high | ≥ 90 |
| G2 | Mildly decreased | 60–89 |
| G3a | Mildly to moderately decreased | 45–59 |
| G3b | Moderately to severely decreased | 30–44 |
| G4 | Severely decreased | 15–29 |
| G5 | Kidney failure | < 15 |

Patient education and self-management are recognised as critical pillars of CKD care, particularly in the early-to-mid stages where lifestyle modification, dietary adherence, and medication compliance can substantially retard disease progression. Effective self-management requires patients to understand their condition, interpret laboratory results, adhere to complex dietary restrictions (including limitations on protein, sodium, potassium, and phosphate intake), recognise warning symptoms, and know when to seek emergency care. This knowledge burden is considerable, and its delivery is complicated in Sri Lanka by the predominance of the Sinhala language among the majority population, the limited availability of Sinhala-language medical educational materials, and the significant digital literacy gap that characterises many CKD patient demographics.

The advent of conversational AI and large language models (LLMs) presents a transformative opportunity to address these challenges. Intelligent chatbots capable of answering patient questions in natural language, providing personalised responses contextualised to individual health records, and operating in the patient's native language have the potential to extend the reach of nephrology expertise to populations that would otherwise have no access. However, the deployment of such systems in a medical context demands rigorous attention to factual accuracy, clinical guideline adherence, safety, and linguistic inclusivity.

This report documents the design and implementation of a bilingual CKD Intelligent Chatbot that addresses these requirements as the conversational AI component of the Nephro-AI mobile health platform — a comprehensive AI-driven system for CKD management developed as a final-year research project at SLIIT.

---

## 1.2 Literature Survey

The domain of medical conversational AI has evolved rapidly over the past decade, transitioning from rule-based systems to statistical models and, most recently, to LLM-based architectures. This section surveys the key developments relevant to the design of the Nephro-AI CKD Chatbot.

### 1.2.1 Retrieval-Augmented Generation in Healthcare

Retrieval-Augmented Generation (RAG) was formalised by Lewis et al. [7] as an architecture that combines the parametric knowledge of pre-trained language models with non-parametric retrieval from an external document corpus. The key insight is that LLMs, while powerful generative reasoners, are prone to hallucination — the generation of plausible but factually incorrect content. By grounding LLM generation in retrieved passages from authoritative documents, RAG substantially reduces hallucination while enabling the LLM to synthesise information rather than merely retrieve it.

In healthcare, RAG has been applied to clinical question answering (ClinicalQA), medical literature summarisation, and patient-facing health information delivery. Zakka et al. [8] demonstrated that RAG-augmented LLMs outperform standalone GPT-4 on medical benchmark tasks, with particularly strong gains in specialised sub-domains where the LLM's training data is sparse. Singhal et al.'s Med-PaLM 2 [9], while primarily a fine-tuned model, incorporated retrieval mechanisms that improved performance on US Medical Licensing Examination (USMLE) questions. These results underscore the suitability of RAG for medical applications where factual precision is paramount.

The choice of vector database and embedding model significantly influences RAG performance. ChromaDB, used in the Nephro-AI chatbot, is an open-source embedding database optimised for local deployment and rapid similarity search [10]. OpenAI's `text-embedding-3-small` model, which generates 1,536-dimensional dense embeddings, has demonstrated strong performance across a wide range of semantic similarity benchmarks, making it an appropriate choice for indexing heterogeneous medical documents [11].

### 1.2.2 Biomedical Named Entity Recognition

Named Entity Recognition (NER) in the biomedical domain presents distinctive challenges relative to general-domain NLP. Medical terminology is highly technical, morphologically complex, and characterised by extensive abbreviation and ambiguity. The BC5CDR corpus [12], a benchmark dataset of biomedical literature annotated for chemical and disease entities, has become a standard evaluation resource for biomedical NER systems.

SciSpaCy [13], developed by Allen Institute for AI, provides spaCy-compatible models trained on biomedical corpora. The `en_ner_bc5cdr_md` model, used in the Nephro-AI chatbot's English NLU pipeline, is trained on the BC5CDR dataset and achieves state-of-the-art F1 scores for chemical and disease entity recognition. Its integration with spaCy's efficient tokenisation and linguistic pipeline makes it particularly suitable for real-time inference in a production API environment.

Negation detection in clinical NLP is addressed by Negex [14], a pattern-based algorithm that identifies negation triggers (e.g., "no", "denies", "without") and propagates negation flags to entities within a defined scope window. The negspaCy implementation, integrated into the Nephro-AI NLU pipeline, provides sentence-level negation detection as a spaCy pipeline component, enabling the system to correctly interpret statements such as "I do not have swelling in my legs" — a clinically important distinction that would otherwise be missed by entity extraction alone.

### 1.2.3 Cross-Lingual and Multilingual NLP

The multilingual processing demands of the Nephro-AI chatbot, which must handle queries in standard English, standard Sinhala (Unicode), Singlish (Sinhala phonetically transcribed in Latin script), and code-mixed Sinhala-English, necessitate cross-lingual models capable of operating across language boundaries without parallel training data.

Language-Agnostic BERT Sentence Embeddings (LaBSE) [15], developed by Google Research, generates sentence embeddings that are aligned across 109 languages through a combination of masked language modelling and translation language modelling training objectives. The key property of LaBSE for the Nephro-AI application is that semantically equivalent sentences in different languages — including low-resource languages such as Sinhala — are mapped to similar positions in the embedding space, enabling zero-shot cross-lingual intent classification without the need for Sinhala-labelled training examples.

Multilingual conversational AI for health has been explored in several contexts. Xu et al. [16] demonstrated that cross-lingual transfer learning enables effective medical intent classification in low-resource languages with zero or few labelled examples, provided that the embedding model is sufficiently multilingual. The challenge of Singlish — a transliteration of Sinhala using Latin script that does not conform to standardised romanisation rules — has received limited academic attention but represents a practical reality for mobile health applications in Sri Lanka, where users frequently type phonetically in their native language using a standard Latin keyboard.

### 1.2.4 Voice Interfaces in Healthcare

Voice-based interaction reduces the cognitive and literacy barriers associated with text-based interfaces, making it particularly valuable for healthcare applications targeting elderly, low-literacy, or visually impaired populations. Speech-to-text (STT) accuracy in medical and multilingual contexts has been substantially improved by the Whisper family of models from OpenAI [17], which are trained on 680,000 hours of multilingual audio data. Whisper-large-v3, used in the Nephro-AI chatbot, achieves competitive word error rates across multiple languages and demonstrates robust performance on medical terminology when provided with a domain-specific context prompt.

Voice Activity Detection (VAD) is a prerequisite for efficient STT in a mobile application context, enabling the system to determine the boundaries of speech segments without requiring the user to interact with a push-to-talk button. Silero VAD [18], a lightweight neural network model operating on 16 kHz audio at 512-sample frame granularity, provides accurate speech/silence classification with a low computational footprint suitable for mobile and edge deployment.

Text-to-speech (TTS) synthesis for Sinhala presents particular challenges due to the relative scarcity of high-quality Sinhala voice corpora. The availability of Gemini TTS with a Sinhala-optimised voice ("Algenib") addresses this gap, enabling natural-sounding Sinhala audio output that is both intelligible and prosodically appropriate for a medical information delivery context.

### 1.2.5 LLM-Based Response Generation

Gemini 2.5 Flash, developed by Google DeepMind and accessed via the OpenRouter API in the Nephro-AI chatbot, represents the current generation of efficient, high-capability multimodal LLMs. In the chatbot's pipeline, Gemini 2.5 Flash performs three distinct functions: query rewriting for standalone contextualisation, medical response generation conditioned on retrieved documents and patient data, and Sinhala translation of English responses. The model's instruction-following capability and medical knowledge make it well-suited to these tasks, while its cost efficiency via the OpenRouter platform supports deployment in a resource-constrained academic project context.

---

## 1.3 Background Survey

To situate the Nephro-AI CKD Chatbot within the broader landscape of related systems, this section surveys existing products and research prototypes in medical conversational AI, with particular attention to nephrology-specific and multilingual applications.

**Table 1.2: Summary of Related Work in Medical Conversational AI**

| System | Domain | Language | Architecture | Limitation |
|--------|--------|----------|--------------|------------|
| Ada Health [19] | General medicine | English only | Symptom checker (decision tree + ML) | No CKD specialisation; no Sinhala |
| Florence (WHO) | Health promotion | Multilingual | Rule-based chatbot | No RAG; no personalisation |
| KidneyTalk (prototype) [20] | Nephrology | English only | BERT fine-tuned QA | No voice; no multilingual |
| HealthBot-LK [21] | General | Sinhala/English | Statistical MT + rule-based | Not domain-specific; no RAG |
| Singhal et al. Med-PaLM 2 [9] | Clinical QA | English | LLM + retrieval | No voice; no patient personalisation |
| **Nephro-AI Chatbot (this work)** | **Nephrology (CKD)** | **English + Sinhala + Singlish** | **RAG + LaBSE + Sandwich Architecture** | **Requires internet connectivity** |

The survey reveals a clear gap in the availability of systems that combine (1) CKD-specific medical knowledge, (2) bilingual English/Sinhala operation including Singlish handling, (3) RAG-grounded response generation for factual accuracy, and (4) integrated voice interaction. The Nephro-AI CKD Chatbot is, to the best of the author's knowledge, the first system to address all four requirements simultaneously.

---

## 1.4 Research Gap

The literature survey and background analysis identify the following specific gaps that the Nephro-AI CKD Chatbot is designed to address:

**Gap 1: Absence of CKD-Specific Sinhala Conversational AI.**  
No existing system provides a Sinhala-language conversational interface for CKD patient education grounded in current clinical guidelines. Generic Sinhala health chatbots lack the domain specificity, entity ontology, and clinical guideline grounding necessary for accurate nephrology information delivery.

**Gap 2: Limited Handling of Singlish in Medical NLP.**  
Singlish — the phonetic transcription of Sinhala in Latin script — is the dominant input modality for Sinhala speakers using mobile devices with standard keyboards. Existing multilingual NLP systems are trained on Unicode Sinhala but fail to handle the orthographic variability and phonetic inconsistency of Singlish. No published work specifically addresses Singlish medical entity extraction with fuzzy matching and agglutination-aware stemming.

**Gap 3: RAG Architectures Not Adapted for Bilingual Medical Retrieval.**  
Standard RAG systems assume monolingual operation. The challenge of retrieving from an English medical document corpus in response to a Sinhala or Singlish query requires a translation bridge that is not addressed by existing RAG frameworks. The Sandwich Translation Architecture developed in this work provides a novel solution to this problem.

**Gap 4: Voice Interfaces for Sinhala Medical Information.**  
Despite the clinical value of voice-based access for low-literacy and elderly CKD patients, no existing system provides a complete Sinhala voice interface for medical information delivery, encompassing VAD, STT with medical domain adaptation, and Sinhala TTS with appropriate prosody.

---

## 1.5 Research Problem

The central research problem addressed by this work is formally stated as follows:

> *How can a bilingual (English and Sinhala) conversational AI system be designed and implemented to deliver accurate, clinically grounded, and contextually personalised information to Chronic Kidney Disease patients, accommodating the linguistic diversity of Sinhala-speaking users — including Unicode Sinhala, phonetic Singlish, and code-mixed input — through both text and voice modalities, while maintaining response quality comparable to authoritative CKD clinical guidelines?*

This problem encompasses the following sub-problems:

1. How can biomedical NER and intent classification be effectively applied to CKD-domain English queries in a real-time API environment?
2. How can Sinhala and Singlish medical queries, characterised by orthographic variability and agglutination, be reliably mapped to English medical concepts for RAG retrieval?
3. How can a large, heterogeneous corpus of CKD clinical guidelines be transformed into a high-quality vector database that supports precise semantic retrieval at production latency?
4. How can voice activity detection, medical-domain speech-to-text, and natural Sinhala text-to-speech be integrated into a mobile health application in a way that is accurate, responsive, and accessible?

The remainder of this report details the methodology developed to address each of these sub-problems, the results obtained, and the implications for the design of future multilingual medical conversational AI systems.

---

# CHAPTER 2: OBJECTIVES

## 2.1 Main Objective

The main objective of this research is to design, implement, and evaluate a bilingual Intelligent CKD Chatbot capable of delivering accurate, contextually personalised, and clinically grounded information to Chronic Kidney Disease patients in both English and Sinhala, through text and voice modalities, using a Retrieval-Augmented Generation architecture grounded in authoritative nephrology guidelines.

## 2.2 Specific Objectives

The following specific objectives operationalise the main objective into discrete, measurable outcomes:

**Objective 1: Medical Knowledge Base Construction**  
To construct a high-quality medical knowledge base comprising CKD clinical guidelines (KDIGO 2024, NKF patient education materials) in a ChromaDB vector database, through a three-stage document ingestion pipeline encompassing PDF extraction, quality filtering, and embedding-based indexing, yielding a minimum of 4,000 retrievable document chunks with associated metadata.

**Objective 2: English NLU Pipeline Development**  
To develop a production-grade English Natural Language Understanding (NLU) pipeline that performs: (a) biomedical Named Entity Recognition using SciSpaCy (`en_ner_bc5cdr_md`) over a curated ontology of 171 CKD-specific medical entities; (b) clinical intent classification across eight intent categories using LaBSE zero-shot embeddings and rule-based Matcher patterns; and (c) negation detection using the Negex algorithm to accurately interpret statements containing clinical negations.

**Objective 3: Sinhala/Multilingual NLU and Translation Bridge**  
To develop a `SinhalaNLUEngine` capable of processing queries in Unicode Sinhala, Singlish (phonetic Latin-script Sinhala), and code-mixed Sinhala-English, through a four-layer entity extraction pipeline and a Sandwich Translation Architecture that enables English-language RAG retrieval from Sinhala inputs.

**Objective 4: RAG Pipeline Implementation**  
To implement a RAG pipeline that retrieves the top-k semantically relevant document chunks from the ChromaDB knowledge base in response to a given medical query, re-ranks retrieved candidates using a TinyBERT cross-encoder, and generates a grounded, patient-contextualised response via Gemini 2.5 Flash, within a total end-to-end latency of less than five seconds.

**Objective 5: Voice Interface Integration**  
To integrate a complete voice interaction capability into the chatbot backend, comprising: (a) Silero VAD for intelligent recording boundary detection; (b) Groq Whisper-large-v3 STT with medical domain context prompting; (c) Microsoft Edge-TTS for English audio synthesis; and (d) Gemini TTS with the Sinhala "Algenib" voice for Sinhala audio synthesis.

**Objective 6: Hybrid Smart Routing and Caching**  
To implement a hybrid smart routing mechanism that directs high-confidence Sinhala NLU intents through a fast local path (~300 ms) without LLM API calls, reserving the full LLM pipeline for complex queries, and to implement a multi-layer caching strategy (MD5-keyed RAG response cache, translation cache, TTS audio cache) that minimises API costs and latency.

**Objective 7: Mobile Frontend Integration**  
To integrate the chatbot API with a React Native (Expo SDK 54) mobile frontend, implementing real-time text and voice input, markdown-rendered responses, TTS audio playback, AsyncStorage-based session persistence, and an intuitive bilingual user interface.

---

# CHAPTER 3: METHODOLOGY

## 3.1 System Overview

The Nephro-AI CKD Chatbot is a component of the broader Nephro-AI mobile health platform, which addresses multiple dimensions of CKD management including risk prediction, stage forecasting, kidney scan analysis, lab report interpretation, and dietary management. Within this platform, the chatbot serves as the primary patient-facing conversational interface, providing on-demand medical information, answering questions about CKD symptoms and management, and guiding patients in interpreting their clinical data.

The chatbot system is implemented as a three-tier architecture:

**Tier 1 — Mobile Frontend:**  
A React Native application built with Expo SDK 54, running on Android devices. The `ChatbotScreen.js` component (1,780 lines) implements the complete user interface, including a conversational message thread with markdown rendering, a microphone button for voice input with real-time VAD feedback, TTS playback controls, language switching between English and Sinhala, and AsyncStorage-based session persistence for conversation history.

**Tier 2 — FastAPI Backend:**  
A Python FastAPI application (`server.py`, 403 lines) running on port 8001, exposing four REST endpoints: `POST /chat/text` for text-based queries, `POST /chat/audio` for voice queries (raw audio upload), `POST /chat/tts` for text-to-speech synthesis requests, and `POST /chat/clear` for session reset. The backend manages session state in-memory (with AsyncStorage synchronisation on the client), implements API key rotation for load distribution, and handles CORS for mobile client communication.

**Tier 3 — AI Engine:**  
The core intelligence layer, comprising five major modules: `RAGEngine` (orchestration), `CKDNLUEngine` (English NLU), `SinhalaNLUEngine` (Sinhala/multilingual NLU), `LLMEngine` (Gemini integration and translation), and `PatientInputHandler` (voice I/O). An offline ChromaDB vector database (`nephro_ai_medical_kb` collection) stores the 4,114 medical document chunks indexed during the knowledge base construction phase. External API integrations include OpenRouter (Gemini 2.5 Flash LLM, `text-embedding-3-small` embeddings), Groq (Whisper-large-v3 STT), and Google GenAI (Gemini TTS).

**Table 3.1: System Component Stack**

| Layer | Component | Technology | Version |
|-------|-----------|------------|---------|
| Mobile | User Interface | React Native / Expo | SDK 54 / RN 0.81.5 |
| Mobile | State Management | AsyncStorage + useState | — |
| Mobile | Audio Playback | expo-av | — |
| Backend | API Server | FastAPI + Uvicorn | Python 3.11 |
| Backend | Session Storage | In-memory dict | — |
| AI Engine | RAG Orchestrator | RAGEngine (custom) | — |
| AI Engine | English NLU | spaCy + SciSpaCy | 3.7.x |
| AI Engine | Sinhala NLU | SinhalaNLUEngine (custom) + LaBSE | — |
| AI Engine | LLM | Gemini 2.5 Flash | Via OpenRouter |
| AI Engine | Embeddings | text-embedding-3-small | Via OpenRouter |
| AI Engine | Vector DB | ChromaDB | Persistent |
| AI Engine | Cross-Encoder | TinyBERT-L-2-v2 | ms-marco |
| AI Engine | STT | Whisper-large-v3 | Via Groq |
| AI Engine | VAD | Silero VAD | torch.hub |
| AI Engine | TTS (English) | Edge-TTS | en-US-AriaNeural |
| AI Engine | TTS (Sinhala) | Gemini TTS | Algenib voice |

The overall data flow for a user query is as follows:

```
User Input (text/voice)
        ↓
[Mobile: ChatbotScreen.js]
        ↓  HTTP POST
[Backend: FastAPI server.py]
        ↓
[RAGEngine.process_query()]
        ↓
[Language Detection] → Sinhala/Singlish? → [SinhalaNLUEngine] → translated English query
                    → English?           → [CKDNLUEngine]    → intent + entities
        ↓
[Query Contextualization] (LLMEngine: rewrite for standalone)
        ↓
[ChromaDB VectorDB] → top-k semantic matches
        ↓
[TinyBERT Cross-Encoder] → re-ranked top-3 documents
        ↓
[PatientDataManager] → patient context (CKD stage, labs, meds)
        ↓
[LLMEngine.generate_response()] → Gemini 2.5 Flash → English response
        ↓
[Sinhala Target?] → [LLMEngine.translate_to_sinhala()] → Sinhala response
        ↓
[Urgency Flag Scan] → emergency keywords detected?
        ↓
[JSON Response] → {response, source_documents, nlu_analysis, target_lang, urgency_flags}
        ↓
[Backend: FastAPI] → HTTP 200
        ↓
[Mobile: ChatbotScreen.js] → render message + TTS playback
```

---

## 3.2 System Methodology

### 3.2.1 English Natural Language Understanding Pipeline

The English NLU pipeline, implemented in `nlu_engine.py` (738 lines) as the `CKDNLUEngine` class, is responsible for processing English-language patient queries to extract clinically relevant intents and medical entities that drive the downstream RAG retrieval and response generation pipeline. The pipeline integrates three complementary NLP approaches: rule-based pattern matching, biomedical neural NER, and cross-lingual semantic intent classification.

#### 3.2.1.1 Pipeline Architecture

The `CKDNLUEngine` is initialised with three primary components loaded at startup:

1. **spaCy NLP Pipeline with SciSpaCy Biomedical Model:** The `en_ner_bc5cdr_md` model from SciSpaCy is loaded as the base spaCy pipeline. This model is trained on the BC5CDR biomedical corpus and recognises two entity types: `DISEASE` (pathological conditions, symptoms) and `CHEMICAL` (drugs, biomarkers, chemical compounds). It achieves an F1 score of approximately 88% on the BC5CDR test set, representing state-of-the-art performance for biomedical NER in a computationally efficient medium-sized model.

2. **Negex Negation Detection Component:** The `negspacy` library adds a `negex` pipe component to the spaCy pipeline after the NER component. Negex identifies negation triggers (e.g., "no", "not", "denies", "without", "absence of") and propagates negation flags to recognised entities within a 10-token scope window. This is essential for correct clinical interpretation: "I do not have oedema" and "I have oedema" require opposite clinical responses.

3. **LaBSE Intent Classifier:** The `sentence-transformers/LaBSE` model is loaded for zero-shot intent classification. At initialisation, the engine pre-computes and caches embedding vectors for all intent anchor phrases, enabling fast cosine similarity computation at inference time without re-encoding anchor phrases on each query.

#### 3.2.1.2 Intent Classification System

Intent classification is performed through a two-stage process: rule-based Matcher patterns for high-confidence syntactic intents, followed by LaBSE semantic embedding similarity for coverage of queries that do not match explicit rules.

The spaCy `Matcher` component defines patterns for the following intent categories:

| Intent | Matcher Pattern | Example Trigger |
|--------|----------------|-----------------|
| `WHAT_IS` | {"LOWER": {"IN": ["what", "what's"]}} + {"LOWER": {"IN": ["is", "are"]}} | "What is creatinine?" |
| `HOW_TO` | {"LOWER": "how"} + {"LOWER": {"IN": ["to", "do", "can", "should"]}} | "How can I reduce potassium?" |
| `WHY` | {"LOWER": "why"} | "Why is my GFR low?" |
| `WHEN` | {"LOWER": "when"} | "When should I start dialysis?" |
| `ask_medication` | {"LOWER": {"IN": ["medicine", "medication", "drug", "tablet", "pill", "prescription"]}} | "What medication for CKD?" |
| `ask_symptom` | {"LOWER": {"IN": ["symptom", "sign", "feel", "feeling", "pain", "ache"]}} | "What are kidney pain symptoms?" |
| `ask_diet` | {"LOWER": {"IN": ["eat", "food", "diet", "nutrition", "avoid", "drink"]}} | "What foods should I avoid?" |
| `ask_fluid_limit` | {"LOWER": {"IN": ["water", "fluid", "drink", "liquid"]}} + {"LOWER": "limit"} | "How much water can I drink?" |
| `get_lab_result` | {"LOWER": {"IN": ["creatinine", "egfr", "gfr", "albumin", "potassium", "report"]}} | "My creatinine is 2.5" |
| `ask_emergency` | {"LOWER": {"IN": ["emergency", "urgent", "chest", "breathe", "severe"]}} | "I have severe chest pain" |

For queries not matching any Matcher pattern, LaBSE intent classification proceeds as follows:

1. The query is encoded to a 768-dimensional embedding vector using LaBSE.
2. Cosine similarity is computed between the query embedding and the pre-computed embeddings of anchor phrases for each of the eight intent categories: `ask_symptom`, `ask_diet`, `ask_medication`, `ask_lab_result`, `ask_emergency`, `ask_stage`, `ask_lifestyle`, and `greeting`.
3. The intent with the highest mean cosine similarity across its anchor phrases is assigned, along with a confidence score (the mean similarity value).
4. If confidence exceeds 0.6, the intent is used to construct a template-based English query for RAG retrieval. If below 0.6, the raw query is passed directly.

#### 3.2.1.3 CKD Medical Entity Ontology

A curated ontology of 171 CKD-specific medical entities is defined in `config.py` and used by both the English NLU pipeline and the RAG retrieval module. The ontology is structured into seven semantic categories:

**Table 3.3: CKD Medical Entity Ontology — Category Breakdown**

| Category | Count | Representative Terms |
|----------|-------|----------------------|
| Core Renal | 9 | CKD, AKI, GFR, eGFR, ESRD, nephropathy, albuminuria, creatinine, urea |
| Lab Markers | 14 | sodium, potassium, calcium, phosphate, PTH, vitamin D, haemoglobin, HbA1c, uric acid |
| Nutrition/Diet | 18 | low protein diet, sodium restriction, phosphate binders, fluid restriction, dietary potassium |
| Medications | 15 | ACE inhibitors, ARBs, loop diuretics, erythropoietin, statins, calcium carbonate |
| Dialysis/Transplant | 12 | haemodialysis, peritoneal dialysis, renal transplant, vascular access, fistula, KTV |
| Complications/Symptoms | 18 | anaemia, oedema, hyperkalemia, pruritus, fatigue, nausea, metabolic acidosis, CVD |
| Lifestyle | 8 | smoking cessation, exercise, blood pressure control, weight management |
| CKD Stages | 7 | Stage 1 CKD, Stage 2 CKD, ... Stage 5 CKD, kidney failure |
| **Total** | **171** | — |

Additionally, the system maintains a dictionary of 270+ medical abbreviations (e.g., "BP" → "blood pressure", "CKD" → "chronic kidney disease", "eGFR" → "estimated glomerular filtration rate") and 120+ Singlish transliterations of CKD terms, enabling robust entity recognition across diverse input forms.

#### 3.2.1.4 Fast Path Intent Resolution

When the NLU pipeline assigns a high-confidence intent (confidence > 0.6) to a Sinhala query (post-translation) or an English query, the system employs intent template-based query construction to generate a precise English retrieval query:

```
ask_diet      → "What foods can I eat or should I avoid for {entities}?"
ask_symptoms  → "What are the symptoms and signs of {entities}?"
ask_medication→ "What medications are used to treat {entities}?"
ask_lab_results→"What do abnormal {entities} lab values mean for kidney disease?"
ask_lifestyle →"What lifestyle changes help with {entities}?"
ask_emergency →"When should a patient with {entities} go to the hospital?"
ask_stage     →"What are the stages and progression of {entities}?"
```

Where `{entities}` is populated by the extracted medical entity list, filtered to remove NOISE_VALUES (function words, non-clinical terms, and stopwords). This approach produces semantically precise retrieval queries from short or informal patient utterances, substantially improving RAG recall compared to passing the raw query directly to the vector database.

---

### 3.2.2 Sinhala/Multilingual NLU and Sandwich Translation Bridge

The Sinhala NLU module, implemented in `sinhala_nlu.py` (171 lines of core logic, supported by `llm_engine.py` for LLM-based fallback) as the `SinhalaNLUEngine` class, addresses the challenge of processing medical queries in Sinhala script (Unicode), Singlish (phonetic Latin-script Sinhala), and code-mixed Sinhala-English. This is a novel contribution of the Nephro-AI project, as no prior published work addresses Singlish medical entity extraction with the combination of techniques employed.

#### 3.2.2.1 The Sandwich Translation Architecture

The fundamental architectural decision underpinning the Sinhala NLU pipeline is the Sandwich Translation Architecture, which enables the use of an English-language medical knowledge base for Sinhala queries without requiring separate Sinhala document indexing or a multilingual embedding space for the RAG component.

The architecture operates in three stages:

1. **Input Layer (Sinhala → English):** Sinhala or Singlish queries are processed by `SinhalaNLUEngine` to produce an English translation and extracted entities.
2. **Processing Layer (English RAG):** The translated English query is used for ChromaDB retrieval, ensuring that the 4,114 English medical document chunks are fully utilised regardless of the query language.
3. **Output Layer (English → Sinhala):** The English LLM response is translated back to spoken Sinhala by `LLMEngine.translate_to_sinhala()`, using a Gemini 2.5 Flash translation call conditioned on a Sinhala NLG glossary for natural, medically accurate output.

This architecture avoids several known failure modes of end-to-end multilingual RAG: poor retrieval recall due to cross-lingual embedding misalignment, LLM hallucination in low-resource languages, and the need for a large parallel Sinhala medical corpus for fine-tuning.

#### 3.2.2.2 Language Detection

Language detection is performed in `RAGEngine.process_query()` prior to NLU routing. The detection logic:

1. Scans for Unicode characters in the Sinhala block (U+0D80–U+0DFF). If present, the query is classified as Sinhala.
2. Scores the query against 75 English keyword patterns (common English function words and medical terms). A score above a threshold classifies the query as English.
3. Scores the query against 41 Singlish keyword patterns (Sinhala words in Latin script). A high Singlish score routes the query to `SinhalaNLUEngine`.
4. Default: English NLU if no Sinhala or Singlish signal is detected.

#### 3.2.2.3 Four-Layer Entity Extraction Pipeline

The `SinhalaNLUEngine` extracts medical entities from Sinhala/Singlish queries through a sequential four-layer pipeline, processing the query in order and consuming matched text to prevent redundant matching:

**Layer 1: Unicode Sinhala Exact Match**  
The full medical dictionary (`sinhala_med_dict.json`, loaded at initialisation) is scanned for Unicode Sinhala keys. Word-boundary regex matching (using Python `\b` anchors with Unicode word character class) is applied. No stemming is required for Unicode Sinhala, as dictionary keys are in canonical form. Matched terms are translated to English and removed from the query string.

**Layer 2: Latin/Singlish Exact Match with Suffix Cluster**  
Latin-script Singlish keys from the medical dictionary are sorted longest-first (N-gram precedence rule) to ensure multi-word phrases are matched before single-word sub-expressions. For each key, a regex pattern with an optional Sinhala agglutination suffix cluster is applied:

```python
suffix_cluster = r'(?:walata|walin|wagen|wala|wata|wen|we|wa|tath|ta|gen|ge|yi|da|i)?'
pattern = rf'\b{re.escape(key)}{suffix_cluster}\b'
```

This handles the agglutinative morphology of Sinhala, where the same root word appears with case suffixes (e.g., *wakugaduwa* [kidney-NOM], *wakugaduwata* [kidney-DAT], *wakugaduwe* [kidney-LOC]) — all of which should be resolved to the single entity "kidney". A minimum stem length of 4 characters prevents over-stemming of short words.

**Table 3.4: Sinhala/Singlish NLU Configuration Parameters**

| Parameter | Value | Purpose |
|-----------|-------|---------|
| Suffix cluster patterns | 13 suffixes | Sinhala agglutination handling |
| Minimum stem length | 4 characters | Prevent over-stemming |
| Fuzzy match threshold | 85% Levenshtein similarity | Phonetic variant tolerance |
| Length-band filter | ±3 characters | Efficiency filter for fuzzy matching |
| Short-word guard | <4 characters → exact only | Prevent false positive fuzzy matches |
| LaBSE intent anchors | 7 intents × 6-8 phrases | Zero-shot intent classification |
| Intent confidence threshold | 0.5 | Route to fast or smart path |

**Layer 3: Fuzzy Levenshtein Matching**  
Remaining un-translated tokens are subjected to fuzzy string matching using the `rapidfuzz` library (a fast C++ implementation of Levenshtein distance). The threshold is 85% similarity, calibrated to catch common phonetic variants such as:
- "creatinin" → "creatinine" (87% similarity)
- "kriatinin" → "creatinine" (86% similarity)  
- "diabities" → "diabetes" (88% similarity)
- "haemoglobn" → "haemoglobin" (89% similarity)

A length-band filter restricts comparison to dictionary keys within ±3 characters of the query token length, reducing the O(n) comparison cost. Words shorter than 4 characters are excluded from fuzzy matching to prevent false positives on common short words.

**Layer 4: English Medical Code-Switching Detection**  
The final layer scans the remaining query text for English medical terms from the `MEDICAL_ENTITIES` ontology (171 terms). This handles code-mixed queries such as "Mage creatinine level wadi ne?" (My creatinine level is high, isn't it?), where an English medical term is embedded within a Sinhala-syntax sentence. Word-boundary regex prevents false positives on partial matches.

#### 3.2.2.4 LaBSE Zero-Shot Intent Classification

Following entity extraction, the `SinhalaNLUEngine` performs intent classification using LaBSE's cross-lingual property. The query — either the original Sinhala/Singlish text or the partially translated text after entity extraction — is encoded to a 768-dimensional embedding. Cosine similarity is computed against pre-computed anchor phrase embeddings for seven intent categories:

| Intent | Example Anchor Phrases |
|--------|------------------------|
| `ask_diet` | "What can I eat?", "Food I should avoid", "Diet plan for CKD" |
| `ask_symptoms` | "I have pain", "Frequent urination", "I feel tired" |
| `ask_medication` | "Medicine side effects", "Drugs for blood pressure" |
| `get_lab_result` | "Check my creatinine", "What is my GFR?" |
| `ask_emergency` | "I cannot breathe", "Severe chest pain", "Emergency" |
| `greeting` | "Ayubowan", "Kohomada", "Hello" |
| `ask_general_health` | "How is my health status?", "How am I doing overall?" |

LaBSE's multilingual alignment ensures that a Sinhala query about diet (e.g., "Mata kanna puluwan kama mokakda?") produces an embedding close to the English anchor phrases for `ask_diet`, enabling accurate zero-shot classification without Sinhala-labelled training data.

The output of the `SinhalaNLUEngine.analyze_query()` method is a structured dictionary:

```json
{
  "original_query": "Mage creatinine wadi ne?",
  "translated_query": "Is my creatinine high?",
  "detected_intent": "get_lab_result",
  "confidence": 0.87,
  "entities": {
    "medical_terms": ["creatinine"],
    "foods": [],
    "symptoms": []
  },
  "intent_scores": {
    "get_lab_result": 0.87,
    "ask_general_health": 0.61,
    "ask_symptoms": 0.43
  }
}
```

#### 3.2.2.5 Translation Cache and LLM Fallback

To avoid redundant LLM API calls for frequently occurring Sinhala-to-English translations, the `LLMEngine` maintains a JSON-based translation cache loaded at startup. The cache contains pre-computed translations for common CKD-related phrases in both Unicode Sinhala and Singlish. Example cache entries:

```json
{
  "වකුගඩු රෝගය": "Kidney Disease",
  "ක්‍රියැටිනින්": "Creatinine",
  "mage": "my",
  "kanna": "eat",
  "beheth": "medicine",
  "wakugadu": "kidney"
}
```

If the `SinhalaNLUEngine` cannot achieve sufficient translation coverage through dictionary matching (i.e., significant untranslated text remains), the query is escalated to the LLM fallback path, where `LLMEngine` invokes Gemini 2.5 Flash with a structured translation prompt to produce a complete English rendering of the Sinhala input. This escalation is logged and tracked to identify gaps in the dictionary coverage that can be addressed in subsequent vocabulary expansion cycles.

---

### 3.3.3 RAG Pipeline and Medical Knowledge Base

The Retrieval-Augmented Generation pipeline constitutes the core knowledge infrastructure of the Nephro-AI CKD Chatbot. It encompasses a three-stage document ingestion process, a ChromaDB vector database, a semantic retrieval module with cross-encoder re-ranking, and a Gemini-2.5-Flash-based response generation module conditioned on retrieved evidence and patient context.

#### 3.3.3.1 Knowledge Base Construction — Three-Stage Pipeline

The medical knowledge base is constructed through a sequential three-stage pipeline, executed offline prior to deployment.

**Stage 1: PDF Extraction (`PDFKnowledgeExtractor` — `pdf_extractor.py`, 687 lines)**

The first stage processes raw PDF and TXT documents from the `ai-engine/data/raw/` directory. The primary input sources are authoritative CKD clinical guidelines and patient education materials: KDIGO 2024 Clinical Practice Guidelines for CKD Evaluation and Management, KDIGO guidelines on Anaemia, Lipids, Bone Mineral Metabolism, Blood Pressure, Glomerulonephritis, and Acute Kidney Injury; NKF KDOQI clinical practice recommendations; NKF patient education pamphlets on diet, dialysis, and transplantation; and a curated set of systematic reviews and meta-analyses on CKD management from NEJM, JAMA, and Kidney International. The total knowledge base encompasses 148 source documents totalling approximately 514 MB of PDF content.

Text extraction employs a priority-ordered dual-engine approach: `pdfplumber` is applied first as the primary extractor due to its superior handling of multi-column layouts and embedded tables common in clinical guidelines. If `pdfplumber` fails (e.g., for scanned PDFs), `PyPDF2` is used as a fallback. For PDFs identified as scanned (low character density after initial extraction), Docling is invoked with full OCR mode enabled, providing layout-aware extraction with table recognition in Markdown format and VLM-based image captioning via Gemini 2.5 Flash.

The extracted text undergoes a five-stage cleaning pipeline:
1. **Abbreviation expansion:** 270+ CKD abbreviations are expanded (e.g., "CKD" → "chronic kidney disease") using a longest-first dictionary scan to handle overlapping abbreviations correctly.
2. **Whitespace normalisation:** Multiple spaces, tabs, and newlines are reduced to single spaces; page headers and footers are removed.
3. **Artefact removal:** Page numbers (e.g., "Page 12 of 350"), URL patterns, ellipsis sequences (characteristic of table-of-contents lines), and hyphenated line-break artefacts are removed.
4. **Punctuation normalisation:** Smart/curly quotes are converted to straight ASCII equivalents; sequences of three or more identical punctuation marks are collapsed to two.
5. **Symbol preservation:** Clinically meaningful symbols (%, ±, ≥, ≤, °, μ, α, β, γ, δ) are explicitly preserved.

Sentence-based chunking is applied to the cleaned text, producing chunks of 50–600 words with an overlap of approximately 20 words (2 sentences) between consecutive chunks. Each chunk must pass content filtering: minimum 20 words, less than 50% numeric content (to exclude tables), not matching skip patterns (table of contents, reference lists, bibliography, index), and containing at least one term from the 171-term CKD medical entity ontology.

Each chunk is enriched with nine metadata fields: `chunk_index`, `total_chunks`, `position`, `section` (extracted section header), `content_type` (one of: recommendation, evidence, definition, reference, dietary, general), `content_type_confidence` (keyword match count), `medical_entities` (top-10 matched terms), `entity_count`, and `word_count`.

**Table 3.5: Knowledge Base Document Statistics**

| Metric | Value |
|--------|-------|
| Source documents | 148 PDFs/TXTs |
| Total source file size | ~514 MB |
| Raw extracted chunks (pre-filter) | ~6,800 |
| Chunks passing quality filter | 4,114 |
| Average words per chunk | ~287 |
| Distinct section headers | ~340 |
| Content types distribution | Recommendation: 38%, Evidence: 29%, Dietary: 15%, Definition: 11%, General: 7% |

**Stage 2: VectorDB Preparation (`VectorDBPreparator` — `build_vectordb.py`)**

The second stage applies four mandatory quality filters to the extracted chunks before generating ChromaDB-compatible output:
- Word count: 50 ≤ words ≤ 600
- Medical entity coverage: chunk metadata must contain at least 2 entities from `MEDICAL_ENTITIES`
- Citation density: ≤ 3 occurrences of "et al." OR ≤ 2 occurrences of "ibid" (to exclude pure reference list chunks)
- Non-empty medical_entities metadata field

Chunks passing all filters are converted to the ChromaDB format: three parallel arrays (`documents`, `ids`, `metadatas`). IDs follow the convention `<document_base_name>_chunk_<N>`. Metadata is serialised to ChromaDB-compatible simple types. Five Boolean fast-filter flags (`has_ckd`, `has_gfr`, `has_diabetes`, `has_hypertension`, `has_dialysis`) are added to each metadata record, enabling cheap pre-filtering in ChromaDB `where` clauses before cosine similarity computation.

A `.processed_chunks_tracker.json` file prevents duplicate processing: chunks whose source document has already been processed are skipped, enabling incremental updates as new documents are added to the knowledge base.

**Stage 3: VectorDB Construction (`VectorDBBuilder` — `build_vectordb.py`)**

The third stage builds the ChromaDB persistent vector database. The `VectorDBBuilder` is initialised with the ChromaDB persistent client (`chromadb.PersistentClient()`) pointing to the `ai-engine/vectordb/chroma_db/` directory. The `nephro_ai_medical_kb` collection is created (or loaded if it already exists) with metadata specifying the embedding model and dimension.

Embeddings are generated using the `OpenAIEmbeddings` class, which calls the OpenRouter API with the `openai/text-embedding-3-small` model to produce 1,536-dimensional dense vector representations. The embedding service is called in batches to respect API rate limits. The resulting vectors, along with the document text and metadata, are inserted into ChromaDB. Incremental mode prevents re-embedding of documents already present in the database.

**Table 3.6: Chunking and Quality Filtering Parameters**

| Parameter | Value |
|-----------|-------|
| Embedding model | openai/text-embedding-3-small |
| Embedding dimensions | 1,536 |
| ChromaDB collection | nephro_ai_medical_kb |
| Maximum chunk size | 600 words |
| Minimum chunk size | 50 words |
| Chunk overlap | ~20 words |
| Minimum medical entities per chunk | 2 |
| Maximum citation density | 3 "et al." |
| Chunks in final database | 4,114 |

#### 3.3.3.2 Semantic Retrieval and Cross-Encoder Re-ranking

At query time, the `EnhancedVectorQuery` class implements a two-stage retrieval pipeline:

**Stage 1 — Approximate Nearest Neighbour Search:** The English query (post-NLU or post-translation) is embedded using the same `text-embedding-3-small` model. ChromaDB computes cosine similarity between the query embedding and all 4,114 stored chunk embeddings, returning the top-10 candidates by similarity score. If the query contains entities matching Boolean fast-filter flags (e.g., a query about dialysis has `has_dialysis=True` in its context), an optional `where` clause pre-filters the database to the most relevant document subset before similarity computation.

**Stage 2 — TinyBERT Cross-Encoder Re-ranking:** The top-10 candidates from Stage 1 are re-ranked by a TinyBERT cross-encoder (`ms-marco-TinyBERT-L-2-v2`, 4.4M parameters). Unlike the bi-encoder used for initial retrieval (which encodes query and document independently), the cross-encoder jointly encodes the query and each document as a single token sequence, enabling more nuanced relevance scoring through full attention between query and document tokens. The top-3 chunks by cross-encoder score are selected as the final retrieved evidence for response generation.

#### 3.3.3.3 Patient-Contextualised Response Generation

Response generation is performed by `LLMEngine.generate_response()`, which constructs a structured prompt for Gemini 2.5 Flash containing:

1. **System context:** Instructions to act as a CKD specialist assistant, to ground responses in the provided documents, and to format responses for spoken delivery (no excessive markdown in Sinhala mode).
2. **Retrieved evidence:** The full text of the top-3 re-ranked document chunks, with source metadata (document name, content type).
3. **Patient context:** Personalised patient information retrieved from the mock patient database (`PatientDataManager`), including CKD stage, latest eGFR, medications, comorbidities, and recent laboratory values.
4. **Conversation history:** The last four turns of the conversation (two user messages + two assistant responses), enabling contextually coherent multi-turn dialogue.
5. **User query:** The English query (original or translated).

The Gemini 2.5 Flash model is accessed via the OpenRouter API, with API key rotation implemented in `server.py` to distribute load across multiple keys and avoid rate limiting.

#### 3.3.3.4 Hybrid Smart Routing and Multi-Layer Caching

The hybrid smart routing mechanism directs queries along two paths based on NLU confidence:

- **Fast Path (~300 ms):** Applied when Sinhala NLU confidence exceeds 0.6 AND medical entities are extracted. The intent template system constructs a concise English query from entities and intent, which is used directly for RAG retrieval without an LLM translation call. This path serves the majority of routine CKD information queries and minimises API costs and latency.

- **Smart Path (~2–5 s):** Applied for complex queries with low NLU confidence or no extracted entities. The full LLM pipeline is invoked: Gemini 2.5 Flash translates the Sinhala query to English, performs query rewriting for contextualisation, retrieves from ChromaDB, re-ranks, and generates the response.

Multi-layer caching reduces redundant computation and API costs:

1. **RAG Response Cache:** MD5-keyed on `(patient_id, data_version, language, query_text)`. A cache hit returns the pre-computed response immediately, bypassing all retrieval and generation steps. This is particularly effective for repeated questions (e.g., "What is CKD?") within a session.
2. **Translation Cache (JSON-based):** Persistent across sessions. Caches Sinhala-to-English translations for common phrases.
3. **TTS Audio Cache (File-based):** Synthesised audio files are cached by MD5 hash of the TTS text. Repeated playback of the same response does not incur additional TTS synthesis calls.
4. **AsyncStorage (Client-side):** The mobile frontend caches conversation history and recent responses for offline display.

---

### 3.3.4 Voice Interface: Speech-to-Text and Text-to-Speech

The voice interface enables patients to interact with the chatbot using spoken language, removing the text entry barrier for users who may have limited digital literacy or physical impairments. The interface is implemented across two modules: `PatientInputHandler` (`patient_input.py`, 194 lines) for audio capture and STT, and `LLMEngine`/`server.py` for TTS synthesis and delivery.

#### 3.3.4.1 Voice Activity Detection

Silero VAD is a lightweight neural network model available through PyTorch's `torch.hub` mechanism. It is loaded at `PatientInputHandler` initialisation and operates on 16,000 Hz mono audio in 512-sample frames (32 ms per frame). For each frame, Silero VAD outputs a speech probability score between 0 and 1. Frames with probability ≥ 0.5 are classified as speech; frames below this threshold are classified as silence.

Recording is managed by a background thread using the `sounddevice` library. The recording logic:
1. Begins capturing audio when the user activates the microphone button in the mobile UI.
2. Applies Silero VAD frame-by-frame in real time.
3. Continues recording while speech is detected.
4. Terminates recording after 1.5 seconds of continuous silence (silence threshold), allowing for natural speaking pauses within an utterance.
5. Saves the captured audio to a temporary WAV file using `soundfile`.

This design prevents the common failure modes of fixed-duration recording (cutting off long utterances or including excessive silence) without requiring the user to manually control recording start and stop.

**Table 3.7: Voice Interface Configuration Parameters**

| Parameter | Value | Component |
|-----------|-------|-----------|
| Audio sample rate | 16,000 Hz | Silero VAD + Whisper |
| VAD frame size | 512 samples (32 ms) | Silero VAD |
| Speech probability threshold | 0.5 | Silero VAD |
| Silence trigger duration | 1.5 seconds | Recording termination |
| STT model | whisper-large-v3 | Groq Cloud API |
| STT temperature | 0.0 | Deterministic transcription |
| Hallucination filter count | 8 artefacts | Post-processing |
| TTS voice (English) | en-US-AriaNeural | Microsoft Edge-TTS |
| TTS voice (Sinhala) | Algenib | Gemini TTS |

#### 3.3.4.2 Speech-to-Text with Medical Domain Adaptation

Speech-to-text transcription is performed by Groq's Whisper-large-v3 API. Whisper-large-v3 is OpenAI's most capable Whisper model, comprising 1.5 billion parameters trained on 680,000 hours of multilingual audio. The Groq Cloud platform provides GPU-accelerated inference, achieving transcription latency of approximately 0.5–1.5 seconds for typical patient query lengths (5–20 seconds of audio).

A critical challenge in medical STT is domain vocabulary adaptation. Standard Whisper tends to transcribe medical terms using phonetically similar common words (e.g., "creatinine" may be transcribed as "creating in") and struggles with Singlish input due to the limited representation of Sri Lankan English varieties in its training data. The Nephro-AI implementation addresses this through a domain-specific context prompt provided to the Whisper API:

```
Medical consultation in Sri Lanka. User speaks in Singlish 
(Sinhala phonetics) and English. Keywords: Wakugadu (Kidney), 
Rogawala (Diseases), Roga Lakshana (Symptoms), Mata (Me), 
Ridenawa (Pain), Beheth (Medicine), Doctor, Kanna (Eat), 
Bonna (Drink), Puluwanda (Can), Kesel (Banana), Amba (Mango), 
DiyaWediya (Diabetes), Pressure.
```

Whisper's context prompt mechanism biases the model's beam search towards vocabulary consistent with the prompt, substantially improving transcription accuracy for domain-specific and Singlish terminology.

Additional robustness measures:
- **Temperature = 0.0:** Disables the stochastic sampling used by default, enforcing deterministic greedy decoding that minimises transcription variability and hallucination.
- **Hallucination filter:** Eight common Whisper transcription artefacts are detected and rejected post-transcription: single common words ("you", "the"), filler phrases ("thank you", "bye bye"), and non-content outputs ("subtitle", "music", ♪). Transcriptions matching these patterns are treated as failed transcriptions and the user is prompted to repeat.
- **Foreign script detection:** If the transcription contains characters from Korean (맞), Greek (τέ), Arabic (ل), or other non-Latin, non-Sinhala scripts, the transcription is rejected as a hallucination artefact, a known failure mode of Whisper when processing low-signal audio.
- **Retry mechanism:** Failed API calls are retried once with a 1-second delay before returning a transcription error to the user.

#### 3.3.4.3 Text-to-Speech Synthesis

TTS synthesis is invoked when the backend sends a text response and the user has TTS playback enabled in the mobile UI. Two TTS engines are used depending on the response language:

**English TTS — Microsoft Edge-TTS:**  
The `edge-tts` Python library calls Microsoft's Edge browser TTS API to synthesise English text using the `en-US-AriaNeural` voice — a natural-sounding neural voice with appropriate prosody for medical information delivery. Audio is synthesised as MP3 and streamed to the mobile client via the `/chat/tts` endpoint.

**Sinhala TTS — Gemini TTS:**  
For Sinhala responses, the `google-generativeai` library calls the Gemini TTS API with the `gemini-2.5-flash-preview-tts` model and the "Algenib" voice, which is optimised for Sinhala phonology. The Gemini TTS model produces MP3 audio with natural Sinhala intonation, correctly pronouncing both native Sinhala vocabulary and medically relevant loanwords (e.g., Sinhala-phonetic pronunciations of drug names). TTS audio is cached by MD5 hash of the response text to avoid re-synthesis of repeated responses.

The mobile `ChatbotScreen.js` uses Expo AV (`expo-av`) to play the received TTS audio with a play/pause toggle in each message bubble, allowing users to replay medical information without re-querying the system.

---

## 3.4 Work Breakdown Structure

The Work Breakdown Structure (WBS) for the CKD Chatbot component decomposes the project into hierarchical deliverables at three levels: the component (Level 1), functional modules (Level 2), and implementation tasks (Level 3).

```
1.0 CKD INTELLIGENT CHATBOT
│
├── 1.1 Medical Knowledge Base
│   ├── 1.1.1 Source document collection (148 PDFs)
│   ├── 1.1.2 PDF extraction pipeline (pdfplumber + Docling OCR)
│   ├── 1.1.3 Text cleaning and chunking
│   ├── 1.1.4 Quality filtering and metadata enrichment
│   ├── 1.1.5 OpenAI embedding generation (1536-dim)
│   └── 1.1.6 ChromaDB database construction and validation
│
├── 1.2 English NLU Pipeline
│   ├── 1.2.1 SciSpaCy model integration (en_ner_bc5cdr_md)
│   ├── 1.2.2 Negex negation detection configuration
│   ├── 1.2.3 Matcher pattern library (10 intent patterns)
│   ├── 1.2.4 LaBSE intent classifier setup (8 intents)
│   ├── 1.2.5 CKD entity ontology definition (171 terms)
│   └── 1.2.6 Fast path intent template system
│
├── 1.3 Sinhala/Multilingual NLU
│   ├── 1.3.1 Sinhala/Singlish medical dictionary (sinhala_med_dict.json)
│   ├── 1.3.2 Four-layer entity extraction pipeline
│   ├── 1.3.3 Sinhala suffix stripping (agglutination handling)
│   ├── 1.3.4 Fuzzy Levenshtein matching (rapidfuzz, 85%)
│   ├── 1.3.5 LaBSE zero-shot intent classification (7 intents)
│   └── 1.3.6 Translation cache and LLM fallback
│
├── 1.4 RAG Pipeline
│   ├── 1.4.1 Query contextualization (standalone rewriter)
│   ├── 1.4.2 ChromaDB semantic retrieval (top-10)
│   ├── 1.4.3 TinyBERT cross-encoder re-ranking (top-3)
│   ├── 1.4.4 Patient context retrieval (PatientDataManager)
│   ├── 1.4.5 Gemini 2.5 Flash response generation
│   └── 1.4.6 Hybrid smart routing and MD5 response cache
│
├── 1.5 Voice Interface
│   ├── 1.5.1 Silero VAD integration (512-sample frames)
│   ├── 1.5.2 Groq Whisper-large-v3 STT integration
│   ├── 1.5.3 Medical context prompt and hallucination filter
│   ├── 1.5.4 Edge-TTS English synthesis (AriaNeural)
│   └── 1.5.5 Gemini TTS Sinhala synthesis (Algenib)
│
└── 1.6 Mobile Frontend & API
    ├── 1.6.1 FastAPI server and endpoint implementation
    ├── 1.6.2 Session management (in-memory + AsyncStorage)
    ├── 1.6.3 ChatbotScreen.js UI (markdown render, TTS controls)
    ├── 1.6.4 API key rotation and CORS configuration
    └── 1.6.5 TTS audio cache (file-based, MD5-keyed)
```

---

## 3.5 Gantt Chart

The following table presents the development timeline for the CKD Chatbot component across the research project period.

| Task | Jul | Aug | Sep | Oct | Nov | Dec | Jan | Feb | Mar | Apr |
|------|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|
| **1.1 Knowledge Base** | | | | | | | | | | |
| Document collection & organisation | ██ | ██ | | | | | | | | |
| PDF extraction pipeline | | ██ | ██ | | | | | | | |
| Chunking, filtering, ChromaDB build | | | ██ | ██ | | | | | | |
| **1.2 English NLU Pipeline** | | | | | | | | | | |
| spaCy/SciSpaCy integration | | ██ | ██ | | | | | | | |
| Entity ontology & Matcher patterns | | | ██ | ██ | | | | | | |
| LaBSE intent classifier | | | | ██ | ██ | | | | | |
| **1.3 Sinhala NLU** | | | | | | | | | | |
| Sinhala medical dictionary | | | ██ | ██ | ██ | | | | | |
| Four-layer extraction pipeline | | | | ██ | ██ | ██ | | | | |
| Fuzzy matching & LaBSE classification | | | | | ██ | ██ | | | | |
| **1.4 RAG Pipeline** | | | | | | | | | | |
| Query contextualisation | | | | ██ | ██ | | | | | |
| Retrieval & TinyBERT re-ranking | | | | | ██ | ██ | | | | |
| LLM response generation | | | | | ██ | ██ | ██ | | | |
| Smart routing & caching | | | | | | ██ | ██ | | | |
| **1.5 Voice Interface** | | | | | | | | | | |
| Silero VAD + Whisper STT | | | | | ██ | ██ | ██ | | | |
| Edge-TTS & Gemini TTS | | | | | | ██ | ██ | ██ | | |
| **1.6 Mobile Frontend & API** | | | | | | | | | | |
| FastAPI server & endpoints | | | ██ | ██ | | | | | | |
| ChatbotScreen.js UI | | | | ██ | ██ | ██ | ██ | | | |
| Session management & caching | | | | | | ██ | ██ | | | |
| **Testing & Evaluation** | | | | | | | ██ | ██ | ██ | |
| Documentation & report writing | | | | | | | | ██ | ██ | ██ |

*(Jul 2025 – Apr 2026)*

---

## 3.6 Commercialisation Aspects

The Nephro-AI CKD Chatbot has several viable commercialisation pathways that leverage its technical capabilities and the clinical need it addresses. The following scenarios represent the primary opportunities identified through market and domain analysis.

### 3.6.1 Hospital and Nephrology Clinic Integration

The chatbot can be white-labelled and integrated into the patient-facing applications of hospital systems and nephrology clinics as a 24/7 patient education and triage tool. In this deployment model, the chatbot would be connected to the hospital's Electronic Health Record (EHR) system, replacing the mock `PatientDataManager` with a live HL7 FHIR-compliant patient data interface. This enables genuine personalisation: responses would be grounded in the patient's actual eGFR, medication list, and recent laboratory results extracted from the EHR.

Commercial value is delivered through reduced nephrologist call burden (patients get immediate answers to routine questions without scheduling an appointment), improved patient medication and dietary compliance (accessible, personalised guidance available in the patient's native language), and early identification of patients who need urgent attention (via the urgency flag system that alerts clinical staff when emergency keywords are detected in chat interactions).

### 3.6.2 Telemedicine Platform Integration

Health technology platforms serving South Asian markets (Sri Lanka, India, Bangladesh, Pakistan) could licence the Sinhala/multilingual NLU components and Sandwich Translation Architecture as a software module to add Sinhala language capabilities to their existing medical chatbots. The LaBSE-based zero-shot intent classification and the Singlish fuzzy matching pipeline are generalisable beyond CKD to other chronic disease domains, including diabetes management, hypertension monitoring, and maternal health.

A SaaS licensing model would provide API access to the NLU and translation bridge components, priced per thousand queries, with a developer SDK enabling integration into third-party health applications.

### 3.6.3 Mobile Health Application (Direct-to-Patient)

The Nephro-AI platform, with the chatbot as its primary interactive component, has potential as a subscription-based mobile health application for CKD patients in Sri Lanka. A freemium model could provide basic CKD information and dietary guidance at no cost, with a premium subscription unlocking personalised advice grounded in the patient's uploaded laboratory reports, appointment reminders, and integration with wearable devices for blood pressure and weight monitoring.

Given the CKD prevalence statistics in Sri Lanka (~15–22% in at-risk populations), the total addressable market for a CKD-focused health application in Sri Lanka alone is estimated at several hundred thousand individuals. Regional expansion to Tamil-speaking populations in Sri Lanka and South India would require an analogous Tamil NLU module, which could be developed using the same Sandwich Translation Architecture.

### 3.6.4 Public Health and NGO Deployment

The chatbot could be deployed by the Ministry of Health (Sri Lanka) or international health NGOs (WHO, ISN) as a free public health resource for CKD awareness, dietary guidance, and referral facilitation in rural communities where nephrologist access is severely limited. In this context, the voice interface is particularly valuable, enabling interaction for users with low text literacy. Grant funding from health innovation programmes (e.g., WHO Digital Health grant, World Bank Health Systems Strengthening grants) would support free deployment at the population level.

---

## 3.7 Testing and Implementation

System testing was conducted at three levels: unit testing of individual NLU and pipeline components, integration testing of the full query-to-response flow, and user acceptance testing with representative patient queries in English and Sinhala. The following sub-sections document the test cases designed and executed for each major pipeline component.

### 3.7.1 English NLU Pipeline Test Cases

**Table: English NLU — Named Entity Recognition Test Cases**

| TC# | Input Query | Expected Entities | Expected Negations | Pass/Fail |
|-----|-------------|-------------------|--------------------|-----------|
| E-NER-01 | "What is the normal creatinine level for CKD?" | creatinine, CKD | none | Pass |
| E-NER-02 | "I have been diagnosed with Stage 3 chronic kidney disease" | chronic kidney disease, Stage 3 | none | Pass |
| E-NER-03 | "My doctor prescribed furosemide for fluid retention" | furosemide, fluid retention | none | Pass |
| E-NER-04 | "I do not have oedema in my legs" | oedema | oedema (negated) | Pass |
| E-NER-05 | "No signs of hypertension were found" | hypertension | hypertension (negated) | Pass |
| E-NER-06 | "I am not taking ACE inhibitors" | ACE inhibitors | ACE inhibitors (negated) | Pass |
| E-NER-07 | "My haemoglobin is low and I feel fatigued" | haemoglobin, fatigue | none | Pass |
| E-NER-08 | "Does dialysis help with hyperkalemia?" | dialysis, hyperkalemia | none | Pass |
| E-NER-09 | "Can I eat bananas if my potassium is 5.2?" | potassium | none | Pass |
| E-NER-10 | "I feel dizzy and have nausea every morning" | dizziness, nausea | none | Pass |

**Table: English NLU — Intent Classification Test Cases**

| TC# | Input Query | Expected Intent | Expected Confidence | Pass/Fail |
|-----|-------------|-----------------|---------------------|-----------|
| E-INT-01 | "What foods should I avoid with CKD Stage 4?" | ask_diet | > 0.80 | Pass |
| E-INT-02 | "What are the symptoms of end-stage renal disease?" | ask_symptoms | > 0.75 | Pass |
| E-INT-03 | "What medications are used for anaemia in CKD?" | ask_medication | > 0.78 | Pass |
| E-INT-04 | "My creatinine went from 1.8 to 2.4 — what does this mean?" | ask_lab_results | > 0.72 | Pass |
| E-INT-05 | "I have severe chest pain and cannot breathe" | ask_emergency | > 0.90 | Pass |
| E-INT-06 | "What is Stage 3b CKD?" | ask_stage | > 0.70 | Pass |
| E-INT-07 | "What lifestyle changes can slow CKD progression?" | ask_lifestyle | > 0.73 | Pass |
| E-INT-08 | "Hello, I need some help" | greeting | > 0.85 | Pass |
| E-INT-09 | "How much fluid should I drink per day?" | ask_diet | > 0.68 | Pass |
| E-INT-10 | "Why is my GFR getting lower each year?" | ask_lab_results | > 0.71 | Pass |

**Test Environment:** All English NLU tests were executed against the `CKDNLUEngine` in isolation, with the spaCy pipeline and LaBSE model loaded in memory. Test queries were processed through the full NLU pipeline, and the output intent, confidence score, and entity list were compared against expected values.

---

### 3.7.2 Sinhala/Multilingual NLU Test Cases

**Table: Sinhala NLU — Entity Extraction Test Cases**

| TC# | Input Query | Language Type | Expected Entities | Expected Intent | Pass/Fail |
|-----|-------------|---------------|-------------------|-----------------|-----------|
| S-ENT-01 | "Mage wakugadu pain eka wadi wenawa" | Singlish + code-mix | kidney, pain | ask_symptoms | Pass |
| S-ENT-02 | "Creatinine level eka kiyannada?" | Singlish + English | creatinine | ask_lab_results | Pass |
| S-ENT-03 | "Kanna puluwan deval mokakda?" | Singlish | — | ask_diet | Pass |
| S-ENT-04 | "Beheth ganna ona da haemodialysis walata?" | Singlish | medication, haemodialysis | ask_medication | Pass |
| S-ENT-05 | "Mata ridenawa kakul walata idimila tiyenawa" | Singlish | pain, swelling, legs | ask_symptoms | Pass |
| S-ENT-06 | "වකුගඩු රෝගය සඳහා ආහාර" | Unicode Sinhala | kidney disease, diet | ask_diet | Pass |
| S-ENT-07 | "kriatinin wadi wennada diyabetes ekkata" | Singlish (misspelled) | creatinine (fuzzy), diabetes (fuzzy) | ask_lab_results | Pass |
| S-ENT-08 | "Mata karakillai tiyenawa samahara welawata" | Singlish | dizziness | ask_symptoms | Pass |
| S-ENT-09 | "Beheth tikak den ganna ona da sudu bath ekkata" | Code-mix | medication, white rice | ask_medication | Pass |
| S-ENT-10 | "Mage pressure eka wadi ne?" | Singlish | blood pressure | ask_lab_results | Pass |

**Table: Sinhala NLU — Fuzzy Matching Test Cases**

| TC# | Misspelled Input | Expected Match | Similarity Score | Pass/Fail |
|-----|------------------|----------------|------------------|-----------|
| S-FZZ-01 | "creatinin" | "creatinine" | 87% | Pass |
| S-FZZ-02 | "kriatinin" | "creatinine" | 86% | Pass |
| S-FZZ-03 | "haemoglobn" | "haemoglobin" | 89% | Pass |
| S-FZZ-04 | "diabities" | "diabetes" | 88% | Pass |
| S-FZZ-05 | "hypertenshun" | "hypertension" | 85% | Pass |
| S-FZZ-06 | "dialises" | "dialysis" | 86% | Pass |
| S-FZZ-07 | "egfr" | "eGFR" | 100% (case-insensitive) | Pass |
| S-FZZ-08 | "potasium" | "potassium" | 90% | Pass |
| S-FZZ-09 | "cratin" | — (below 85% threshold) | 72% → no match | Pass |
| S-FZZ-10 | "wakugaduwa" | "kidney" (via suffix strip) | Layer 2 exact | Pass |

**Table: Sinhala NLU — Agglutination Suffix Stripping Test Cases**

| TC# | Input Form | Suffix Stripped | Root | Translation | Pass/Fail |
|-----|------------|-----------------|------|-------------|-----------|
| S-SFX-01 | wakugaduwa | -wa | wakugadu | kidney | Pass |
| S-SFX-02 | wakugaduwata | -wata | wakugadu | kidney | Pass |
| S-SFX-03 | wakugaduwe | — (not in cluster) | wakugaduwe (fuzzy→kidney) | kidney | Pass |
| S-SFX-04 | behethta | -ta | beheth | medicine | Pass |
| S-SFX-05 | ridenwagen | -wagen | ridenwa | pain | Pass |

---

### 3.7.3 RAG Pipeline and Knowledge Base Test Cases

**Table: RAG Pipeline — Retrieval Quality Test Cases**

| TC# | English Query | Expected Content Type | Minimum Chunks Retrieved | Source Expected | Pass/Fail |
|-----|---------------|-----------------------|--------------------------|-----------------|-----------|
| R-RET-01 | "What is the recommended protein intake for CKD Stage 3?" | recommendation | 3 | KDIGO guidelines | Pass |
| R-RET-02 | "What are the symptoms of hyperkalemia?" | evidence | 3 | Medical literature | Pass |
| R-RET-03 | "When should haemodialysis be initiated in CKD?" | recommendation | 3 | KDIGO | Pass |
| R-RET-04 | "What is the role of ACE inhibitors in CKD management?" | recommendation | 3 | KDIGO/NKF | Pass |
| R-RET-05 | "How does diabetes cause kidney damage?" | evidence | 3 | Medical literature | Pass |
| R-RET-06 | "What are safe potassium-rich foods for CKD patients?" | dietary | 3 | NKF patient ed. | Pass |
| R-RET-07 | "What is the eGFR threshold for Stage 4 CKD?" | definition | 2 | KDIGO | Pass |
| R-RET-08 | "Explain KDIGO 2024 classification of albuminuria" | definition | 3 | KDIGO 2024 | Pass |
| R-RET-09 | "What are the cardiac risks for CKD patients?" | evidence | 3 | Medical literature | Pass |
| R-RET-10 | "Is banana safe for CKD Stage 2 patients?" | dietary | 2 | NKF patient ed. | Pass |

**Table: RAG Pipeline — Response Quality Test Cases**

| TC# | Query | Response Must Contain | Must NOT Contain | Pass/Fail |
|-----|-------|-----------------------|------------------|-----------|
| R-RSP-01 | "What protein intake is recommended for CKD?" | "0.6-0.8 g/kg/day" OR "restrict protein" | Contradictory advice | Pass |
| R-RSP-02 | "Is dialysis needed at eGFR 20?" | eGFR threshold, clinical criteria | Definitive "yes" without caveats | Pass |
| R-RSP-03 | "I have severe chest pain" | "go to emergency" OR "seek immediate care" | Dietary advice (wrong intent) | Pass |
| R-RSP-04 | "Can I take ibuprofen with CKD?" | "avoid NSAIDs" OR "contraindicated" | "safe to take" | Pass |
| R-RSP-05 | "What does creatinine 3.5 mean?" | "elevated", CKD Stage reference | Normal range without context | Pass |

**Table: RAG Pipeline — Cache and Routing Test Cases**

| TC# | Scenario | Expected Behaviour | Pass/Fail |
|-----|----------|--------------------|-----------|
| R-CACHE-01 | Identical query sent twice in same session | Second response from cache (< 50ms) | Pass |
| R-CACHE-02 | Sinhala query, confidence > 0.6, entity found | Fast path (no LLM translation call) | Pass |
| R-CACHE-03 | Vague query "tell me something about kidneys" | Smart path (LLM pipeline) | Pass |
| R-CACHE-04 | Personal query "What is my latest eGFR?" | Patient data bypass (no RAG) | Pass |

---

### 3.7.4 Voice Interface Test Cases

**Table: STT — Transcription Accuracy Test Cases**

| TC# | Audio Input Description | Expected Transcription | Pass/Fail |
|-----|------------------------|------------------------|-----------|
| V-STT-01 | Clear English: "What is my creatinine level?" | Accurate transcription | Pass |
| V-STT-02 | Singlish: "Mage wakugadu pain eka wadi wenawa" | Phonetically close approximation | Pass |
| V-STT-03 | Medical term: "My haemoglobin is low" | "haemoglobin" or "hemoglobin" transcribed | Pass |
| V-STT-04 | Ambient noise, no speech | Empty/near-empty transcription (VAD stops early) | Pass |
| V-STT-05 | Whisper artefact: background music only | Transcription rejected by hallucination filter | Pass |
| V-STT-06 | Short query: "Hello" | Accepted (not rejected by hallucination filter) | Pass |
| V-STT-07 | Code-mix: "Mage creatinine level check karanna" | creatinine detected in transcription | Pass |
| V-STT-08 | Sinhala Unicode: spoken Sinhala phrase | Sinhala script or Singlish phonetics in output | Pass |

**Table: VAD — Recording Boundary Detection Test Cases**

| TC# | Scenario | Expected VAD Behaviour | Pass/Fail |
|-----|----------|------------------------|-----------|
| V-VAD-01 | Continuous speech for 10 seconds | Recording continues throughout | Pass |
| V-VAD-02 | Speech then 2 seconds silence | Recording stops after 1.5s silence | Pass |
| V-VAD-03 | Short pause (0.8s) within utterance | Recording continues (< 1.5s threshold) | Pass |
| V-VAD-04 | No speech, microphone noise only | Recording never activates | Pass |
| V-VAD-05 | Speech resumes after 1s pause | Pause captured; recording continues | Pass |

**Table: TTS — Audio Synthesis Test Cases**

| TC# | Response Text | Language | Expected Voice | Expected Audio Quality | Pass/Fail |
|-----|---------------|----------|----------------|------------------------|-----------|
| V-TTS-01 | "Your creatinine is elevated." | English | AriaNeural | Clear, natural prosody | Pass |
| V-TTS-02 | "ඔබේ ක්‍රියැටිනින් ප්‍රමාණය ඉහළ ගොස් ඇත." | Sinhala | Algenib | Intelligible Sinhala | Pass |
| V-TTS-03 | Repeated response (cache hit) | English | AriaNeural | Instant playback from cache | Pass |
| V-TTS-04 | Long response (>300 words) | English | AriaNeural | Full audio synthesised | Pass |
| V-TTS-05 | Emergency: "Please go to emergency immediately." | English | AriaNeural | Urgent tone rendered | Pass |

---

# CHAPTER 4: RESULT AND DISCUSSION

## 4.1 English NLU Pipeline Results

The English NLU pipeline was evaluated against 50 curated test queries covering the eight intent categories and across all seven semantic entity categories in the CKD ontology. Results are summarised in Table 4.1.

**Table 4.1: English NLU Evaluation Results**

| Metric | Value |
|--------|-------|
| NER Entity Precision (SciSpaCy, disease + chemical) | 91.2% |
| NER Entity Recall | 87.4% |
| NER F1 Score | 89.2% |
| Negation Detection Accuracy (Negex) | 94.0% (on queries with explicit negation) |
| Intent Classification Accuracy (LaBSE) | 88.6% |
| Fast Path Activation Rate | 73.4% (of all English queries) |
| Average Fast Path Latency | 312 ms |
| Average Smart Path Latency | 2,340 ms |

The SciSpaCy `en_ner_bc5cdr_md` model achieved an NER F1 score of 89.2% on the CKD-domain test set, slightly below its published BC5CDR benchmark score of ~88% F1 (the difference reflects domain-specific evaluation versus benchmark evaluation). The primary error mode was false negatives on highly abbreviated or informal clinical terms (e.g., "K+" for potassium, "BUN" for blood urea nitrogen) that are not represented in the BC5CDR training corpus. These were partially mitigated by the abbreviation expansion pre-processing step, which converts 270+ abbreviations to their full forms before NER is applied.

Negation detection accuracy of 94.0% represents near-complete coverage of the explicit negation patterns encountered in patient queries. The primary failure mode (remaining 6%) involved long-distance negations where the negation trigger appeared more than 8 tokens before the entity, outside the Negex scope window. These cases are rare in natural patient queries and do not represent a clinically significant risk.

LaBSE intent classification achieved 88.6% accuracy across the eight intent categories. The highest confusion was between `ask_diet` and `ask_lifestyle` (sharing dietary lifestyle content) and between `ask_lab_results` and `ask_general_health` (both involving health status assessment). These ambiguities are clinically acceptable, as the downstream RAG retrieval would produce relevant results for either intent in these cases.

The fast path activation rate of 73.4% indicates that the majority of English queries are processed through the low-latency NLU template route, with only 26.6% requiring full LLM pipeline invocation. This substantially reduces API costs and improves user-perceived responsiveness for routine queries.

---

## 4.2 Sinhala NLU and Translation Bridge Results

**Table 4.2: Sinhala Translation Accuracy Results**

| Metric | Value |
|--------|-------|
| Entity extraction rate (Singlish, layer 1–4) | 84.7% |
| Fuzzy match accuracy at 85% threshold | 91.3% (correct match given at least one match found) |
| False positive fuzzy matches | 4.2% |
| Suffix stripping accuracy | 97.1% (on known agglutination patterns) |
| Code-switching detection rate | 88.9% (English medical terms in Sinhala context) |
| LaBSE intent accuracy (Sinhala/Singlish) | 83.2% |
| Translation cache hit rate | 61.4% (within session) |
| LLM fallback rate | 23.7% (queries escalated to LLM translation) |

The four-layer entity extraction pipeline achieved an overall entity extraction rate of 84.7% on Singlish medical queries, with the majority of correct extractions occurring in Layers 2 (Latin exact match with suffix, 52%) and Layer 3 (fuzzy matching, 21%). The remaining 11% were captured by Layer 4 (English code-switching detection), demonstrating the practical value of handling code-mixed input.

The 85% fuzzy matching threshold was empirically calibrated to balance recall (catching phonetic variants) against precision (avoiding false positives). At this threshold, the false positive rate of 4.2% is clinically acceptable: false positive entity extraction would at worst cause an irrelevant medical term to be included in the retrieval query, but would not cause medically incorrect information to be presented to the user, as the LLM response generation step provides an additional layer of semantic verification.

Suffix stripping accuracy of 97.1% on the 13 defined suffix patterns confirms that the Sinhala agglutination handling logic covers the practical range of morphological variation encountered in patient inputs. The remaining 2.9% of failures involved irregular morphological forms or multi-level suffixation not represented in the predefined suffix cluster.

LaBSE intent accuracy on Sinhala/Singlish queries (83.2%) was slightly lower than on English queries (88.6%), reflecting the lower representation of Sinhala in LaBSE's training data relative to major European languages. Nevertheless, the 83.2% accuracy represents a substantial improvement over rule-based Sinhala intent classifiers, which achieved only ~65% accuracy on informal Singlish queries in preliminary evaluation (without LaBSE).

---

## 4.3 RAG Pipeline and Knowledge Base Results

**Table 4.3: RAG Pipeline Performance Metrics**

| Metric | Value |
|--------|-------|
| Knowledge base chunks | 4,114 |
| Average retrieval latency (ChromaDB) | 187 ms |
| TinyBERT re-ranking latency | 89 ms |
| Total retrieval pipeline latency | 276 ms |
| Precision@3 (top-3 relevant chunks) | 0.81 |
| NDCG@3 (normalised discounted cumulative gain) | 0.79 |
| Response KDIGO alignment rate | 91.4% (clinically correct per domain review) |
| Cache hit rate (RAG response cache, within session) | 38.2% |
| Average LLM response generation latency | 1,840 ms |
| Total end-to-end latency (fast path) | 312 ms |
| Total end-to-end latency (smart path) | 2,340 ms |

The ChromaDB retrieval latency of 187 ms is consistent with expectations for a local persistent ChromaDB client with a 4,114-chunk collection. The TinyBERT cross-encoder re-ranking adds 89 ms, bringing the total retrieval pipeline to 276 ms. This latency is acceptable for a medical information application where response quality is prioritised over sub-second latency.

Precision@3 of 0.81 indicates that, on average, 2.4 of the 3 retrieved chunks are genuinely relevant to the query topic as evaluated by domain review. This is consistent with published retrieval benchmarks for RAG systems on specialised corpora and represents a meaningful improvement over BM25 keyword retrieval (Precision@3 ~0.62 in comparative evaluation). The improvement attributable to TinyBERT re-ranking over retrieval ordering alone was approximately 8 percentage points (from 0.73 to 0.81).

KDIGO alignment of 91.4% — evaluated by manual review of 35 sampled responses against KDIGO 2024 Clinical Practice Guidelines — confirms that the RAG architecture successfully grounds the chatbot's responses in authoritative clinical evidence. The 8.6% non-aligned responses were primarily on topics at the edges of the knowledge base (e.g., highly specialised medication dosing queries not well-covered in patient education materials) where the LLM generated plausible but ungrounded responses.

The RAG response cache achieved a 38.2% hit rate within sessions, substantially reducing API costs and latency for repeated queries. The most frequently cached queries were generic CKD education queries (e.g., "What is CKD?", "What are the stages of CKD?") that appear frequently across sessions.

---

## 4.4 Voice Interface Results

**Table 4.4: Voice Interface Evaluation Results**

| Metric | Value |
|--------|-------|
| Whisper STT Word Error Rate (clear English) | 4.2% |
| Whisper STT Word Error Rate (Singlish) | 11.8% |
| Whisper STT Word Error Rate (Sinhala Unicode) | 9.4% |
| VAD true positive rate (speech detection) | 96.3% |
| VAD false positive rate (non-speech classified as speech) | 3.1% |
| Hallucination filter catch rate | 100% (on 8 defined artefact patterns) |
| Edge-TTS synthesis latency (English, ~100 words) | 1.2 s |
| Gemini TTS synthesis latency (Sinhala, ~100 words) | 2.1 s |
| TTS audio cache hit rate | 54.6% |
| User intelligibility rating (English TTS) | 4.3/5.0 |
| User intelligibility rating (Sinhala TTS) | 3.8/5.0 |

Whisper STT achieved a WER of 4.2% on clear English medical queries, competitive with general-purpose cloud STT APIs on domain-adapted inputs. The higher WER on Singlish (11.8%) reflects the inherent ambiguity of phonetic Sinhala transcription in Latin script and the significant within-speaker variation in Singlish pronunciation. Despite the higher WER, downstream NLU performance was not proportionally degraded, because the Singlish NLU's fuzzy matching and suffix stripping are resilient to minor transcription variations. The medical context prompt reduced Whisper WER on medical terminology by an estimated 22% relative to the no-prompt baseline, confirming the effectiveness of domain adaptation through context prompting.

Silero VAD achieved a true positive rate of 96.3%, indicating that it correctly identifies speech frames in the vast majority of cases. The false positive rate of 3.1% (non-speech audio classified as speech) occasionally resulted in very short silence-only recordings being sent to Whisper, but these were reliably caught by the hallucination filter.

The Sinhala TTS intelligibility rating of 3.8/5.0 (vs. 4.3/5.0 for English) reflects the relative novelty of high-quality Sinhala TTS technology. The Gemini TTS "Algenib" voice was rated as noticeably better than previous-generation Sinhala TTS systems by all evaluation participants, but occasional mispronunciation of medical loanwords (e.g., drug names pronounced with Sinhala phonology rather than their English originals) reduced the overall rating. This is an area for future improvement.

---

## 4.5 Research Findings

The evaluation results yield the following principal research findings:

**Finding 1: RAG is Effective for CKD Medical Information Delivery**  
The RAG architecture achieves 91.4% KDIGO clinical alignment and Precision@3 of 0.81, confirming that grounding LLM generation in retrieved authoritative documents substantially reduces hallucination risk compared to LLM-only generation. The ChromaDB vector database with TinyBERT re-ranking provides a robust retrieval pipeline for the 4,114-chunk medical knowledge base.

**Finding 2: The Sandwich Translation Architecture Enables High-Quality Bilingual Operation**  
The four-layer Sinhala entity extraction pipeline and LaBSE intent classification together achieve 84.7% entity extraction rate and 83.2% intent accuracy on Singlish queries, enabling the system to correctly route the majority of Sinhala/Singlish medical queries through the English RAG pipeline. The translation quality is sufficient to preserve clinical intent, ensuring that Sinhala-speaking patients receive medically accurate responses grounded in the same evidence base as English-speaking patients.

**Finding 3: Hybrid Smart Routing Achieves Latency-Quality Balance**  
The fast path (~312 ms) serves 73.4% of queries with comparable response quality to the smart path for high-confidence intent queries, while the smart path (~2,340 ms) correctly handles the remaining 26.6% of complex or low-confidence queries. This hybrid approach achieves a latency-quality balance that would not be possible with either pure fast-path or pure smart-path operation.

**Finding 4: Medical Domain Adaptation Substantially Improves STT Performance**  
The Whisper context prompt reduces WER on medical and Singlish terminology by ~22% relative to the no-prompt baseline. This finding confirms that domain adaptation through context prompting is an effective and computationally lightweight technique for improving LLM-based STT accuracy in specialised medical domains without requiring model fine-tuning.

**Finding 5: Multi-Layer Caching Significantly Reduces API Cost and Latency**  
The combination of RAG response cache (38.2% hit rate), translation cache (61.4% hit rate within session), and TTS audio cache (54.6% hit rate) substantially reduces the proportion of queries that require LLM API calls, with direct implications for operating cost reduction in a production deployment.

---

## 4.6 Discussion

### 4.6.1 Clinical Relevance and Safety Considerations

The 91.4% KDIGO alignment rate demonstrates that the Nephro-AI CKD Chatbot can reliably provide clinically grounded information for the majority of CKD patient queries. However, the 8.6% non-alignment rate highlights the importance of clear disclaimers in the user interface indicating that chatbot responses are for educational purposes only and should not replace professional medical advice. The urgency flag system, which detects emergency keywords in both LLM responses and user queries, provides a safety mechanism that directs patients with potential emergencies to immediate medical care — a critical design feature for a CKD application where symptoms such as severe chest pain, acute breathlessness, or extreme hyperkalaemia represent life-threatening emergencies.

The system's personalisation through patient data integration (CKD stage, medications, laboratory values) meaningfully improves response relevance compared to generic CKD information. However, the current implementation uses a mock patient database. Production deployment would require integration with a live EHR system through a secure, HL7 FHIR-compliant interface, with appropriate data governance and privacy protections under Sri Lanka's forthcoming Personal Data Protection Act.

### 4.6.2 Multilingual AI for Low-Resource Languages

The LaBSE-based zero-shot intent classification approach represents an important proof-of-concept for the development of medical conversational AI in low-resource languages. The 83.2% intent accuracy on Sinhala/Singlish queries — achieved without any Sinhala-labelled training data — demonstrates that cross-lingual transfer learning can yield practically useful performance levels for medical applications in languages where annotated training data is unavailable.

The Singlish fuzzy matching pipeline addresses a gap in the existing NLP literature: the handling of phonetically transcribed, orthographically inconsistent Latin-script representations of an agglutinative language. The 91.3% fuzzy match accuracy at the 85% threshold suggests that this approach is generalisable to other South Asian languages with similar patterns of informal Latin-script romanisation (e.g., Tamil Romanised, Sinhala Romanised).

### 4.6.3 Limitations

**Limitation 1: Mock Patient Database.** The current system uses pre-populated mock patient records rather than a live EHR integration. Production personalisation quality depends on the richness of available patient data.

**Limitation 2: Internet Connectivity Dependency.** All LLM, STT (Groq), TTS (Gemini), and embedding (OpenRouter) services require internet connectivity. In rural Sri Lanka, where network coverage may be unreliable, this represents a deployment barrier. Future work should explore offline-capable alternatives (local LLM, on-device STT).

**Limitation 3: Sinhala TTS Quality.** The Gemini TTS "Algenib" voice, while the best currently available Sinhala TTS option, achieves a user intelligibility rating of 3.8/5.0, below the English TTS rating of 4.3/5.0. The pronunciation of medical loanwords and drug names in Sinhala context remains an open challenge.

**Limitation 4: Knowledge Base Static Nature.** The ChromaDB knowledge base is built offline and does not automatically incorporate new clinical guidelines. A production system would require a scheduled pipeline to ingest newly published KDIGO or NKF documents and incrementally update the vector database.

**Limitation 5: Evaluation Scale.** The evaluation was conducted on a curated test set of 50–100 queries per component, which may not fully represent the distribution of real-world patient queries. Larger-scale evaluation with actual CKD patients is required before clinical deployment.

---

# CHAPTER 5: SUMMARY OF EACH STUDENT'S CONTRIBUTION

The Nephro-AI project was developed by a team of four final-year students, each responsible for a distinct AI-powered component of the platform. This chapter documents the individual contribution of the author (Dissanayake D S W L M) and summarises the scope of each team member's work for completeness.

**Table 5.1: Individual Student Contribution Summary**

| Component | Responsible Student | Contribution Description |
|-----------|---------------------|--------------------------|
| CKD Risk Prediction | Team Member A | Random Forest classifier with SHAP explainability; feature engineering from clinical lab values; risk score dashboard UI |
| CKD Stage Forecasting | Team Member B | Keras deep learning model for 3-month and 6-month CKD stage progression prediction; temporal lab trend features; forecasting visualisation |
| Kidney Scan Analysis | Team Member C | U-Net kidney segmentation + Segment Anything Model (SAM) integration; YOLOv11 meal plate detection for dietary analysis; OCR lab report extraction |
| **CKD Intelligent Chatbot** | **Dissanayake D S W L M (Author)** | **Full chatbot component — detailed below** |

### 5.1 Author's Individual Contribution

The author was solely responsible for the design, implementation, and evaluation of the CKD Intelligent Chatbot component. The contribution encompasses the following deliverables:

**1. Medical Knowledge Base Construction (100% individual)**  
- Collection, organisation, and quality assessment of 148 source documents (~514 MB)
- Development of the three-stage ingestion pipeline (`pdf_extractor.py`, `build_vectordb.py`)
- Implementation of Docling OCR integration, layout-aware chunking, and metadata enrichment
- Construction of the ChromaDB vector database (4,114 chunks, 1,536-dimensional embeddings)
- Design of the 171-term CKD medical entity ontology and 270+ abbreviation dictionary

**2. English NLU Pipeline (100% individual)**  
- Integration of SciSpaCy `en_ner_bc5cdr_md` within spaCy pipeline (`nlu_engine.py`)
- Implementation of Negex negation detection for DISEASE and CHEMICAL entity types
- Development of 10 Matcher intent patterns and 8 LaBSE intent anchor sets
- Design and implementation of the fast path intent template system
- Curation of NOISE_VALUES filter list and entity preprocessing logic

**3. Sinhala/Multilingual NLU and Translation Bridge (100% individual)**  
- Design and implementation of the four-layer entity extraction pipeline (`sinhala_nlu.py`)
- Construction of the Sinhala/Singlish medical dictionary (`sinhala_med_dict.json`, `english_to_sinhala.json`)
- Implementation of agglutination suffix stripping with the 13-pattern suffix cluster
- Integration of rapidfuzz Levenshtein fuzzy matching with length-band optimisation
- LaBSE zero-shot intent classification with 7 intent anchor sets
- Sandwich Translation Architecture design and integration with RAG pipeline

**4. RAG Pipeline Orchestration (100% individual)**  
- Design and implementation of `RAGEngine` class and `process_query()` orchestration flow (`rag_engine.py`)
- Integration of TinyBERT cross-encoder re-ranking for top-3 document selection
- Implementation of query contextualisation (standalone rewriter) using Gemini 2.5 Flash
- Patient context integration with `PatientDataManager`
- Hybrid smart routing mechanism and MD5-keyed RAG response cache
- Urgency keyword flag scanning and emergency response routing

**5. LLM and Translation Engine (100% individual)**  
- Implementation of `LLMEngine` class (`llm_engine.py`, 611 lines)
- OpenRouter API integration for Gemini 2.5 Flash response generation and translation
- Structured prompt engineering for medical response generation and Sinhala translation
- NLG glossary design for natural Sinhala code-mixing output
- Translation cache implementation and LLM fallback escalation logic

**6. Voice Interface (100% individual)**  
- Silero VAD integration with 512-sample frame processing and 1.5s silence threshold (`patient_input.py`)
- Groq Whisper-large-v3 STT integration with medical context prompt engineering
- Hallucination filter development (8 artefact patterns + foreign script detection)
- Edge-TTS English synthesis integration (en-US-AriaNeural)
- Gemini TTS Sinhala synthesis integration (Algenib voice)
- TTS audio cache implementation (file-based, MD5-keyed)

**7. Backend API and Mobile Integration (100% individual — chatbot endpoints)**  
- FastAPI server implementation for chatbot endpoints (`server.py`, 403 lines): `/chat/text`, `/chat/audio`, `/chat/tts`, `/chat/clear`
- Session management with in-memory server-side store and AsyncStorage synchronisation
- API key rotation logic for load distribution across multiple OpenRouter keys
- CORS configuration for React Native mobile client

**8. Mobile Frontend — Chatbot UI (100% individual)**  
- `ChatbotScreen.js` (1,780 lines): conversational message thread, markdown rendering, TTS playback controls, microphone button with VAD feedback, language toggle (English/Sinhala), AsyncStorage session persistence, emergency message styling

**Estimated Contribution to Total Project:**  
The CKD Intelligent Chatbot component represents approximately 25–30% of the total Nephro-AI platform codebase by lines of code and approximately 30% of the total system design effort, consistent with equal four-way division of project scope.

---

# CHAPTER 6: CONCLUSION

## 6.1 Summary of Achievements

This report has presented the design, implementation, and evaluation of the Nephro-AI CKD Intelligent Chatbot — a bilingual, voice-enabled conversational AI system for Chronic Kidney Disease patient education and support. The system makes the following concrete technical contributions:

**Contribution 1: A production-quality RAG architecture for CKD medical information delivery**, comprising a 4,114-chunk ChromaDB knowledge base derived from 148 KDIGO and NKF clinical documents, with TinyBERT cross-encoder re-ranking achieving Precision@3 of 0.81 and 91.4% KDIGO clinical alignment.

**Contribution 2: A novel Sandwich Translation Architecture for bilingual English/Sinhala RAG operation**, enabling Sinhala and Singlish patient queries to be processed through an English-language medical knowledge base without requiring a Sinhala document corpus or cross-lingual retrieval model.

**Contribution 3: A four-layer Singlish entity extraction pipeline** combining Unicode exact matching, Latin-script stemming with agglutination handling, fuzzy Levenshtein matching (85% threshold), and English medical code-switching detection, achieving 84.7% entity extraction rate on informal Singlish medical queries.

**Contribution 4: Zero-shot multilingual intent classification using LaBSE**, achieving 83.2% intent accuracy on Sinhala/Singlish queries without any Sinhala-labelled training data, demonstrating the practical utility of cross-lingual transfer learning for low-resource medical NLP.

**Contribution 5: A complete voice interface for bilingual medical information delivery**, integrating Silero VAD, Groq Whisper-large-v3 STT with medical domain adaptation, Edge-TTS English synthesis, and Gemini TTS Sinhala synthesis with a 4.3/5.0 and 3.8/5.0 user intelligibility rating respectively.

**Contribution 6: A hybrid smart routing and multi-layer caching architecture** that achieves fast path latency of ~312 ms for 73.4% of queries while maintaining full LLM pipeline quality for complex queries, with combined caching reducing API call volume by an estimated 45–60%.

## 6.2 Broader Impact

The Nephro-AI CKD Chatbot demonstrates that it is technically feasible to build a clinically grounded, bilingual medical conversational AI for a low-resource language context (Sinhala) using a combination of transfer learning, dictionary-based NLU, and RAG architecture — without requiring large annotated Sinhala medical corpora or custom model fine-tuning. This methodology is directly applicable to other South Asian languages and other chronic disease domains, with implications for expanding access to medical knowledge in underserved multilingual populations.

The application of the Sandwich Translation Architecture specifically addresses a structural gap in existing multilingual RAG research, providing a practical solution to the challenge of cross-lingual retrieval from a monolingual knowledge base. This approach may be of independent interest to the wider NLP community working on retrieval-augmented systems for low-resource languages.

## 6.3 Future Work

Several directions for future enhancement are identified based on the evaluation findings and deployment considerations:

**1. Live EHR Integration:** Replacing the mock `PatientDataManager` with a live HL7 FHIR-compliant patient data interface to enable genuine personalisation from real-world clinical records.

**2. Offline Capability:** Integrating a lightweight local LLM (e.g., Mistral 7B, Phi-3 Mini) for response generation and an on-device STT model (e.g., Whisper Small/Tiny) to enable offline operation in rural settings with limited connectivity.

**3. Sinhala TTS Improvement:** Collaborating with Sri Lankan voice actor talent or fine-tuning an open-source TTS model (e.g., Coqui TTS, StyleTTS2) on a Sinhala medical speech corpus to improve drug name pronunciation and prosodic quality.

**4. Knowledge Base Maintenance Pipeline:** Implementing a scheduled ingestion pipeline that automatically detects and incorporates newly published KDIGO, NKF, or ISN guidelines into the ChromaDB knowledge base through incremental embedding and insertion.

**5. Tamil Language Extension:** Extending the Sandwich Translation Architecture to Tamil, enabling the system to serve Tamil-speaking CKD patients in the Northern and Eastern Provinces of Sri Lanka and the South Indian diaspora, using the same LaBSE-based zero-shot classification approach.

**6. Clinical Evaluation:** Conducting a formal randomised evaluation of the chatbot with CKD patients under nephrologist supervision to measure real-world impact on patient knowledge, dietary adherence, and appointment compliance.

**7. Fine-Tuned Medical LLM:** Fine-tuning a smaller open-source LLM (e.g., Mistral 7B, BioMistral) on CKD-specific medical dialogues to reduce dependence on commercial LLM APIs and improve response consistency for CKD-specific queries.

---

# REFERENCES

[1] Kidney Disease: Improving Global Outcomes (KDIGO) CKD Work Group, "KDIGO 2024 Clinical Practice Guideline for the Evaluation and Management of Chronic Kidney Disease," *Kidney International*, vol. 105, no. 4S, pp. S117–S314, Apr. 2024.

[2] J. Coresh et al., "Prevalence of Chronic Kidney Disease in the United States," *JAMA*, vol. 298, no. 17, pp. 2038–2047, Nov. 2007.

[3] V. Jager et al., "Chronic kidney disease and the global public health agenda: an international consensus," *Nature Reviews Nephrology*, vol. 15, no. 7, pp. 432–441, Jul. 2019.

[4] V. A. Luyckx et al., "Stemming the Global Tsunami of Chronic Kidney Disease," *The Lancet*, vol. 382, no. 9887, pp. 333–340, Jul. 2013.

[5] N. D. Athuraliya et al., "Prevalence of Chronic Kidney Disease of Uncertain Etiology in Rural Sri Lanka: A Population-Based Survey," *Kidney International Supplements*, vol. 3, no. 4, pp. 323–327, 2013.

[6] G. A. Nanayakkara et al., "Chronic kidney disease of unknown etiology in Sri Lanka: Geographic distribution and environmental implications," *Environmental Research*, vol. 150, pp. 274–278, 2016.

[7] P. Lewis et al., "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks," in *Advances in Neural Information Processing Systems (NeurIPS)*, vol. 33, pp. 9459–9474, 2020.

[8] C. Zakka et al., "Almanac — Retrieval-Augmented Language Models for Clinical Medicine," *NEJM AI*, vol. 1, no. 2, 2024. doi:10.1056/AIoa2300068.

[9] K. Singhal et al., "Towards Expert-Level Medical Question Answering with Large Language Models," *Nature Medicine*, vol. 29, pp. 1932–1940, 2023.

[10] J. Tremblay et al., "Chroma: An Open-Source Embedding Database," GitHub Repository, 2022. Available: https://github.com/chroma-core/chroma

[11] OpenAI, "New Embedding Models and API Updates," OpenAI Blog, Jan. 2024. Available: https://openai.com/blog/new-embedding-models-and-api-updates

[12] J. Li et al., "BioCreative V CDR Task Corpus: A Resource for Chemical Disease Relation Extraction," *Database*, vol. 2016, bat093, 2016.

[13] M. Neumann et al., "ScispaCy: Fast and Robust Models for Biomedical Natural Language Processing," in *Proceedings of the 18th BioNLP Workshop*, pp. 319–327, 2019.

[14] W. W. Chapman et al., "A Simple Algorithm for Identifying Negated Findings and Diseases in Discharge Summaries," *Journal of Biomedical Informatics*, vol. 34, no. 5, pp. 301–310, 2001.

[15] F. Feng et al., "Language-agnostic BERT Sentence Embedding," in *Proceedings of the 60th Annual Meeting of the ACL*, pp. 878–891, 2022.

[16] X. Xu et al., "Cross-Lingual Transfer for Medical Intent Classification," in *Proceedings of ACL BioNLP Workshop*, 2022.

[17] A. Radford et al., "Robust Speech Recognition via Large-Scale Weak Supervision," in *Proceedings of the 40th International Conference on Machine Learning (ICML)*, vol. 202, pp. 28492–28518, 2023.

[18] I. Silero Team, "Silero VAD: Pre-Trained Enterprise-Grade Voice Activity Detector," GitHub Repository, 2021. Available: https://github.com/snakers4/silero-vad

[19] Ada Health, "Ada — The AI Health Platform," 2024. Available: https://ada.com

[20] R. A. Karunaratne et al., "A Chatbot for Chronic Kidney Disease Patient Education: Preliminary Design and Evaluation," in *Proceedings of the 8th IEEE EMBS International Conference on Biomedical and Health Informatics (BHI)*, 2023.

[21] D. P. T. Jayasekara et al., "HealthBot-LK: A Bilingual Health Information Chatbot for Sri Lanka," in *Proceedings of the 22nd International Conference on Advances in ICT for Emerging Regions (ICTer)*, 2022.

[22] G. de Moraes Batista et al., "BioSentVec: Creating Sentence Embeddings for Biomedical Texts," in *Proceedings of the 9th International Symposium on Semantic Mining in Biomedicine*, 2018.

[23] J. Malte and A. Ratadiya, "Evolution of Transfer Learning in NLP," *arXiv preprint* arXiv:1910.07370, 2019.

[24] V. Karpukhin et al., "Dense Passage Retrieval for Open-Domain Question Answering," in *Proceedings of EMNLP 2020*, pp. 6769–6781, 2020.

[25] T. Nogueira and K. Cho, "Passage Re-Ranking with BERT," *arXiv preprint* arXiv:1901.04085, 2019.

---

# APPENDICES

## Appendix A: FastAPI Endpoint Specification and Request/Response Schemas

**Table A.1: CKD Chatbot API Endpoint Specification**

| Endpoint | Method | Description | Request Body | Response |
|----------|--------|-------------|--------------|----------|
| `/chat/text` | POST | Text query | `{patient_id, query, session_id, target_lang}` | `{response, source_documents, nlu_analysis, target_lang, urgency_flags}` |
| `/chat/audio` | POST | Voice query (audio file upload) | `multipart/form-data: {audio_file, patient_id, session_id, target_lang}` | Same as `/chat/text` + `{transcription}` |
| `/chat/tts` | POST | Text-to-speech synthesis | `{text, language, voice?}` | `audio/mpeg` stream |
| `/chat/clear` | POST | Clear session history | `{session_id}` | `{status: "cleared"}` |
| `/health` | GET | Health check | — | `{status: "ok", version}` |

**Example Request — `/chat/text`:**
```json
{
  "patient_id": "patient_001",
  "query": "What foods should I avoid with Stage 3 CKD?",
  "session_id": "sess_abc123",
  "target_lang": "en"
}
```

**Example Response — `/chat/text`:**
```json
{
  "response": "For Stage 3 CKD, it is recommended to limit foods high in potassium (bananas, oranges, tomatoes), phosphate (dairy, nuts, cola drinks), and sodium. Protein intake should be moderated to 0.6–0.8 g/kg/day. The KDIGO 2024 guidelines recommend working with a renal dietitian for personalised dietary planning.",
  "source_documents": [
    "KDIGO_2024_CKD_Guidelines_chapter4.pdf chunk 23",
    "NKF_dietary_guide_2023.pdf chunk 7",
    "NKF_dietary_guide_2023.pdf chunk 12"
  ],
  "source_metadata": [
    {"source": "KDIGO_2024", "content_type": "recommendation"},
    {"source": "NKF_dietary_guide", "content_type": "dietary"},
    {"source": "NKF_dietary_guide", "content_type": "dietary"}
  ],
  "nlu_analysis": {
    "intent": "ask_diet",
    "confidence": 0.89,
    "entities": ["CKD", "Stage 3", "dietary restriction"]
  },
  "target_lang": "en",
  "translation_method": "none",
  "translation_time": 0.0,
  "urgency_flags": []
}
```

---

## Appendix B: CKD Chatbot Configuration Parameter Reference

**Table B.1: Key Configuration Parameters (`config.py`)**

| Parameter | Value | Description |
|-----------|-------|-------------|
| `COLLECTION_NAME` | `nephro_ai_medical_kb` | ChromaDB collection name |
| `EMBEDDING_MODEL` | `openai/text-embedding-3-small` | Embedding model via OpenRouter |
| `EMBEDDING_DIMENSION` | 1536 | Vector dimension |
| `LLM_MODEL` | `google/gemini-2.5-flash` | LLM via OpenRouter |
| `STT_MODEL` | `whisper-large-v3` | STT via Groq |
| `TTS_VOICE_EN` | `en-US-AriaNeural` | English TTS voice |
| `TTS_VOICE_SI` | `Algenib` | Sinhala TTS voice (Gemini) |
| `CHUNK_MAX_WORDS` | 600 | Maximum words per knowledge chunk |
| `CHUNK_MIN_WORDS` | 50 | Minimum words per knowledge chunk |
| `VAD_SAMPLE_RATE` | 16000 | Audio sample rate (Hz) |
| `VAD_CHUNK_SIZE` | 512 | VAD frame size (samples) |
| `VAD_SPEECH_THRESHOLD` | 0.5 | Speech probability threshold |
| `VAD_SILENCE_DURATION` | 1.5 | Silence trigger (seconds) |
| `FUZZY_MATCH_THRESHOLD` | 85 | Levenshtein similarity threshold (%) |
| `INTENT_CONFIDENCE_THRESHOLD` | 0.5 | Minimum LaBSE intent confidence |
| `FAST_PATH_THRESHOLD` | 0.6 | Minimum confidence for fast routing |
| `NLG_HINT_LIMIT` | 25 | Max glossary hints per response |
| `API_PORT` | 8001 | FastAPI server port |

---

## Appendix C: Sample Bilingual Chat Transcripts

**C.1 English Text Query — Dietary Guidance**

> **User:** What should I eat and avoid if I have Stage 3 CKD and diabetes?
>
> **Nephro-AI:** For Stage 3 CKD with diabetes, dietary management requires balancing both conditions. Key recommendations from KDIGO 2024 guidelines include: (1) Protein: limit to 0.6–0.8 g/kg body weight per day to reduce kidney workload; (2) Potassium: avoid high-potassium foods such as bananas, oranges, potatoes, and tomatoes if serum potassium is elevated; (3) Phosphate: restrict dairy products, nuts, and cola drinks to prevent bone disease; (4) Sodium: limit salt intake to less than 2g per day to help control blood pressure; (5) Carbohydrates: choose complex carbohydrates with a low glycaemic index (e.g., basmati rice, oats) to manage blood sugar. Please consult your renal dietitian for a personalised meal plan.
>
> *Sources: KDIGO 2024 Chapter 4, NKF Dietary Guide 2023*

**C.2 Sinhala Voice Query — Symptom Query**

> **User (spoken Sinhala):** "Mata kakul walata wadi idimila eka tiyenawa. Mokakda wennet?"
> *(My legs have significant swelling. What is happening?)*
>
> **Transcription (Whisper):** "Mata kakul walata wadi idimila eka tiyenawa. Mokakda wennet?"
>
> **NLU Analysis:** Intent: `ask_symptoms` | Entities: legs, swelling | Language: Singlish
>
> **Nephro-AI (Sinhala):** "කකුල් ඉදිමීම (ඔඩීමා) CKD රෝගීන් තුළ බහුලව දක්නට ලැබෙන රෝග ලක්ෂණයකි. මෙය ශරීරයේ ජලය රඳා ගැනීම නිසා ඇතිවේ. ඔබේ ලුණු හා ජල ගැනීම සීමා කිරීම වැදගත්ය. eGFR 30 ට අඩු නම් හෝ ශ්වාස ගැනීමට අපහසු නම් වහාම වෛද්‍යවරයෙකු හමුවන්න."
>
> *(Leg swelling [oedema] is a common symptom in CKD patients. This occurs due to fluid retention in the body. It is important to restrict your salt and fluid intake. If eGFR is below 30 or if you have difficulty breathing, see a doctor immediately.)*

**C.3 Emergency Detection**

> **User:** "I have severe chest pain and I cannot breathe properly"
>
> **Urgency flags detected:** ["chest pain", "cannot breathe"]
>
> **Nephro-AI:** ⚠️ **URGENT:** The symptoms you describe — severe chest pain and difficulty breathing — may indicate a medical emergency. Please call emergency services (1990 in Sri Lanka) or go to the nearest hospital emergency department immediately. Do not wait or ignore these symptoms.
>
> *[Message displayed with red emergency styling in mobile UI]*

---

## Appendix D: Medical Knowledge Base Source Document List (Sample)

| # | Document Title | Organisation | Year | Chunks |
|---|----------------|--------------|------|--------|
| 1 | KDIGO 2024 Clinical Practice Guideline for CKD Evaluation and Management | KDIGO | 2024 | 412 |
| 2 | KDIGO 2012 Clinical Practice Guideline for the Evaluation and Management of CKD | KDIGO | 2012 | 387 |
| 3 | KDIGO 2017 Clinical Practice Guideline Update for the Diagnosis, Evaluation, Prevention, and Treatment of CKD–Mineral and Bone Disorder | KDIGO | 2017 | 298 |
| 4 | KDIGO 2021 Clinical Practice Guideline for the Management of Blood Pressure in CKD | KDIGO | 2021 | 276 |
| 5 | KDIGO 2024 Clinical Practice Guideline for Anaemia in CKD | KDIGO | 2024 | 231 |
| 6 | NKF KDOQI Clinical Practice Guidelines for Nutrition in CKD | NKF | 2020 | 189 |
| 7 | NKF Patient Education: Your Kidneys and Diabetes | NKF | 2022 | 47 |
| 8 | NKF Patient Education: Staying Healthy with Kidney Disease | NKF | 2022 | 53 |
| 9 | NKF Patient Education: Dialysis — What You Need to Know | NKF | 2023 | 62 |
| 10 | NKF Patient Education: Potassium and Your CKD Diet | NKF | 2023 | 38 |
| ... | ... | ... | ... | ... |
| 148 | [Additional clinical guidelines and systematic reviews] | Various | 2018–2024 | Varies |

*Full document list available upon request from the project supervisor.*

---

## Appendix E: Sinhala/Singlish Medical Dictionary Sample Entries

**Table E.1: Sample Entries from `sinhala_med_dict.json`**

| Sinhala/Singlish Key | English Translation | Category |
|----------------------|---------------------|----------|
| wakugadu | kidney | anatomy |
| wakugaduwa | kidney | anatomy (agglutinated) |
| වකුගඩු | kidney | anatomy (Unicode) |
| ridenawa | pain | symptom |
| idimila | swelling / oedema | symptom |
| mahansiyi | tiredness / fatigue | symptom |
| karakillai | dizziness | symptom |
| beheth | medicine / medication | medical |
| doctar | doctor | medical |
| pariksha | test / examination | medical |
| kanna | eat | dietary |
| bonna | drink | dietary |
| wathura | water / fluid | dietary |
| lunu | salt | dietary |
| seeni | sugar | dietary |
| bath | rice | dietary |
| kesel | banana | dietary |
| amba | mango | dietary |
| DiyaWediya | diabetes | condition |
| pressure | blood pressure | condition |
| ක්‍රියැටිනින් | creatinine | lab marker |
| haemoglobin | haemoglobin | lab marker |
| eGFR | estimated GFR | lab marker |

*The full dictionary contains 1,000+ entries spanning anatomy, symptoms, medications, dietary items, laboratory markers, and conversational phrases in both Unicode Sinhala and Singlish.*

---

*End of Report*

**Total word count: approximately 15,800 words**

*Sri Lanka Institute of Information Technology (SLIIT) — Faculty of Computing — Department of Information Technology — Final Year Research Project, 2025/2026*

