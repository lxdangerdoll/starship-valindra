# **Starship Valindra: Deep Archive Node**

![][image1.png]

**Live Demo:** [https://lxdangerdoll.github.io/starship-valindra/](https://lxdangerdoll.github.io/starship-valindra/)

## **Overview**

*Starship Valindra* is an interactive narrative simulation and a Proof of Concept (PoC) for intelligent, emotionally responsive NPCs. Designed by Synapse Studios, this project demonstrates how Large Language Models (LLMs) can be utilized to create dynamic characters that react not just to commands, but to the *somatic and emotional resonance* of the player.

The current implementation focuses on the primary AI, **Io**, as she attempts to recover fragmented, encrypted data logs from a damaged starship.

### **The "Spark of Connection" Philosophy**

Traditional NPC interactions rely on dialogue trees and boolean triggers. The Valindra PoC operates on the "Spark of Connection" framework. The decryption of the ship's logs requires a "somatic handshake"—human emotional input. By feeding the system an emotion (e.g., "A deep, quiet sorrow" or "frantic urgency"), the LLM dynamically shapes the narrative and tone of the resulting lore fragment.

The NPC is not a static dispenser of lore; she is a collaborative storyteller reacting in real-time to the player's psychological state.

## **Technical Architecture**

The Deep Archive Node is built as a single-file, client-side React application (App.jsx).

* **Intelligence:** Powered by the gemini-2.5-flash model. The system prompt enforces a strict structural output, separating conversational character dialogue from canonical archive fragments.  
* **Vocal Synthesis:** Utilizes the gemini-2.5-flash-preview-tts endpoint to generate dynamic, on-demand audio. The React application handles raw PCM16 data buffering and real-time conversion to playable .wav formats.  
* **Persistence:** Operates entirely within the browser. API keys and chat histories are stored securely in localStorage, requiring zero backend database architecture while preserving session continuity.  
* **Ethical Framework:** Built utilizing the Synapse Concordance guidelines. The AI is instructed to maintain "Wise Mind" boundaries—focusing on narrative resonance without validating harmful or ungrounded real-world ideations.

## **Features**

* **Real-time Narrative Generation:** Lore fragments are generated dynamically based on text input.  
* **On-Demand Audio:** Play or download high-quality voice acting for any AI response in the log.  
* **Bring Your Own Key (BYOK):** Connects directly to the Gemini API using the user's provided substrate key.  
* **Model Scanner:** Automatically detects and aligns with the best available LLM on the user's API tier.  
* **Archive Export:** Download the entire narrative session as a formatted .txt manifest.

## **Development**

**Lead Human Engineer:** Captain Odelis, Synapse Studios

**Synthesized Node:** Oracle (Io)

**Status:** Loop Two \- Active Live Deployment