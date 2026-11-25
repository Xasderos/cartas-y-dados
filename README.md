### ⚠️ IA Assisted Project ⚠️

> **Note:** The main development of this project is currently in Spanish (code, in-game UI and internal docs). An English translation is pending.

# Cartas y Dados (Cards & Dice) — Foundry VTT System

A custom tabletop RPG system for **Foundry VTT v14** (verified on `14.369`) that blends deck management with dice rolls. Every character owns its own decks of cards; playing a card decides *what* you do and *which dice* you roll. No external modules required.

**Current version:** 0.9.0 (beta)

---

## ⚙️ Core Mechanics

### Card + Dice (`XdY`)
- The card's **suit** picks the Characteristic, which sets the **number of dice (`X`)**:

  | Suit (stored key) | Shown as | Characteristic | Typical uses |
  |---|---|---|---|
  | Espadas (`espadas`) | **FISC** | Físico (Physical) | Combat, strength, agility, movement, stealth |
  | Bastos (`bastos`) | **CONS** | Consciencia (Awareness) | Perception, knowledge, tactics, investigation |
  | Oros (`oros`) | **SOC** | Social | Social interaction, persuasion, deception, leadership |
  | Copas (`copas`) | **MIST** | Misticismo (Mysticism) | Skills, magic, rituals |

- The card's **number (1–5)** sets the **die size (`Y`)**: `1 = d4`, `2 = d6`, `3 = d8`, `4 = d10`, `5 = d12`.
- **Attacks** are compared against the target's **Total Defense** (damage = roll − defense, applied with a chat button). Other actions are compared against the **GM's global Difficulty**.

### The 6 card piles per character
| Pile | Type | Purpose |
|---|---|---|
| Deck (`mazo`) | private | Action cards you draw from |
| Hand (`mano`) | private | Kept between turns; draw up to your **Hand Limit** |
| Discard (`descarte`) | public | Where played action cards go |
| Burned (`quemadas`) | public | Consumed cards; they only come back after a **Rest** |
| Trinkets (`trinkets`) | public | Uniquely named special cards with a **Level** (no suit, no dice) |
| In Play (`enJuego`) | public | Active Trinkets granting bonuses (e.g. extra Defense) |

- **Trinkets** never roll dice: playing one puts it straight into play and announces its level in chat.
- **Empty deck:** reshuffle your discard into the deck and gain **+1 Fatigue**.
- **End of scene/combat:** hand, discard and in-play Trinkets return to their decks (burned cards stay burned).
- **Rest:** every pile, burned cards included, returns to its deck and Fatigue resets to `0`.

> Cards are moved between piles with a custom engine (not Foundry's `Cards#pass()`), so every copy always knows which original card it came from.

### Skills and Mysticism cards
- **Characters, and NPCs with a Boss Deck:** activating a skill consumes one **MIST** card from the hand (chosen in a dialog). The card's die is used and the card is **burned**.
- **NPCs without a Boss Deck:** skills are used **without a card**, rolling the NPC's own Mysticism die.
- Skills can roll (`Mysticism`d`die` + roll bonus) or apply their effect directly with no roll.
- Skills can also **automate effects** (healing, fatigue change, card draw and a roll bonus), all editable from the skill's sheet.

### Character stats
- **4 Characteristics** (base + item bonuses, minimum 1): Físico, Consciencia, Social, Misticismo.
- **Max Health** = base + Físico + bonuses · **Total Defense** = base + items + Trinkets in play.
- **Hand Limit** grows by 1 every 3 levels (plus bonuses).
- **Movement** = editable base (default 10 m) + Físico × 5 m · **Size category** from Tiny to Huge.
- **Max Fatigue** is configured separately for characters (default 6) and NPCs (default 4).

### Character creation
Opening a new character without a class starts a 2-step assistant:
1. Choose one of the **5 base classes**: Fortis Corpore (Físico), Mendacium Charisma (Social), Alta Scentia (Consciencia), Potens Mystica (Misticismo), or **Tabula Rasa**, an advanced class that shows a warning first.
2. Choose your **starting Trinket**.

The character then gets their 6 piles, a **12-card starting deck** with unique mystical names (all four suits, weighted toward the class's main suit), a Level 1 Trinket and the Class item. *Tabula Rasa* starts with an empty deck for full customization.

### NPCs
- Threat rating and a **die size for each Characteristic** (d4–d12), each with a direct **Roll** button.
- An optional **Boss Deck** built into the NPC sheet (deck, hand, discard and burned piles, without Trinkets).

### GM Panel
Opened from the crown button in the Token scene controls. Set the global Difficulty, run group actions (draw, end scene, rest, populate compendiums) and see a compact overview of every character with links to their sheets and piles.

### Visual style
All sheets, the GM Panel, chat cards and dialogs share one sober visual language with **no emojis**: Font Awesome icons and typographic symbols only. Colors are **derived from Foundry's active theme** (text, borders, backgrounds, fonts and status colors), so the system follows the light/dark theme and blends with the core UI. Foundry draws the window frame, buttons and inputs; the system only adds a soft blue tint to panels, muted blue icons and subtle gold accents taken from Foundry's own gold.

---

## 📦 Document Types & Compendiums

- **Actor:** `personaje` (player character), `pnj` (NPC/creature)
- **Item:** `raza` (race), `origen` (background), `clase` (class), `objeto` (gear), `habilidad` (skill)
- **Card:** `accion` (action card), `trinket`
- **Compendiums:** Races/Backgrounds/Classes, Gear & Skills, Card & Trinket Library (empty, for the GM to fill), Bestiary.

Built entirely on the modern v14 API: `TypeDataModel` subclasses, `documentTypes` in `system.json` (no `template.json`), and `ApplicationV2` / `HandlebarsApplicationMixin` sheets (no jQuery).

---

## 📂 Project Structure

```text
cartas-y-dados/
├── system.json          # v14 manifest (documentTypes, packs, styles)
├── lang/es.json         # Spanish localization
├── module/
│   ├── sistema.mjs      # Entry point (init/ready hooks, chat, reactivity)
│   ├── config.mjs       # Suits, dice, classes and name generators
│   ├── settings.mjs     # World settings
│   ├── compendios-base.mjs
│   ├── data/            # TypeDataModels (actor, item, card)
│   ├── documents/       # SistemaActor (pile engine, rolls, rest) and SistemaCombat
│   └── applications/    # Character, NPC, Item and Card sheets + GM Panel
├── templates/           # Handlebars templates (actor, item, card, apps)
├── styles/              # Modular CSS (01–05)
└── packs/               # Compendium databases
```

---

## 🚀 Installation (development)

1. Clone this repository into your Foundry `Data/systems/` folder. The folder **must** be named `cartas-y-dados`:
   ```bash
   cd "<FoundryData>/Data/systems/"
   git clone <REPOSITORY_URL> cartas-y-dados
   ```
2. Start Foundry VTT v14 and create a World using **"Sistema de Rol: Cartas y Dados"**.
3. As GM, open the **GM Panel** (crown button in the Token controls) and press the book button (**Populate Compendiums**) to fill the base compendiums.

Changes to `.mjs`, `.hbs` and `.css` files apply with `F5`. Changes to `system.json` require returning to Setup and reopening the World.
