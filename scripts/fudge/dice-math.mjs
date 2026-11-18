/**
 * Pure helpers for the fudge requests: sanitizing GM input, totals and the Daggerheart duality
 * outcome. No Foundry globals, so everything here is unit tested.
 * @module fudge/dice-math
 */
import { DUALITY, PREVIEW_SAFE_MODIFIERS } from "../constants.mjs";

/**
 * One dice term of a roll, as sent to the GM.
 * @typedef {object} TermRequest
 * @property {string|null} kind      Special die kind (`hope`, `fear`, `advantage`, `disadvantage`) or null.
 * @property {string} expression     The term's expression, e.g. `1d12` or `2d6`.
 * @property {string} [flavor]       The term's flavor text, if any.
 * @property {number} faces          Number of faces.
 * @property {number} number         Number of dice.
 * @property {number} sign           +1 or -1: how the term counts towards the total.
 * @property {number[]} natural      The results the dice actually rolled (one per die).
 */

/**
 * A roll whose dice the GM is asked to decide.
 * @typedef {object} FudgeRequest
 * @property {string} requestId      Unique id of the request.
 * @property {string} userId         The user who rolls.
 * @property {string} title          Title or flavor of the roll (may be empty).
 * @property {string} formula        The roll formula.
 * @property {TermRequest[]} terms   The dice terms, in formula order.
 * @property {number|null} staticTotal  Sum of the constant parts if the formula is a plain sum, else null.
 */

/**
 * A top-level term of a formula, reduced to what the total preview needs.
 * @typedef {object} FormulaToken
 * @property {"dice"|"operator"|"number"|"other"} type
 * @property {string} [operator]     For operators: the operator (`+`, `-`, `*` …).
 * @property {number} [value]        For numbers: the value.
 * @property {string[]} [modifiers]  For dice: the term modifiers.
 */

export class DiceMath {
  /**
   * Analyze the top-level terms of a formula: the sign of every dice term and the sum of the constant
   * parts. The total can only be previewed when the formula is a plain sum/difference of dice and
   * numbers and no dice term has a modifier that keeps, drops, explodes or rerolls dice.
   * @param {FormulaToken[]} tokens
   * @returns {{signs: number[], staticTotal: number|null}}  `signs` has one entry per dice token.
   */
  static analyzeFormula(tokens) {
    const signs = [];
    let staticTotal = 0;
    let linear = true;
    let sign = 1;
    for ( const token of tokens ) {
      switch ( token.type ) {
        case "operator":
          if ( token.operator === "+" ) sign = 1;
          else if ( token.operator === "-" ) sign = -1;
          else linear = false;
          continue;
        case "dice":
          signs.push(sign);
          if ( !(token.modifiers ?? []).every(m => PREVIEW_SAFE_MODIFIERS.includes(m)) ) linear = false;
          break;
        case "number":
          if ( Number.isFinite(token.value) ) staticTotal += sign * token.value;
          else linear = false;
          break;
        default:
          linear = false;
      }
      sign = 1;
    }
    return { signs, staticTotal: linear ? staticTotal : null };
  }

  /**
   * Turn arbitrary input into valid results for one term: one integer in `[1, faces]` per die.
   * Missing or invalid entries fall back to the natural result.
   * @param {TermRequest} term
   * @param {unknown} values
   * @returns {number[]}
   */
  static sanitizeTerm(term, values) {
    const list = Array.isArray(values) ? values : [];
    return term.natural.map((natural, i) => {
      const value = Number(list[i]);
      if ( !Number.isFinite(value) ) return natural;
      return Math.min(term.faces, Math.max(1, Math.round(value)));
    });
  }

  /**
   * Sanitize the GM's answer for a whole request. Anything unusable yields the natural results.
   * @param {FudgeRequest} request
   * @param {unknown} answer  Expected: one array of numbers per term.
   * @returns {number[][]}
   */
  static sanitize(request, answer) {
    const list = Array.isArray(answer) ? answer : [];
    return request.terms.map((term, i) => DiceMath.sanitizeTerm(term, list[i]));
  }

  /**
   * The natural results of a request (what the dice actually rolled).
   * @param {FudgeRequest} request
   * @returns {number[][]}
   */
  static natural(request) {
    return request.terms.map(term => [...term.natural]);
  }

  /**
   * Whether the given results differ from the natural ones.
   * @param {FudgeRequest} request
   * @param {number[][]} values
   * @returns {boolean}
   */
  static isChanged(request, values) {
    return request.terms.some((term, i) => term.natural.some((n, j) => values[i]?.[j] !== n));
  }

  /**
   * Sum of numbers.
   * @param {number[]} values
   * @returns {number}
   */
  static sum(values) {
    return values.reduce((total, value) => total + value, 0);
  }

  /**
   * Total of the roll with the given results, or null if the formula cannot be previewed.
   * @param {FudgeRequest} request
   * @param {number[][]} values
   * @returns {number|null}
   */
  static total(request, values) {
    if ( request.staticTotal === null || request.staticTotal === undefined ) return null;
    return request.terms.reduce((total, term, i) => {
      return total + (term.sign * DiceMath.sum(values[i] ?? term.natural));
    }, request.staticTotal);
  }

  /**
   * Daggerheart duality outcome: equal Hope and Fear dice are a critical success, otherwise the higher
   * die decides. Null if the roll has no Hope and Fear die.
   * @param {FudgeRequest} request
   * @param {number[][]} values
   * @returns {string|null}  One of {@link DUALITY} or null.
   */
  static duality(request, values) {
    const hope = request.terms.findIndex(t => t.kind === "hope");
    const fear = request.terms.findIndex(t => t.kind === "fear");
    if ( (hope < 0) || (fear < 0) ) return null;
    const h = DiceMath.sum(values[hope] ?? []);
    const f = DiceMath.sum(values[fear] ?? []);
    if ( h === f ) return DUALITY.CRITICAL;
    return h > f ? DUALITY.HOPE : DUALITY.FEAR;
  }

  /**
   * Change the Hope and Fear dice as little as possible so the roll gets the wanted duality outcome.
   * Critical: Fear takes the value of Hope. Hope/Fear: swap the dice if the other one is higher; on a tie
   * raise the wanted die by one (or lower the other one if the wanted die is already at its maximum).
   * Works on single Hope and Fear dice (as Daggerheart rolls them).
   * @param {FudgeRequest} request
   * @param {number[][]} values
   * @param {string} outcome  One of {@link DUALITY}.
   * @returns {number[][]}  New values (the input is not modified); unchanged if there is no duality.
   */
  static forceDuality(request, values, outcome) {
    const result = values.map(v => [...v]);
    const hope = request.terms.findIndex(t => t.kind === "hope");
    const fear = request.terms.findIndex(t => t.kind === "fear");
    if ( (hope < 0) || (fear < 0) || !result[hope]?.length || !result[fear]?.length ) return result;
    if ( outcome === DUALITY.CRITICAL ) {
      result[fear][0] = Math.min(result[hope][0], request.terms[fear].faces);
      return result;
    }
    const [want, other] = outcome === DUALITY.HOPE ? [hope, fear] : [fear, hope];
    const w = result[want][0];
    const o = result[other][0];
    if ( w > o ) return result;
    if ( w < o ) {
      result[want][0] = Math.min(o, request.terms[want].faces);
      result[other][0] = Math.min(w, request.terms[other].faces);
      if ( result[want][0] > result[other][0] ) return result;
    }
    // Tie (or a swap that could not separate the dice because of different face counts).
    if ( result[want][0] < request.terms[want].faces ) result[want][0] += 1;
    else if ( result[other][0] > 1 ) result[other][0] -= 1;
    return result;
  }
}
