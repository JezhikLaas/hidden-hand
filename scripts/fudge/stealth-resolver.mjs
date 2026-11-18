/**
 * Roll resolver that lets the GM decide the dice, and the patch that puts it in place while the hidden
 * hand is engaged.
 *
 * Foundry asks `Roll.resolverImplementation` for a resolver at the start of every top-level async
 * evaluation (`Roll#_evaluate`) and awaits its `awaitFulfillment()` before the dice are rolled. Results that
 * a resolver writes into a term are used instead of a random roll; modifiers are evaluated afterwards as
 * usual. Unlike Foundry's own manual fulfillment, this resolver never sets `DiceTerm#method`, so the chat
 * message contains no "manual" marker and no keyboard icon in the dice tooltip.
 * @module fudge/stealth-resolver
 */
import { Logger } from "../logger.mjs";
import { DiceMath } from "./dice-math.mjs";
import { FudgeMode } from "./fudge-mode.mjs";
import { RollDescriber } from "./roll-describer.mjs";

/**
 * Implements the part of the RollResolver interface that `Roll` and `DiceTerm` use. It is not an
 * application: nothing is rendered on the rolling client.
 */
export class StealthResolver {
  /**
   * @param {Roll} roll  The roll being evaluated.
   */
  constructor(roll) {
    this.#roll = roll;
  }

  #roll;

  /** @returns {Roll} The roll being resolved. */
  get roll() {
    return this.#roll;
  }

  /** Terms handled by this resolver (kept for interface compatibility). */
  fulfillable = new Map();

  /**
   * Have the GM decide the dice of the roll and write the results into the terms.
   * Any failure leaves the natural results (or, before they exist, Foundry's normal random roll).
   * @returns {Promise<void>}
   */
  async awaitFulfillment() {
    try {
      const dice = RollDescriber.collectDice(this.#roll.terms);
      if ( !dice.length ) return;
      for ( const term of dice ) {
        term._id ??= foundry.utils.randomID();
        this.fulfillable.set(term._id, { id: term._id, term });
      }
      const request = RollDescriber.describe(this.#roll, dice);
      let answer = null;
      try {
        answer = await FudgeMode.decide(request);
      } catch(err) {
        Logger.error("Deciding the roll failed, using the natural results.", err);
      }
      const values = answer ? DiceMath.sanitize(request, answer) : DiceMath.natural(request);
      RollDescriber.apply(dice, values);
    } catch(err) {
      Logger.error("Hidden hand could not handle the roll; it is rolled normally.", err);
    }
  }

  /**
   * Called by a DiceTerm that appears only during evaluation (e.g. inside parentheses). Such dice are
   * rolled normally.
   * @param {foundry.dice.terms.DiceTerm} term
   * @returns {Promise<void>}
   */
  async addTerm(term) {
    term._id ??= foundry.utils.randomID();
  }

  /**
   * Called for extra results (explode, reroll) if the user configured an interactive fulfillment method.
   * Returning nothing makes the term roll them randomly.
   * @returns {Promise<void>}
   */
  async resolveResult() {}

  /**
   * External dice (Bluetooth etc.) cannot feed this resolver.
   * @returns {boolean}
   */
  registerResult() {
    return false;
  }

  /** Nothing to close. */
  close() {}
}

/**
 * Installs the hidden hand into `Roll.resolverImplementation`.
 */
export class ResolverPatch {
  /** Roll classes already patched. */
  static #patched = new WeakSet();

  /**
   * Patch `foundry.dice.Roll` and every registered roll class that defines its own resolver getter.
   * Safe to call more than once (call on `init` and again on `ready`, after systems registered theirs).
   */
  static install() {
    const classes = new Set([foundry.dice.Roll, ...(CONFIG.Dice.rolls ?? [])]);
    for ( const cls of classes ) ResolverPatch.#patch(cls);
  }

  /**
   * @param {typeof Roll} cls
   */
  static #patch(cls) {
    if ( ResolverPatch.#patched.has(cls) ) return;
    const own = Object.getOwnPropertyDescriptor(cls, "resolverImplementation");
    // Classes without an own getter inherit the patched one from their parent.
    if ( !own?.get ) return;
    ResolverPatch.#patched.add(cls);
    Object.defineProperty(cls, "resolverImplementation", {
      configurable: true,
      enumerable: own.enumerable,
      get() {
        if ( FudgeMode.engaged ) return StealthResolver;
        return own.get.call(this);
      }
    });
    Logger.debug(`Patched ${cls.name}.resolverImplementation.`);
  }
}
