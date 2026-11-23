# Changelog

## 0.1.0 – 2026-11-18

- **Hidden hand**: GM-only toggle in the token controls. While on, every roll waits for the GM, who sees the
  real result (pre-filled) and may change each die before it is used; Enter confirms.
- **No trace in chat**: unlike Foundry's manual dice entry, no `manual` marker and no keyboard icon.
- **Player rolls** can be decided as well (world setting, on by default); the player sees no dialog. Waiting
  time setting (default 120 s), after which the real result is used.
- **Daggerheart support**: Hope/Fear/Advantage/Disadvantage dice are labeled, the duality outcome is
  previewed, and buttons force *With Hope*, *With Fear* or *Critical*.
- Macro API: `toggle()`, `enable()`, `disable()`, `active`, `engaged`.
- Project scaffold: manifest (Foundry v14), CI release workflow, English and German localization, unit tests.
