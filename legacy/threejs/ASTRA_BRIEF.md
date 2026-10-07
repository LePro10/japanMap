# Astra — make the plan better

Codex, model **gpt-6-astra** if you can pick it:

```
Read ASTRA_BRIEF.md from "TASK" to the end. Also look at TODO.md, README.md, SPEC.md, ARCHITECTURE.md, screenshots/, and docs/astra-refs/. Do not open PLAN.md, CLAUDE.md, or src/. Write the result to ASTRA_PLAN.md. English.
```

If `CLAUDE.md` is already in your context: it is how *code* gets measured. It does **not** veto this design task. The owner's instructions here win.

---

## TASK

You are GPT-6 Astra. Actually think. Do not summarize the repo. Do not write code. Do not make a schedule. Do not write a mood piece. Do **not** take `TODO.md` and make it twice as long.

**japanMap** is a browser open-world driving game for CrazyGames. Live: https://lepro10.github.io/japanMap/ — open it if you can; screenshots lie.

`TODO.md` is a **wishlist, not a spec.**

**Out of scope (implementation, assume fixed):** ESC/pause wiring, race *bugs* (crooked grid, jump-start, AI statues), pickup clipping, CrazyGames SDK plumbing, cloud-save *wiring*, leftover German strings, KTX2.

**In scope even if TODO called them bugs:** the highway “bridge” (it should not be a bridge — say what sits there instead), ramp *places*, the mountain river vs the pass, rice-water that looks wrong, what the village does to the paddies.

**In scope as design, even though platform is “later”:** what progress is *worth* saving (cars, tunes, money, records, zones); how the new menu/HUD works with a thumb; when an ad would make someone quit vs when they’d *choose* to watch for a reward. You are not integrating the SDK.

Everything else — city, lobby, village, cars, tuning, menu, UI, HUD, stunts, density, easter eggs, sound, economy, zones, F1, photo, analytics, walking, interiors, traffic, breakables, **and the race *fantasy*** (how a race should feel to start, the event list on the *new* roads, dirt/drag if they earn a place) — you **design**.

That means:

- If a wishlist item would annoy a player, feel empty, fight something else, or be Forza-cosplay that dies in a browser tab, **don't rubber-stamp it.** Change it or cut it, say why, write the better version.
- If you notice a hole (first 30 seconds are boring, walking has nowhere to go, 12 cars that all feel the same, city is big but has nothing to *do*, collector has no reason to reopen tomorrow), invent the fix.
- Do **not** cut for “faster to ship.” **Do** change for “a player would hate this.”
- Extra pages that repeat the TODO are a fail. Extra pages that name cars, pin them on this map, and explain a smarter loop are a pass.

Sit in a few CrazyGames players (phone kid, Forza/Drift Hunters teen, crash kid, collector). If one of them would close the tab, the design is wrong — fix the design, don't add another bullet.

Look at our screenshots (village and city already exist — upgrade them). Look at `docs/astra-refs/` for how a street, HUD, garage, race start/countdown, drift score, and village *feel*. Steal logic and vibe. Do **not** copy FH6 art, Festival IP, or real car brands.

`SPEC.md` is German and a bit old. `ARCHITECTURE.md` is where systems already live (arcade drive, drift score, 6 events, walker, nitro). Use them so you don't invent a second map or a second stack. They are not a veto. SPEC says low-poly boxes and light-does-the-look; the city looking generic is *why* we're here — you may push places, streets, and landmarks toward the Forza refs without becoming a 1:1 copy or a licensed Tokyo.

Hard facts (argue them only if a player would hate them, then specify the alternative at the same detail):

- Map 3072×3072 m, X/Z ∈ [−1536, +1536], north = −Z, Three.js, one night-after-rain mood (no day/night cycle unless you can defend it).
- New roads and a bigger city live on **this** heightfield (baked world). Don't draw an F1 track through the tōge hairpins or float a city over the sea.
- City at least **4–6× bigger in area** than the current ~800 m block. That's a lot of land — say exactly which empty land it takes. Keep pass, paddies, coast as *biomes*; the village may eat a piece of paddy if it fits.
- Menu/UI from scratch. Gear+nitro cluster on the HUD (see `Speedmeter.png`). Walking is a real second mode. First join is on foot in the sakura bowl — the first 30 seconds have to get them into the fun.
- 8–12 original cars, realistic *types*, no brands. Paint/wheels/simple body. A few special interiors, not every shop. Say how those models can exist without a manufacturer license (CC0 / original).
- Hidden `og123` (logo click): unlimited turbo on Shift. Secret, not a menu cheat.
- No multiplayer.
- Phone and desktop are the same game; layout can differ.
- Player-facing words: English.

### What “done” means

Write **`ASTRA_PLAN.md`**. An implementer can build from it **without inventing a car, a street, a menu screen, or a mechanic.** If you skip a number or a place, you failed.

- **Every car:** name, class, who it's for, feel (weight, grip, speed), starter vs unlock (in play-sessions), paint/wheels/body.
- **Every place:** where on **this** map (world X/Z, or distance/direction from city / ring / tōge / paddies / harbour / temple / sakura spawn). What you see. What you *do*. What already exists that you're changing.
- **Every mechanic:** trigger, what happens, what they feel, how it differs from today (handbrake drift vs double-space stunt, etc.). Include sound as feel (per-car engine, gear-sync, tune changes the note, drift+surface, collisions) — not DSP code.
- **Every menu/HUD screen:** what's on it, how a thumb and a mouse get there.
- **Events:** the current six may not be enough once the city and F1 exist. List the events that should exist, on which road, why someone would queue them.
- **Progression:** currency name (invent, pick one), prices as sessions, what is saved, why they come back tomorrow.
- **Ads:** placements a 17-year-old would accept vs rage-quit.

When you override the wishlist, say so in the open. Length is for decisions, not padding.
