/**
 * Reads an unevaluated Roll: finds the dice the GM may decide, rolls their natural results and builds the
 * request that is sent to the GM.
 * @module fudge/roll-describer
 */
import { DIE_KINDS } from "../constants.mjs";
import { DiceMath } from "./dice-math.mjs";

export class RollDescriber {
  /**
   * The dice terms of a roll that the GM may decide: every `Die` (incl. system subclasses such as
   * Daggerheart's Hope/Fear dice) with a fixed number of dice that has not been rolled yet, also inside
   * pools and parentheses. Coins and Fate dice are left alone.
   * @param {foundry.dice.terms.RollTerm[]} terms
   * @returns {foundry.dice.terms.Die[]}
   */
  static collectDice(terms) {
    const dice = [];
    const visit = (list = []) => {
      for ( const term of list ) {
        if ( RollDescriber.#isDecidable(term) ) dice.push(term);
        else if ( (term instanceof foundry.dice.terms.DiceTerm) ) continue;
        else if ( "dice" in term ) visit(term.dice);
      }
    };
    visit(terms);
    return dice;
  }

  /**
   * @param {foundry.dice.terms.RollTerm} term
   * @returns {boolean}
   */
  static #isDecidable(term) {
    if ( !(term instanceof foundry.dice.terms.Die) ) return false;
    const { number, faces } = term;
    return Number.isInteger(number) && (number > 0) && (number <= 100)
      && Number.isInteger(faces) && (faces > 0)
      && !term.results.length;
  }

  /**
   * Special kind of a die (Daggerheart Hope/Fear/Advantage/Disadvantage), by class name along the
   * prototype chain.
   * @param {foundry.dice.terms.Die} term
   * @returns {string|null}
   */
  static kindOf(term) {
    let cls = term.constructor;
    while ( cls && (cls !== foundry.dice.terms.Die) ) {
      if ( Object.hasOwn(DIE_KINDS, cls.name) ) return DIE_KINDS[cls.name];
      cls = Object.getPrototypeOf(cls);
    }
    return null;
  }

  /**
   * Build the request for the GM and roll the natural results of the given dice.
   * @param {Roll} roll
   * @param {foundry.dice.terms.Die[]} dice  From {@link RollDescriber.collectDice}.
   * @returns {import("./dice-math.mjs").FudgeRequest}
   */
  static describe(roll, dice) {
    const { signs, staticTotal } = DiceMath.analyzeFormula(roll.terms.map(t => RollDescriber.#token(t)));
    const topLevelSign = new Map();
    let index = 0;
    for ( const term of roll.terms ) {
      if ( RollDescriber.#token(term).type === "dice" ) topLevelSign.set(term, signs[index++]);
    }

    return {
      requestId: foundry.utils.randomID(),
      userId: game.user.id,
      title: RollDescriber.#title(roll),
      formula: roll.formula,
      staticTotal,
      terms: dice.map(term => ({
        kind: RollDescriber.kindOf(term),
        expression: term.expression,
        flavor: term.flavor || "",
        faces: term.faces,
        number: term.number,
        sign: topLevelSign.get(term) ?? 1,
        natural: Array.from({ length: term.number }, () => term.randomFace())
      }))
    };
  }

  /**
   * Reduce a top-level term to what the total preview needs.
   * @param {foundry.dice.terms.RollTerm} term
   * @returns {import("./dice-math.mjs").FormulaToken}
   */
  static #token(term) {
    const { terms } = foundry.dice;
    if ( term instanceof terms.Die ) return { type: "dice", modifiers: [...term.modifiers] };
    if ( term instanceof terms.OperatorTerm ) return { type: "operator", operator: term.operator };
    if ( term instanceof terms.NumericTerm ) return { type: "number", value: term.number };
    return { type: "other" };
  }

  /**
   * A human readable title for the roll: the system's title/flavor and the actor, if known.
   * @param {Roll} roll
   * @returns {string}
   */
  static #title(roll) {
    const options = roll.options ?? {};
    const text = value => ((typeof value === "string") && value.trim()) ? value.trim() : null;
    let title = text(options.title) ?? text(options.headerTitle) ?? text(options.flavor);
    if ( !title ) {
      try {
        title = text(roll.title);
      } catch {
        title = null;
      }
    }
    const actor = text(options.actor?.name) ?? text(game.user.character?.name);
    return [title, actor].filter(Boolean).join(" · ");
  }

  /**
   * Write results into the dice terms, exactly like Foundry's RollResolver does. The terms then skip
   * their own random roll; modifiers (explode, keep …) are evaluated as usual afterwards.
   * @param {foundry.dice.terms.Die[]} dice
   * @param {number[][]} values  One array of results per term.
   */
  static apply(dice, values) {
    dice.forEach((term, i) => {
      for ( const result of values[i] ) term.results.push({ result, active: true });
    });
  }
}
