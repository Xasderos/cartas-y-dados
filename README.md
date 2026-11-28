# Cartas y Dados (Cards & Dice) — Foundry VTT System

> ⚠️ AI-assisted project. Code, in-game UI and internal docs are currently in Spanish. Button names below are given in Spanish (as shown in-game) with an English translation.

A custom RPG system for **Foundry VTT v14** (`14.369+`) that combines personal card decks with dice rolls. No external modules required.

**Current version:** 0.22.2 (beta)

## Installation

### From Foundry (recommended)
1. In the Foundry **Setup** screen, open **Game Systems** → **Install System**.
2. Paste this URL into the **Manifest URL** field at the bottom and click **Install**:
   ```
   https://raw.githubusercontent.com/Xasderos/cartas-y-dados/master/manifest.json
   ```
3. Create a World with **"Sistema de Rol: Cartas y Dados"**.

Updates show up in **Game Systems** → **Check for Updates**, like any other system.

### Manual (development)
1. Clone into `Data/systems/` as `cartas-y-dados` (the folder name must match the system `id`):
   ```bash
   git clone https://github.com/Xasderos/cartas-y-dados.git cartas-y-dados
   ```
2. Create a World with **"Sistema de Rol: Cartas y Dados"**.

## Core idea in one minute
- Every character owns a deck of **Action Cards**. Playing a card is how you act.
- A card's **suit** picks the Characteristic, and that Characteristic sets **how many dice** you roll (`X`): Espadas → Physical (FISC), Bastos → Awareness (CONS), Oros → Social (SOC), Copas → Mysticism (MIST).
- The card's **number (1–5)** sets **which die** you roll (`Y`): d4, d6, d8, d10, d12. So a card rolls `XdY`.
- **Trinkets** are special cards that don't roll: you put them in play and they give ongoing effects.
- Each character has six card piles: **Deck, Hand, Discard, Burned, Trinkets and In Play**.

## Getting started

### 1. World settings (GM)
Open **Game Settings → Configure Settings → Cartas y Dados** to set the defaults for new characters (base health, defense, hand size, starting characteristic value, size, base movement) and whether critical and fumble dice roll **automatically** or **manually** (buttons on the chat card).

### 2. Create a character (player or GM)
1. Create an Actor of type **Personaje** (player character) and open its sheet.
2. The **creation wizard** opens on its own: pick a **race**, a **base class** and a **starting Trinket**.
3. The system builds the starting deck and all six piles. If you close the wizard, you can reopen it from the sheet's **"Asistente de Clase"** (class wizard) button.

### 3. Create NPCs (GM)
Create an Actor of type **PNJ**. NPCs roll directly from their sidebar (each Characteristic has its own die). If you want an NPC to fight with cards like a player, turn on its **"Mazo de Jefe"** (boss deck).

## Playing a session

### The character sheet
- **Left column:** Health, Defense, Hand Size, the four Characteristics and Movement. Hover any value to see how it is calculated.
- **Tabs:** **Principal** (main: piles, hand, trinkets, skills, exhaustion), **Equipo** (equipment) and **Raza** (race traits).
- Click the portrait to view it full size; the small buttons below it edit the image and the token.

### Turn flow in combat
1. Start a combat in Foundry's Combat Tracker as usual.
2. At the start of your turn, press **"Inicio de Turno"** (start of turn) to draw up to your hand size. If your deck runs out, your discard is reshuffled and you gain 1 **Exhaustion**.
3. Press **"Usar"** (use) on a card in your hand. The **action dialog** lets you choose the action (attack, defense, grapple, help, skills, or any free action), and optionally:
   - **Ataque apuntado** (aimed attack): combine two cards of the same suit.
   - **Potenciar** (empower): burn another Mysticism card and add its roll.
   - **Reacción** (reaction): one per round, until your next turn.
4. **Targeting:** target a token (`T`) before attacking. The roll is compared to the target's Defense; only the GM sees the Defense and damage and applies it from the chat card. Other actions roll against the GM's **Difficulty**.
5. Used cards go to the Discard; Mysticism cards (and some others) are **burned** instead.
6. When combat ends, press **"Fin de Combate"** (end of combat): hand, discard and in-play cards return to the deck.

### Out of combat
Press **"Acción fuera de combate"** (out-of-combat action) to start a "mini turn": you draw twice your hand size and can draw more hands if needed (each one takes one more turn). **"Reacción fuera de combate"** (out-of-combat reaction) draws only once. Finish with the button shown on the sheet, and choose what to do with the leftover cards.

### Resting
Press **"Descansar"** (rest): every pile, including burned cards, returns to the deck. Choose a **comfortable rest** to also recover 1 point of Exhaustion (max. once per day).

### Levelling up
When a level-up is available, an arrow button appears on the class slot of the sheet. It opens a dialog to pick the new skill, card pack or specialization for that level; it asks for confirmation because it cannot be undone. The class item shows its full progression table.

### Rules exceptions
The system enforces the rules (one reaction per round, burning Mysticism cards, exhaustion penalties...), but every restriction can be overridden with a confirmation, for GM-approved exceptions.

## GM tools

### GM Panel
Open it with the **crown button** in the Token controls. From there you can:
- Set the **Difficulty** (with quick buttons; right-click one to change its value).
- Control the **Danger Level** (0–15), see its active effects and the trinket counter.
- Run group actions for the whole party: **Robar** (draw), **Fin Escena** (end of scene, which can also reset the Danger Level) and **Descanso** (rest).
- See an overview of every character and NPC with links to their sheets and piles.

### Chat cards
Roll cards show criticals and fumbles, and give the GM private buttons to apply damage, healing or conditions. Hidden information (Defense, damage) is whispered only to the GM.

## System features
- **Card-driven dice engine:** `XdY` rolls with automatic criticals (max dice reroll and add) and fumbles (if half the dice show 1, they reroll and subtract). A negative result is an automatic failure.
- **Exhaustion (0–8):** a stacking penalty track, gained mostly by reshuffling your deck; level 8 is death. Shown and adjustable on the sheet.
- **Danger Level (0–15):** a scene-wide tension track whose effects stack for every creature. It rises automatically during play and is announced in chat.
- **Health and death:** max-health changes move current health with them; dropping to 0 marks the token as Dead (and defeated in combat).
- **Races and classes:** 5 races and 5 base classes with specializations, automated traits, trinkets and skills. The details of each one are on its item sheet inside Foundry.
- **Content editing:** item and card sheets expose every rule behaviour, so you can create and tune your own races, classes, skills, cards and trinkets in Foundry. Changes to a card sync with all its copies.
- **Compendiums:** four packs (classes and backgrounds, equipment and skills, decks and cards, bestiary) are included empty for now, ready for future content.
- **Responsive windows:** every sheet, panel and dialog fits the screen, reflows when resized and scrolls wherever content can grow. The window menu (⋮) has **"Ajustar a la altura de la pantalla"** to stretch a sheet to full screen height.
- **Light and dark theme:** the interface follows Foundry's theme.
- **Housekeeping:** deleting an actor also deletes its card piles.

Built on the modern v14 API (`TypeDataModel`, `ApplicationV2`, no `template.json` or jQuery).
