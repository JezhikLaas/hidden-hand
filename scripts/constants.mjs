/**
 * Central constants for the module. Import from here instead of repeating literals.
 * Pure data only: no Foundry globals, so it can be imported by unit tests.
 * @module constants
 */

/** Module id as declared in module.json. */
export const MODULE_ID = "hidden-hand";

/** Prefix for i18n keys. */
export const I18N_PREFIX = "HIDDEN_HAND";

/** Keys of this module's settings. */
export const SETTINGS = Object.freeze({
  /** World setting: also intercept the players' rolls while the hidden hand is active. */
  INCLUDE_PLAYERS: "includePlayers",
  /** World setting: seconds a player's roll waits for the GM before it falls back to its natural result. */
  PLAYER_TIMEOUT: "playerTimeout"
});

/** Defaults and limits of the settings. */
export const LIMITS = Object.freeze({
  PLAYER_TIMEOUT_DEFAULT: 120,
  PLAYER_TIMEOUT_MIN: 10,
  PLAYER_TIMEOUT_MAX: 600
});

/**
 * Names of the user queries (`CONFIG.queries`). Queries are delivered by the server to exactly one
 * user, so other players never receive them.
 */
export const QUERIES = Object.freeze({
  /** GM → other users: the hidden hand was switched on or off. */
  SET_STATE: `${MODULE_ID}.setState`,
  /** User → GMs (on ready): is the hidden hand active, and which GM holds it? */
  GET_STATE: `${MODULE_ID}.getState`,
  /** User → GM: please decide the dice of this roll. */
  FULFILL: `${MODULE_ID}.fulfill`
});

/** Name of the scene control tool (token controls). */
export const CONTROL_TOOL = MODULE_ID;

/**
 * Special die kinds, recognized by the class name of the dice term. Daggerheart (Foundryborne) uses
 * dedicated `Die` subclasses for its duality and advantage dice.
 */
export const DIE_KINDS = Object.freeze({
  HopeDie: "hope",
  FearDie: "fear",
  AdvantageDie: "advantage",
  DisadvantageDie: "disadvantage"
});

/**
 * Term modifiers that do not change which results count towards the total. Only for terms with these
 * modifiers (or none) does the dialog show a total preview. `h`, `f`, `a`, `d` are Daggerheart's marker
 * modifiers on its own die classes.
 */
export const PREVIEW_SAFE_MODIFIERS = Object.freeze(["h", "f", "a", "d"]);

/** Outcomes of a duality roll (Hope die vs. Fear die). */
export const DUALITY = Object.freeze({
  CRITICAL: "critical",
  HOPE: "hope",
  FEAR: "fear"
});

/** Template paths. */
export const TEMPLATES = Object.freeze({
  DIALOG: `modules/${MODULE_ID}/templates/fudge-dialog.hbs`
});
