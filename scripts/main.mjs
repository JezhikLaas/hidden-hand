/**
 * Entry point. Registers hooks only; all logic lives in dedicated classes.
 * @module main
 */
import { MODULE_ID } from "./constants.mjs";
import { Logger } from "./logger.mjs";
import { ModuleSettings } from "./settings.mjs";
import { SceneControl } from "./scene-control.mjs";
import { FudgeDialog } from "./apps/fudge-dialog.mjs";
import { DiceMath } from "./fudge/dice-math.mjs";
import { FudgeMode } from "./fudge/fudge-mode.mjs";
import { ResolverPatch } from "./fudge/stealth-resolver.mjs";

/**
 * Public API, exposed as `game.modules.get("hidden-hand").api`.
 *
 * @example Toggle from a macro (e.g. bound with Macro Hotkeys Anywhere)
 * ```js
 * game.modules.get("hidden-hand").api.toggle();
 * ```
 */
class HiddenHandApi {
  /** Pure helpers (totals, duality outcome). */
  DiceMath = DiceMath;

  /** @returns {boolean} Whether this GM has the hidden hand switched on. */
  get active() {
    return FudgeMode.holding;
  }

  /** @returns {boolean} Whether rolls made on this client are currently intercepted. */
  get engaged() {
    return FudgeMode.engaged;
  }

  /**
   * Switch the hidden hand on or off (GM only).
   * @returns {Promise<boolean>} The new state.
   */
  toggle() {
    return FudgeMode.set();
  }

  /** @returns {Promise<boolean>} Switch on (GM only). */
  enable() {
    return FudgeMode.set(true);
  }

  /** @returns {Promise<boolean>} Switch off (GM only). */
  disable() {
    return FudgeMode.set(false);
  }
}

Hooks.once("init", () => {
  ModuleSettings.register({ onChange: () => FudgeMode.broadcast() });
  FudgeMode.register({ prompt: request => FudgeDialog.prompt(request) });
  SceneControl.register();
  ResolverPatch.install();
  game.modules.get(MODULE_ID).api = new HiddenHandApi();
  Logger.info("Initialized.");
});

Hooks.once("ready", async () => {
  ResolverPatch.install();
  try {
    await FudgeMode.pull();
  } catch(err) {
    Logger.debug("Could not ask the GM for the current state.", err);
  }
});
