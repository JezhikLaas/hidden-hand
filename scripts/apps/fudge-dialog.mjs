/**
 * The GM's window to decide the dice of a roll.
 * @module apps/fudge-dialog
 */
import { DUALITY, I18N_PREFIX, MODULE_ID, TEMPLATES } from "../constants.mjs";
import { DiceMath } from "../fudge/dice-math.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Shows the dice of one roll, pre-filled with what they actually rolled. The GM changes what should be
 * different and confirms with Enter (unchanged values = the natural result); closing the window keeps
 * the natural results as well.
 */
export class FudgeDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  /**
   * @param {import("../fudge/dice-math.mjs").FudgeRequest} request
   * @param {object} [options]  Application options.
   */
  constructor(request, options = {}) {
    super(options);
    this.#request = request;
    this.#values = DiceMath.natural(request);
  }

  /**
   * Show the dialog for a request and wait for the GM.
   * @param {import("../fudge/dice-math.mjs").FudgeRequest} request
   * @returns {Promise<number[][]|null>}  The decided values, or null to keep the natural results.
   */
  static prompt(request) {
    const dialog = new FudgeDialog(request);
    return dialog.#open();
  }

  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-{id}`,
    tag: "form",
    classes: [MODULE_ID, `${MODULE_ID}-dialog`],
    window: {
      title: `${I18N_PREFIX}.Dialog.title`,
      icon: "fa-solid fa-hand-sparkles",
      resizable: false
    },
    position: { width: 380, height: "auto" },
    form: {
      handler: FudgeDialog.#onSubmit,
      submitOnChange: false,
      closeOnSubmit: true
    },
    actions: {
      setMin: FudgeDialog.#onSetMin,
      setMax: FudgeDialog.#onSetMax,
      duality: FudgeDialog.#onDuality
    }
  };

  /** @override */
  static PARTS = {
    form: { template: TEMPLATES.DIALOG }
  };

  /** @type {import("../fudge/dice-math.mjs").FudgeRequest} */
  #request;

  /** Current values in the inputs, one array per term. @type {number[][]} */
  #values;

  /** Resolves the promise returned by {@link FudgeDialog.prompt}. */
  #resolve;

  /** Closes the dialog when the player's roll would time out anyway. */
  #deadline;

  /**
   * @returns {Promise<number[][]|null>}
   */
  #open() {
    const promise = new Promise(resolve => this.#resolve = resolve);
    if ( this.#request.timeout ) {
      this.#deadline = setTimeout(() => this.close(), Math.max(1000, this.#request.timeout - 1000));
    }
    this.render({ force: true });
    return promise;
  }

  /**
   * Resolve the pending promise once.
   * @param {number[][]|null} values
   */
  #finish(values) {
    clearTimeout(this.#deadline);
    this.#resolve?.(values);
    this.#resolve = null;
  }

  /** @inheritDoc */
  get title() {
    const user = game.users.get(this.#request.userId);
    const name = user?.name ?? "?";
    return game.i18n.format(`${I18N_PREFIX}.Dialog.titleUser`, { name });
  }

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const request = this.#request;
    const user = game.users.get(request.userId);
    const kindLabel = kind => game.i18n.localize(`${I18N_PREFIX}.Kinds.${kind}`);
    return Object.assign(context, {
      userName: user?.name ?? "?",
      userColor: user?.color?.css ?? "inherit",
      isSelf: request.userId === game.user.id,
      title: request.title,
      formula: request.formula,
      hasDuality: DiceMath.duality(request, this.#values) !== null,
      terms: request.terms.map((term, i) => ({
        index: i,
        kind: term.kind ?? "",
        label: term.kind ? kindLabel(term.kind) : term.expression,
        expression: term.expression,
        flavor: term.flavor,
        sign: term.sign < 0 ? "−" : "",
        faces: term.faces,
        dice: term.natural.map((natural, j) => ({
          index: j,
          natural,
          value: this.#values[i][j],
          autofocus: (i === 0) && (j === 0)
        }))
      })),
      preview: this.#preview()
    });
  }

  /**
   * Total and duality outcome for the current values.
   * @returns {{total: number|null, totalText: string, duality: string|null, dualityLabel: string,
   *   changed: boolean}}
   */
  #preview() {
    const duality = DiceMath.duality(this.#request, this.#values);
    const total = DiceMath.total(this.#request, this.#values);
    return {
      total,
      totalText: total === null ? "–" : String(total),
      duality,
      dualityLabel: duality ? game.i18n.localize(`${I18N_PREFIX}.Duality.${duality}`) : "",
      changed: DiceMath.isChanged(this.#request, this.#values)
    };
  }

  /** @inheritDoc */
  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    this.element.addEventListener("input", event => this.#onInput(event));
  }

  /** @inheritDoc */
  async _onRender(context, options) {
    await super._onRender(context, options);
    const first = this.element.querySelector("input[autofocus]");
    first?.focus();
    first?.select();
    this.bringToFront?.();
  }

  /**
   * Keep the values and the preview in sync with the inputs (without re-rendering, so focus stays).
   * @param {Event} event
   */
  #onInput(event) {
    const input = event.target.closest?.("input[data-term]");
    if ( !input ) return;
    this.#readInputs();
    this.#refreshPreview();
  }

  /** Read all inputs into {@link FudgeDialog##values} (sanitized). */
  #readInputs() {
    const raw = this.#request.terms.map(t => t.natural.map(() => NaN));
    for ( const input of this.element.querySelectorAll("input[data-term]") ) {
      raw[Number(input.dataset.term)][Number(input.dataset.die)] = input.valueAsNumber;
    }
    this.#values = DiceMath.sanitize(this.#request, raw);
  }

  /** Write {@link FudgeDialog##values} into the inputs. */
  #writeInputs() {
    for ( const input of this.element.querySelectorAll("input[data-term]") ) {
      input.value = String(this.#values[Number(input.dataset.term)][Number(input.dataset.die)]);
    }
    this.#refreshPreview();
  }

  /** Update the preview line and the "changed" markers. */
  #refreshPreview() {
    const preview = this.#preview();
    const total = this.element.querySelector("[data-preview=total]");
    if ( total ) total.textContent = preview.totalText;
    const duality = this.element.querySelector("[data-preview=duality]");
    if ( duality ) {
      duality.textContent = preview.dualityLabel;
      duality.dataset.outcome = preview.duality ?? "";
    }
    for ( const input of this.element.querySelectorAll("input[data-term]") ) {
      const term = this.#request.terms[Number(input.dataset.term)];
      const natural = term.natural[Number(input.dataset.die)];
      input.classList.toggle("changed", input.valueAsNumber !== natural);
    }
    this.element.classList.toggle("changed", preview.changed);
  }

  /** @inheritDoc */
  async close(options = {}) {
    this.#finish(null);
    return super.close(options);
  }

  /**
   * Form submission (Enter or the confirm button): use the values in the inputs.
   * @this {FudgeDialog}
   */
  static async #onSubmit() {
    this.#readInputs();
    this.#finish(this.#values);
  }

  /**
   * Set every die of a term to 1.
   * @this {FudgeDialog}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static #onSetMin(event, target) {
    this.#readInputs();
    const i = Number(target.dataset.term);
    this.#values[i] = this.#values[i].map(() => 1);
    this.#writeInputs();
  }

  /**
   * Set every die of a term to its highest face.
   * @this {FudgeDialog}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static #onSetMax(event, target) {
    this.#readInputs();
    const i = Number(target.dataset.term);
    const faces = this.#request.terms[i].faces;
    this.#values[i] = this.#values[i].map(() => faces);
    this.#writeInputs();
  }

  /**
   * Daggerheart: force an outcome (with Hope, with Fear, critical) with as little change as possible.
   * @this {FudgeDialog}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static #onDuality(event, target) {
    const outcome = target.dataset.outcome;
    if ( !Object.values(DUALITY).includes(outcome) ) return;
    this.#readInputs();
    this.#values = DiceMath.forceDuality(this.#request, this.#values, outcome);
    this.#writeInputs();
  }
}
