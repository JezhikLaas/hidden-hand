import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DiceMath } from "../scripts/fudge/dice-math.mjs";

/** A Daggerheart duality roll: 1d12 (Hope) + 1d12 (Fear) + 1d6 (Advantage) + 2. */
function dualityRequest({ hope = 7, fear = 4, adv = 3, advSign = 1, staticTotal = 2 } = {}) {
  return {
    requestId: "r", userId: "u", title: "", formula: "1d12 + 1d12 + 1d6 + 2", staticTotal,
    terms: [
      { kind: "hope", expression: "1d12", faces: 12, number: 1, sign: 1, natural: [hope] },
      { kind: "fear", expression: "1d12", faces: 12, number: 1, sign: 1, natural: [fear] },
      { kind: advSign > 0 ? "advantage" : "disadvantage", expression: "1d6", faces: 6, number: 1, sign: advSign,
        natural: [adv] }
    ]
  };
}

describe("DiceMath.analyzeFormula", () => {
  it("sums constants and signs dice of a plain sum", () => {
    const r = DiceMath.analyzeFormula([
      { type: "dice", modifiers: ["h"] }, { type: "operator", operator: "+" },
      { type: "dice", modifiers: ["f"] }, { type: "operator", operator: "-" },
      { type: "dice", modifiers: [] }, { type: "operator", operator: "+" },
      { type: "number", value: 3 }, { type: "operator", operator: "-" }, { type: "number", value: 1 }
    ]);
    assert.deepEqual(r, { signs: [1, 1, -1], staticTotal: 2 });
  });

  it("disables the preview for multiplication", () => {
    const r = DiceMath.analyzeFormula([{ type: "dice" }, { type: "operator", operator: "*" }, { type: "number", value: 2 }]);
    assert.equal(r.staticTotal, null);
    assert.deepEqual(r.signs, [1]);
  });

  it("disables the preview for keep/explode modifiers and other terms", () => {
    assert.equal(DiceMath.analyzeFormula([{ type: "dice", modifiers: ["kh"] }]).staticTotal, null);
    assert.equal(DiceMath.analyzeFormula([{ type: "dice", modifiers: ["x"] }]).staticTotal, null);
    assert.equal(DiceMath.analyzeFormula([{ type: "other" }]).staticTotal, null);
  });

  it("handles a leading minus", () => {
    const r = DiceMath.analyzeFormula([{ type: "operator", operator: "-" }, { type: "dice", modifiers: [] }]);
    assert.deepEqual(r, { signs: [-1], staticTotal: 0 });
  });
});

describe("DiceMath.sanitize", () => {
  it("clamps, rounds and fills from the natural results", () => {
    const req = dualityRequest();
    assert.deepEqual(DiceMath.sanitize(req, [[13], ["x"], [2.6]]), [[12], [4], [3]]);
    assert.deepEqual(DiceMath.sanitize(req, [[0], [-5], []]), [[1], [1], [3]]);
  });

  it("falls back to the natural results for garbage", () => {
    const req = dualityRequest();
    assert.deepEqual(DiceMath.sanitize(req, null), [[7], [4], [3]]);
    assert.deepEqual(DiceMath.sanitize(req, "nope"), [[7], [4], [3]]);
  });

  it("keeps the number of dice per term", () => {
    const req = { terms: [{ faces: 6, natural: [1, 2, 3] }] };
    assert.deepEqual(DiceMath.sanitize(req, [[6, 6, 6, 6, 6]]), [[6, 6, 6]]);
  });
});

describe("DiceMath.total / isChanged", () => {
  it("adds and subtracts terms", () => {
    assert.equal(DiceMath.total(dualityRequest(), [[7], [4], [3]]), 16);
    assert.equal(DiceMath.total(dualityRequest({ advSign: -1 }), [[7], [4], [3]]), 10);
  });

  it("returns null without a static total", () => {
    assert.equal(DiceMath.total(dualityRequest({ staticTotal: null }), [[7], [4], [3]]), null);
  });

  it("detects changes", () => {
    const req = dualityRequest();
    assert.equal(DiceMath.isChanged(req, DiceMath.natural(req)), false);
    assert.equal(DiceMath.isChanged(req, [[7], [5], [3]]), true);
  });
});

describe("DiceMath.duality", () => {
  it("reads hope, fear and critical", () => {
    const req = dualityRequest();
    assert.equal(DiceMath.duality(req, [[7], [4], [3]]), "hope");
    assert.equal(DiceMath.duality(req, [[2], [4], [3]]), "fear");
    assert.equal(DiceMath.duality(req, [[5], [5], [3]]), "critical");
  });

  it("is null without duality dice", () => {
    const req = { terms: [{ kind: null, faces: 20, natural: [10] }] };
    assert.equal(DiceMath.duality(req, [[10]]), null);
  });
});

describe("DiceMath.forceDuality", () => {
  const req = dualityRequest();
  const outcome = values => DiceMath.duality(req, values);

  it("critical copies Hope onto Fear", () => {
    assert.deepEqual(DiceMath.forceDuality(req, [[7], [4], [3]], "critical"), [[7], [7], [3]]);
  });

  it("swaps the dice when the other side is higher", () => {
    assert.deepEqual(DiceMath.forceDuality(req, [[7], [4], [3]], "fear"), [[4], [7], [3]]);
    assert.deepEqual(DiceMath.forceDuality(req, [[2], [9], [3]], "hope"), [[9], [2], [3]]);
  });

  it("leaves an already matching roll alone", () => {
    assert.deepEqual(DiceMath.forceDuality(req, [[7], [4], [3]], "hope"), [[7], [4], [3]]);
  });

  it("breaks ties by one", () => {
    assert.deepEqual(DiceMath.forceDuality(req, [[5], [5], [3]], "hope"), [[6], [5], [3]]);
    assert.deepEqual(DiceMath.forceDuality(req, [[12], [12], [3]], "hope"), [[12], [11], [3]]);
    assert.deepEqual(DiceMath.forceDuality(req, [[1], [1], [3]], "fear"), [[1], [2], [3]]);
  });

  it("always reaches the wanted outcome", () => {
    for ( let h = 1; h <= 12; h++ ) {
      for ( let f = 1; f <= 12; f++ ) {
        for ( const wanted of ["hope", "fear", "critical"] ) {
          assert.equal(outcome(DiceMath.forceDuality(req, [[h], [f], [3]], wanted)), wanted, `${h}/${f} → ${wanted}`);
        }
      }
    }
  });

  it("does not modify its input", () => {
    const values = [[7], [4], [3]];
    DiceMath.forceDuality(req, values, "fear");
    assert.deepEqual(values, [[7], [4], [3]]);
  });
});
