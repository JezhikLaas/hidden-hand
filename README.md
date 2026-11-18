# Hidden Hand

A Foundry VTT module that lets the **GM secretly decide dice results** – for the GM's own rolls and, if
wanted, for the players' rolls too.

One click on the hand in the token controls (visible only to GMs) and every roll waits for you: a small
window shows the dice as they actually fell, you change what should be different and press **Enter**.
Another click and everything rolls normally again. The chat message looks exactly like a normal roll – no
"manual" marker, no keyboard icon.

> **Status:** 0.1. Requires Foundry VTT v14. System-agnostic, with extra support for Daggerheart.

## Installation

In Foundry's setup screen: **Add-on Modules → Install Module**, paste the manifest URL
of the latest release into the field at the bottom and click **Install**:

```
https://github.com/JezhikLaas/hidden-hand/releases/latest/download/module.json
```

## AI Info
This module has been developed with the help of Claude.

## Using it

- **Token controls → hand icon** switches the hidden hand on and off. Only GMs see the button.
- While it is on, every roll opens the window on the GM's screen, pre-filled with the real result:
  - **Enter / Apply** uses the values in the fields – unchanged, that is the real result. Closing the window
    also keeps the real result.
  - Arrow buttons set all dice of a term to 1 or to the maximum. Changed fields are highlighted.
  - The total and – in Daggerheart – the outcome (with Hope / with Fear / critical) are previewed.
  - **Daggerheart:** the buttons *With Hope*, *With Fear* and *Critical* adjust Hope and Fear die as little
    as possible.
- **Player rolls** (setting *Also decide the players' rolls*, on by default): the player sees nothing but a
  short delay until you confirm. If you do not decide within the waiting time (default 120 s), the dice keep
  their real result.
- Reloading the GM's browser switches the hidden hand off.

### Macro

```js
game.modules.get("hidden-hand").api.toggle();   // or enable() / disable(); .active tells the state
```

Works well with *Macro Hotkeys Anywhere* to put the toggle on a key.

## What is not decided

Dice that only appear while a roll is evaluated are rolled normally: exploding dice, rerolls (also
Daggerheart's reroll buttons on chat cards) and Daggerheart's "powerful" and combo dice.

## How it stays hidden

Foundry's own manual dice entry marks every die it fills as `manual` in the chat message, and the dice
tooltip shows a keyboard icon. Hidden Hand writes the results into the dice before Foundry rolls them,
without that marker, so the message is indistinguishable from a normal roll. The on/off state is never saved
in settings; it is passed to the other clients with direct user queries.
