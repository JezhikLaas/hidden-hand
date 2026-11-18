/**
 * State of the hidden hand and its synchronization between the GM and the other users.
 *
 * The state lives only in memory: on the GM's client that switched it on (`holding`) and on the other
 * clients as a copy (`#remote`). It is exchanged with user queries, which the server delivers to exactly
 * one user, so nothing shows up in settings, chat or other players' sockets. A reload of the GM's client
 * switches the hidden hand off.
 * @module fudge/fudge-mode
 */
import { QUERIES } from "../constants.mjs";
import { Logger } from "../logger.mjs";
import { ModuleSettings } from "../settings.mjs";
import { DiceMath } from "./dice-math.mjs";

export class FudgeMode {
  /** Whether this (GM) client has switched the hidden hand on. */
  static #holding = false;

  /** The state as told by a GM: is it active for this client, and which GM decides? */
  static #remote = { active: false, gmId: null };

  /**
   * Opens the GM's dialog for a request. Injected to keep this class free of UI code.
   * @type {(request: import("./dice-math.mjs").FudgeRequest) => Promise<number[][]|null>}
   */
  static #prompt = async () => null;

  /**
   * Register the user queries. Call during the `init` hook.
   * @param {object} options
   * @param {(request: import("./dice-math.mjs").FudgeRequest) => Promise<number[][]|null>} options.prompt
   *   Shows the GM dialog and resolves to the decided values (null = natural results).
   */
  static register({ prompt }) {
    FudgeMode.#prompt = prompt;
    CONFIG.queries[QUERIES.SET_STATE] = FudgeMode.#onSetState;
    CONFIG.queries[QUERIES.GET_STATE] = FudgeMode.#onGetState;
    CONFIG.queries[QUERIES.FULFILL] = FudgeMode.#onFulfill;
  }

  /** @returns {boolean} Whether this GM client has switched the hidden hand on. */
  static get holding() {
    return FudgeMode.#holding;
  }

  /**
   * Whether rolls made on this client are intercepted right now.
   * @returns {boolean}
   */
  static get engaged() {
    if ( FudgeMode.#holding ) return true;
    const { active, gmId } = FudgeMode.#remote;
    return active && !!game.users.get(gmId)?.active;
  }

  /**
   * Switch the hidden hand on or off (GM only). Tells all other connected users.
   * @param {boolean} [active]  New state; toggles if omitted.
   * @returns {Promise<boolean>}  The new state.
   */
  static async set(active = !FudgeMode.#holding) {
    if ( !game.user.isGM ) return FudgeMode.#holding;
    FudgeMode.#holding = !!active;
    Logger.debug(`Hidden hand ${FudgeMode.#holding ? "on" : "off"}.`);
    Hooks.callAll("hiddenHandToggled", FudgeMode.#holding);
    await FudgeMode.broadcast();
    return FudgeMode.#holding;
  }

  /**
   * Send the current state to every other connected user (GM only). Failures are ignored: such a user
   * simply keeps rolling normally.
   * @returns {Promise<void>}
   */
  static async broadcast() {
    if ( !game.user.isGM ) return;
    const users = game.users.filter(u => u.active && !u.isSelf);
    if ( !users.length ) return;
    const results = await CONFIG.User.documentClass.queryMany(users, QUERIES.SET_STATE, FudgeMode.#publicState());
    for ( const [user, result] of results ) {
      if ( result.status === "rejected" ) Logger.debug(`Could not update ${user.name}:`, result.reason);
    }
  }

  /**
   * Ask the active GMs for the current state (called once on `ready`, so a client that connects while the
   * hidden hand is on knows about it).
   * @returns {Promise<void>}
   */
  static async pull() {
    if ( !game.user.hasPermission("QUERY_USER") ) return;
    const gms = game.users.filter(u => u.active && u.isGM && !u.isSelf);
    if ( !gms.length ) return;
    const results = await CONFIG.User.documentClass.queryMany(gms, QUERIES.GET_STATE, {});
    for ( const result of results.values() ) {
      if ( (result.status === "fulfilled") && result.value?.active ) {
        FudgeMode.#remote = { active: true, gmId: result.value.gmId };
        return;
      }
    }
  }

  /**
   * Let the GM decide the dice of a roll made on this client.
   * @param {import("./dice-math.mjs").FudgeRequest} request
   * @returns {Promise<number[][]|null>}  The decided values (unsanitized), or null for the natural results.
   */
  static async decide(request) {
    if ( FudgeMode.#holding ) return FudgeMode.#prompt(request);

    const gm = game.users.get(FudgeMode.#remote.gmId);
    if ( !gm?.active || !game.user.hasPermission("QUERY_USER") ) return null;
    const timeout = ModuleSettings.playerTimeout * 1000;
    request.timeout = timeout;

    let timer;
    const expired = new Promise(resolve => timer = setTimeout(() => resolve(null), timeout + 2000));
    try {
      return await Promise.race([gm.query(QUERIES.FULFILL, request, { timeout: timeout + 1000 }), expired]);
    } catch(err) {
      Logger.debug("No decision from the GM, using the natural results.", err);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /** @returns {{active: boolean, gmId: string}} The state as other users should see it. */
  static #publicState() {
    return { active: FudgeMode.#holding && ModuleSettings.includePlayers, gmId: game.user.id };
  }

  /**
   * Query handler (other users): a GM tells the new state.
   * @param {{active: boolean, gmId: string}} data
   * @returns {boolean}
   */
  static #onSetState({ active, gmId } = {}) {
    if ( !game.users.get(gmId)?.isGM ) return false;
    // A GM switching off only clears the state if that GM is the one holding it.
    if ( !active && FudgeMode.#remote.gmId && (FudgeMode.#remote.gmId !== gmId) ) return true;
    FudgeMode.#remote = { active: !!active, gmId };
    return true;
  }

  /**
   * Query handler (GM): a client asks for the current state.
   * @returns {{active: boolean, gmId: string}|null}
   */
  static #onGetState() {
    if ( !game.user.isGM ) return null;
    return FudgeMode.#publicState();
  }

  /**
   * Query handler (GM): a player asks to decide the dice of a roll.
   * @param {import("./dice-math.mjs").FudgeRequest} request
   * @returns {Promise<number[][]|null>}
   */
  static async #onFulfill(request) {
    if ( !game.user.isGM || !FudgeMode.#holding || !ModuleSettings.includePlayers ) return null;
    if ( !Array.isArray(request?.terms) || !request.terms.length ) return null;
    const values = await FudgeMode.#prompt(request);
    return values ? DiceMath.sanitize(request, values) : null;
  }
}
