# CLAUDE.md – hidden-hand

Notes for Claude (and every other human or AI contributor) working on this module.

## What this module does

Foundry VTT module that lets the **GM secretly decide dice results**. A GM-only toggle in the token
controls switches the "hidden hand" on; from then on every roll – the GM's own and (setting) the players' –
waits until the GM confirmed or changed the dice in a small dialog. Another click and everything rolls
normally again. Players must not be able to notice the intervention.

Replacement for *Alter Core Dice Configuration* (ACDC), which toggles Foundry's core manual fulfillment.
That approach has two problems this module avoids:

- Core manual fulfillment stores `method: "manual"` in every dice term of the chat message and core dice
  tooltips show a keyboard icon – a visible tell.
- It only works for rolls made on the GM's own client.

Requirements (agreed with the maintainer, Nov 2026):

- Scene control button (GM only) to toggle, plus an API for macros. No keybinding.
- Mode stays on until switched off (no one-shot mode).
- Also the players' rolls can be decided by the GM.

## Core architecture decisions

- **Hook point: `Roll.resolverImplementation`** (static getter, `ResolverPatch`). Foundry calls it at the
  start of every top-level async `Roll#_evaluate` and awaits `awaitFulfillment()` before rolling. While the
  hand is engaged the patched getter returns `StealthResolver`, otherwise the original resolver.
  This covers every system (Daggerheart's `DHRoll`/`DualityRoll` use plain `Roll#evaluate`).
- **`StealthResolver` is not an application** and never sets `DiceTerm#method`. It writes results into the
  terms exactly like core's `RollResolver#_fulfillRoll` (`{result, active: true}`); modifiers (keep,
  explode, Daggerheart's hope/fear markers) are evaluated by Foundry afterwards. Result: chat messages are
  byte-identical in structure to normal rolls.
- **Natural results are rolled first** on the rolling client (`term.randomFace()`); the GM dialog is
  pre-filled with them. Every failure path (error, timeout, GM offline, closed dialog) uses them.
- Only `Die` terms with a fixed number of dice are decided (also inside pools/parentheses). Extra dice that
  appear during evaluation (explosions, rerolls, Daggerheart "powerful"/combo dice, chat-card rerolls) are
  rolled normally.
- **State lives only in memory** (`FudgeMode`): `#holding` on the GM client that switched it on, a copy
  (`#remote = {active, gmId}`) on every other client. Exchanged with **user queries** (`CONFIG.queries`,
  `User#query`/`queryMany`), which the server delivers to exactly one user – no settings, no broadcast
  socket. A GM reload switches the hand off. Clients pull the state on `ready`.
- Player rolls: `FudgeMode.decide` queries the holding GM (`hidden-hand.fulfill`) with a
  `FudgeRequest`; the GM's handler shows `FudgeDialog` and returns sanitized values. Timeout =
  setting `playerTimeout`; the GM dialog closes itself 1 s before.
- Daggerheart awareness only via class names (`HopeDie`, `FearDie`, `AdvantageDie`, `DisadvantageDie`,
  `DIE_KINDS`): labels, colors, duality preview and the buttons "With Hope / With Fear / Critical"
  (`DiceMath.forceDuality`, minimal change). No import from the system.
- **Pure logic is separate** (`fudge/dice-math.mjs`) and unit tested.

### Do not

- Do not use core manual fulfillment / `core.diceConfiguration` – it leaves the `method` marker.
- Do not store the state in settings or flags (players could read it) and do not use `game.socket` broadcasts.
- Do not show anything on the player's client.
- Do not use jQuery, `Application` (v1), `FormApplication` or `Dialog` (v1).

## Known tells / limits

- A player's roll takes as long as the GM needs to confirm (Enter confirms the pre-filled natural result).
- A player with dev tools could see the query traffic. Not preventable client-side.
- Rerolls from Daggerheart chat cards and exploding dice are not decided.

## Target platform

- Foundry VTT **v14** (`compatibility.minimum` 14, verified 14.370). Tested design against
  Daggerheart (Foundryborne) 2.12.9. No dependencies.

## Coding conventions

(Same as `macro-hotkeys-anywhere` / `fcb-npc-trackers`.)

- Vanilla JavaScript, native ES modules (`.mjs`), no build step, no dependencies.
- Classes for everything with state or behaviour; private `#fields` / `#methods`; `static` for stateless helpers.
- UI only with **ApplicationV2** + `HandlebarsApplicationMixin`; `actions` for clicks, `form.handler` for forms.
- Namespaced Foundry API only (`foundry.applications.*`, `foundry.utils.*`, `foundry.dice.*`).
- One responsibility per file; filenames `kebab-case.mjs`, classes `PascalCase`.
- All user-facing strings via i18n (`lang/en.json`, `lang/de.json`), keys under `HIDDEN_HAND.*`. Keep both in sync.
- CSS classes prefixed `hidden-hand`; constants live in `scripts/constants.mjs`.
- JSDoc on every public class/method. Code, comments and commits in **English**; discussion with the
  maintainer in German.
- Public API: `game.modules.get("hidden-hand").api`. No other globals.

## Layout

```
module.json                     manifest
package.json                    dev tooling only (npm test)
scripts/
  main.mjs                      entry point: hooks + public API, no logic
  constants.mjs                 module id, settings, query names, die kinds (pure data)
  logger.mjs                    prefixed console logging
  settings.mjs                  ModuleSettings: registration + typed getters
  scene-control.mjs             SceneControl: GM-only toggle in the token controls
  fudge/
    dice-math.mjs               DiceMath: pure sanitize/total/duality logic
    roll-describer.mjs          RollDescriber: find decidable dice, build FudgeRequest, apply results
    fudge-mode.mjs              FudgeMode: state, user queries, decide()
    stealth-resolver.mjs        StealthResolver + ResolverPatch
  apps/
    fudge-dialog.mjs            FudgeDialog: the GM's dialog
lang/ styles/ templates/        en/de, hidden-hand.css, fudge-dialog.hbs
tests/                          node:test unit tests for pure logic
```

### Settings

- `includePlayers` (world, Boolean, default true): also intercept player rolls.
- `playerTimeout` (world, 10–600 s, default 120): wait time for player rolls.

## Testing

- Unit tests: `npm test` (Node ≥ 20). Covers `dice-math.mjs`.
- Integration check (not in the repo): the real v14 dice code (`client/dice/**`, grammar compiled with
  peggy) ran in Node with stubbed globals; 25 scenarios passed: off → core resolver; on → values used,
  no `method` in JSON, no tooltip icon, `fromData` round trip; kh/explode/pools/negative dice/parenthetical;
  Daggerheart-like Hope/Fear/Advantage terms; minimize/`allowInteractive:false`/`evaluateSync` bypass;
  player query success/error/null/timeout; GM offline; state from non-GM refused; `includePlayers` off.
- To verify in a real world: scene control toggle and re-render, dialog look and keyboard flow (focus,
  Enter), `User#query` round trip GM↔player incl. timeout, Daggerheart duality/adversary/damage rolls,
  Dice So Nice showing the decided values, chat card with Hope/Fear result and resource automation.

## Release

- `.github/workflows/release.yaml` (identical to the other modules): tag `vX.Y.Z` → tests, version/URLs
  into `module.json`, GitHub release with `module.json` + `module.zip`. Keep `module.json` URLs empty.
- Update `CHANGELOG.md` with every user-visible change.

## Roadmap

1. ~~Scaffold, resolver, GM dialog, player queries, tests~~
2. Test in a real v14 world (Daggerheart), fix what shows up, release v0.1.0
3. Ideas: limit to selected players; one-shot mode (Shift+click); decide chat-card rerolls.
