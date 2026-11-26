# Cartas y Dados (Cards & Dice) — Foundry VTT System

> ⚠️ AI-assisted project. Code, in-game UI and internal docs are currently in Spanish.

A custom RPG system for **Foundry VTT v14** (`14.369+`) that combines personal card decks with dice rolls. No external modules required.

**Current version:** 0.9.5 (beta)

## How it plays
- **Card + Dice (`XdY`):** a card's **suit** picks the Characteristic that sets how many dice you roll: Espadas → Physical (FISC), Bastos → Awareness (CONS), Oros → Social (SOC), Copas → Mysticism (MIST). Its **number (1–5)** sets the die: d4, d6, d8, d10, d12.
- **Resolution:** attacks roll against the target's Defense (the difference is damage, applied from chat); other actions roll against the GM's Difficulty.
- **Six piles per character:** Deck, Hand, Discard, Burned, Trinkets and In Play. Trinkets are named, levelled cards that give ongoing bonuses without rolling.
- **Fatigue:** running out of cards reshuffles your discard and adds Fatigue. Ending a scene recovers most cards; resting recovers everything and clears Fatigue.
- **Skills** burn a Mysticism card from your hand (NPCs without a deck use their own die instead).
- **Character creation:** a short wizard to pick one of 5 base classes and a starting Trinket, which builds a 12-card starting deck.
- **NPCs:** per-Characteristic dice with direct rolls and an optional Boss Deck.
- **GM Panel** (crown button in Token controls): Difficulty, group actions and a party overview.

## Installation
1. Clone into `Data/systems/` as `cartas-y-dados`:
   ```bash
   git clone <REPOSITORY_URL> cartas-y-dados
   ```
2. Create a World with **"Sistema de Rol: Cartas y Dados"**.
3. As GM, open the GM Panel and press **Populate Compendiums**.

Built on the modern v14 API (`TypeDataModel`, `ApplicationV2`, no `template.json` or jQuery).
