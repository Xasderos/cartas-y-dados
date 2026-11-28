# Cartas y Dados (Cards & Dice) — Foundry VTT System

> ⚠️ AI-assisted project. Code, in-game UI and internal docs are currently in Spanish.

A custom RPG system for **Foundry VTT v14** (`14.369+`) that combines personal card decks with dice rolls. No external modules required.

**Current version:** 0.19.0 (beta)

## How it plays
- **Card + Dice (`XdY`):** a card's **suit** picks the Characteristic that sets how many dice you roll: Espadas → Physical (FISC), Bastos → Awareness (CONS), Oros → Social (SOC), Copas → Mysticism (MIST). Its **number (1–5)** sets the die: d4, d6, d8, d10, d12.
- **Criticals & Fumbles:** every die that rolls its maximum is rerolled once and added. If at least half the dice show 1, those dice are rerolled and subtracted; a negative result is an automatic failure (in opposed rolls the opponent adds its absolute value). A world setting chooses whether these extra dice roll automatically or by clicking buttons on the roll's chat card.
- **Resolution:** attacks roll against the target's Defense (the difference is damage); only the GM sees the Defense and damage and can apply it from chat; other actions roll against the GM's Difficulty.
- **Six piles per character:** Deck, Hand, Discard, Burned, Trinkets and In Play. Trinkets are named, levelled cards that give ongoing bonuses without rolling.
- **Exhaustion (0–8):** running out of cards reshuffles your discard and adds 1 Exhaustion. Levels stack: halved hand size (1), speed (2) and max health (3), no reactions (4), only one active Trinket (5), halved roll results, except negative ones (6), used cards are burned (7) and death (8). A comfortable, safe rest removes 1 point (max. once per day). Ending a scene recovers most cards; resting recovers everything.
- **Actions:** playing a card opens an action dialog with a guide per Characteristic (weapon attack, defense, grapple, disarm, run, common magic, artifacts, find weak spot, help, lift up, or any agreed action), **aimed attacks** (two cards of the same suit, halved result), **empower** (burn another Mysticism card and add its roll) and **reactions** (one until your next turn). Mysticism cards are always burned when used. GM-approved exceptions can override every restriction.
- **Out of combat:** each action is a "mini turn": draw twice your hand size and keep drawing extra hands if you want (each takes one more turn); reactions draw only once and fail if the right card is not there.
- **Skills** burn a Mysticism card from your hand (NPCs without a deck use their own die instead).
- **Character creation:** a short wizard to pick one of 5 races (Humanos, Mairu, Mandrágora, Trastolillos, Sierpes), one of 5 base classes and a starting Trinket, which builds a 12-card starting deck.
- **Racial traits:** every race has benefits and drawbacks shown on the sheet. Some are automated: Humans can reroll one roll per rest from chat, Mandrágora tokens get 20 m darkvision, Sierpes get +1 Defense, a once-a-day healing salve and a halved hand size while exposed to the elements.
- **Levelling up:** a confirmed level-up (1 → 2) lets each base class pick one new skill and one pack of extra cards for its deck. Fortis Corpore is fully prepared: its starting trinkets are class charms with automated effects while in play (Sword: use Awareness cards as Physical; Shield: an extra reaction to defend an ally; Dagger: aimed attacks with an Awareness + a Physical card), its level 2 skills roll Mysticism to set their X value, and level 3 picks a specialization: **Custodio**, the guardian, with its own levels 3–6 (+1 characteristic, +1 hand size, the Siempre presente danger sense and a new charm: Last Breath burns itself instead of letting you fall, Martyr halves your allies' damage while doubling yours, Heart of Thorns hits melee attackers back for your Physical; level 4 skills Wall of Will, Dragon Heart and Grudge, plus a new card pack). Mendacium Charisma is fully prepared too: Empathy (draw a card when an ally burns one, once per turn), Eternal Companion (a companion that acts with your cards at half your dice and never reacts; as an Eternal charm it stays in play between scenes and fights, is burned if it would leave play and comes back into play when you rest) and Friendship (bind to an ally: +1 die when you play the same Characteristic as their last action); its level 2 skills (Healing, Promise, Cleansing) use the Mysticism roll as X, with Healing and Promise automated on the targeted token, and level 3 picks Matasanos or Invocador. The class item shows its full choice table.
- **Alta Scentia** is fully prepared as well: Elementalism (choose the element of your actions and of your Elemental Blast), Vision of the Future (always see the top card of your deck and discard it from chat after an Awareness or Mysticism roll) or First-rate Gadget (an Eternal charm bound to a magic item you can swap once per level: the Nosy Monocle privately shows the top card of the targeted creature's deck, plus Cat Boots or Portable Hole). Level 2 skills: Manifest Weapon (weapon categories from the card's die, lasting X turns), Bottled Time (save the Mysticism dice and swap them into later rolls) and Elemental Blast (Fire, Ice or Lightning: a Mysticism attack you can empower with Awareness cards; the GM applies the matching condition with one click). Level 3 picks Mecanicista, Adivinador, Ilusionista or Elementalista. **Ilusionista**, the illusionist, has its own levels 3–6: +1 characteristic, +1 hand size, illusion slots equal to your level (tracked on the sheet, recovered on rest) and a new charm: Imitation (join an ally's action so matching suit and action count as one), Seen and Unseen (undo an action and keep its card on the charm, then swap a later action for one with that card) or Illusory Influence (an Awareness reaction that subtracts your roll from the target's). Level 4 skills: Nightmares (X nightmares dealing 1 psychic damage each, fading at the end of your turn unless you spend a slot), False Step (an X-metre terrain illusion lasting your level in turns) and Kaleidoscope (a prism with 3 reflections for X turns; sacrificing one gives +3 Defense), plus a new card pack.
- **Potens Mystica** is ready too (a card's value is its die size): Eye for an Eye (when you burn a Mysticism card, discard another one and the targeted enemies lose that card's value in health), Spiritual Preservation (once per turn, an Awareness roll that matches the burned card's value shuffles it back into your deck) or Spiritual Barrier (incoming damage burns cards from the top of your deck instead, each one blocking half its value). Level 2 skills: Evil Eye (for X turns the target's Mysticism cards drop one die size; a d4 always rolls 1), Seal Fate (discard a card and the target must act with that Characteristic, or discard its hand and draw a new one) and Flog Essence (X × your Exhaustion × the target's threat level in damage, shown only to the GM). Level 3 picks Brujo.
- **Content editing:** item and card sheets expose every rule behaviour (base race/class or custom, specialization, skill origin and X-value effect, attack/burn flags on action cards, charm effect and Eternal on trinkets), so new content can be built and tuned from inside Foundry.
- **NPCs:** per-Characteristic dice with direct rolls and an optional Boss Deck.
- **GM Panel** (crown button in Token controls): Difficulty, group actions and a party overview.
- **Portraits:** click any sheet image to view it full size; small Edit and Token buttons sit right below it.
- **Responsive windows:** every sheet, panel and dialog fits the screen, reflows when resized and scrolls wherever content can grow; the window menu (⋮) can stretch a sheet to the full screen height. Character sheets have Main, Equipment and Race tabs.
- **Max Health changes:** when a character's max Health goes up or down (base value, Physical, item bonuses, equipping, Exhaustion 3), current Health moves by the same amount (never below 1 or above the maximum).
- **Death at 0 Health:** a token whose Health drops to 0 or below gets the Dead status (and is marked defeated in combat); healing above 0 removes it, unless the death came from Exhaustion 8.

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

Built on the modern v14 API (`TypeDataModel`, `ApplicationV2`, no `template.json` or jQuery).
