# Cartas y Dados (Cards & Dice) — Foundry VTT System

> ⚠️ AI-assisted project. Code, in-game UI and internal docs are currently in Spanish.

A custom RPG system for **Foundry VTT v14** (`14.369+`) that combines personal card decks with dice rolls. No external modules required.

**Current version:** 0.12.0 (beta)

## How it plays
- **Card + Dice (`XdY`):** a card's **suit** picks the Characteristic that sets how many dice you roll: Espadas → Physical (FISC), Bastos → Awareness (CONS), Oros → Social (SOC), Copas → Mysticism (MIST). Its **number (1–5)** sets the die: d4, d6, d8, d10, d12.
- **Criticals & Fumbles:** every die that rolls its maximum is rerolled once and added. If at least half the dice show 1, those dice are rerolled and subtracted; a negative result is an automatic failure (in opposed rolls the opponent adds its absolute value).
- **Resolution:** attacks roll against the target's Defense (the difference is damage); only the GM sees the Defense and damage and can apply it from chat; other actions roll against the GM's Difficulty.
- **Six piles per character:** Deck, Hand, Discard, Burned, Trinkets and In Play. Trinkets are named, levelled cards that give ongoing bonuses without rolling.
- **Exhaustion (0–8):** running out of cards reshuffles your discard and adds 1 Exhaustion. Levels stack: halved hand size (1), speed (2) and max health (3), no reactions (4), only one active Trinket (5), halved roll results (6), used cards are burned (7) and death (8). A comfortable, safe rest removes 1 point (max. once per day). Ending a scene recovers most cards; resting recovers everything.
- **Skills** burn a Mysticism card from your hand (NPCs without a deck use their own die instead).
- **Character creation:** a short wizard to pick one of 5 races (Humanos, Mairu, Mandrágora, Trastolillos, Sierpes), one of 5 base classes and a starting Trinket, which builds a 12-card starting deck.
- **Levelling up:** a confirmed level-up (1 → 2) lets each base class pick one new skill and one pack of extra cards for its deck.
- **NPCs:** per-Characteristic dice with direct rolls and an optional Boss Deck.
- **GM Panel** (crown button in Token controls): Difficulty, group actions and a party overview.
- **Portraits:** click any sheet image to view it full size; small Edit and Token buttons sit right below it.
- **Responsive windows:** every sheet, panel and dialog fits the screen, reflows when resized and scrolls wherever content can grow.

## Installation
1. Clone into `Data/systems/` as `cartas-y-dados`:
   ```bash
   git clone <REPOSITORY_URL> cartas-y-dados
   ```
2. Create a World with **"Sistema de Rol: Cartas y Dados"**.

Built on the modern v14 API (`TypeDataModel`, `ApplicationV2`, no `template.json` or jQuery).
