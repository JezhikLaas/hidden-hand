/**
 * Registration of and typed access to this module's settings.
 * @module settings
 */
import { I18N_PREFIX, LIMITS, MODULE_ID, SETTINGS } from "./constants.mjs";

export class ModuleSettings {
  /**
   * Register all settings. Call during the `init` hook.
   * @param {object} options
   * @param {() => void} options.onChange  Called when a setting that players need to know about changed.
   */
  static register({ onChange }) {
    game.settings.register(MODULE_ID, SETTINGS.INCLUDE_PLAYERS, {
      name: `${I18N_PREFIX}.Settings.includePlayers.name`,
      hint: `${I18N_PREFIX}.Settings.includePlayers.hint`,
      scope: "world",
      config: true,
      type: Boolean,
      default: true,
      onChange
    });

    game.settings.register(MODULE_ID, SETTINGS.PLAYER_TIMEOUT, {
      name: `${I18N_PREFIX}.Settings.playerTimeout.name`,
      hint: `${I18N_PREFIX}.Settings.playerTimeout.hint`,
      scope: "world",
      config: true,
      type: new foundry.data.fields.NumberField({
        required: true,
        nullable: false,
        integer: true,
        min: LIMITS.PLAYER_TIMEOUT_MIN,
        max: LIMITS.PLAYER_TIMEOUT_MAX,
        step: 5,
        initial: LIMITS.PLAYER_TIMEOUT_DEFAULT
      }),
      default: LIMITS.PLAYER_TIMEOUT_DEFAULT
    });
  }

  /** @returns {boolean} Whether the players' rolls are intercepted too. */
  static get includePlayers() {
    return game.settings.get(MODULE_ID, SETTINGS.INCLUDE_PLAYERS);
  }

  /** @returns {number} Seconds a player's roll waits for the GM. */
  static get playerTimeout() {
    return game.settings.get(MODULE_ID, SETTINGS.PLAYER_TIMEOUT);
  }
}
