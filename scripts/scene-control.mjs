/**
 * The GM-only toggle in the token controls.
 * @module scene-control
 */
import { CONTROL_TOOL, I18N_PREFIX } from "./constants.mjs";
import { FudgeMode } from "./fudge/fudge-mode.mjs";

export class SceneControl {
  /**
   * Register the hooks. Call during the `init` hook.
   */
  static register() {
    Hooks.on("getSceneControlButtons", controls => SceneControl.#addTool(controls));
    Hooks.on("hiddenHandToggled", active => SceneControl.#sync(active));
  }

  /**
   * Add the toggle to the token controls (GMs only; players never see it).
   * @param {Record<string, object>} controls
   */
  static #addTool(controls) {
    if ( !game.user.isGM ) return;
    const tools = controls.tokens?.tools;
    if ( !tools ) return;
    tools[CONTROL_TOOL] = {
      name: CONTROL_TOOL,
      order: Object.keys(tools).length,
      title: `${I18N_PREFIX}.Control.title`,
      icon: "fa-solid fa-hand-sparkles",
      toggle: true,
      active: FudgeMode.holding,
      visible: true,
      onChange: (event, active) => FudgeMode.set(typeof active === "boolean" ? active : undefined)
    };
  }

  /**
   * Reflect a state change made elsewhere (API, macro) in the button.
   * @param {boolean} active
   */
  static #sync(active) {
    if ( !ui.controls?.rendered ) return;
    const tool = ui.controls.controls?.tokens?.tools?.[CONTROL_TOOL];
    if ( tool && (tool.active === active) ) return;
    ui.controls.render({ reset: true });
  }
}
