# Driving physics: forgiving ground contact

The owner authorizes autonomous investigation and repair of driving physics, especially offroad frustration and abrupt rear/body contact, while retaining real mountain limits. Scope is the existing vehicle/contact model, not a replacement game or world bake.

## Findings and approach

The current 15-program polish suite passes. A fresh 60 Hz Vehicle probe loses 5.3 km/h in one step when Cairn enters a 20-degree slope at 43 km/h; it finishes six seconds at 12.3 km/h. The hull removes horizontal velocity using a 3D contact normal but normally omits the vertical impulse, repeatedly dissipating uphill motion. Downward landing velocity also becomes horizontal braking. Body support already exists and can carry driveable contacts. Offroad drag and road-calibrated launch force leave the utility vehicle little hill-climbing reserve.

Retain ArcadeDynamics and the authored asphalt identities. Separate driveable hull support/scraping from blocking wall contacts. Floor contacts must not turn downward suspension motion into planar impulses; scraping uses bounded, time-based resistance. Walls reject inward horizontal motion without lifting the body. Add explicit surface/grade assistance within slope-scaled traction, including reverse escape. Never add drive while airborne or without slope support. Audit road-edge height/normal agreement separately.

## Acceptance

- All ten cars cross modest slope transitions in both directions without a single-step artificial speed collapse.
- Cairn makes useful progress on an ordinary 20-degree rough hill; low cars can escape ordinary ground without equalling its rough-terrain ability.
- Sustained boosted attempts against 40/50/65-degree faces cannot ratchet upwards. Preserve ramp takeoff and landing.
- Preserve stock asphalt acceleration/braking and authored lateral grip, tuning, breakables, race and road contact regressions.
- Run deterministic current-heightfield diagnostics, record before/after with limitations, verify the running game and build. Synthetic tests and software rendering do not certify subjective fun or real-phone FPS.

## Existing engines

Evaluate Rapier's raycast vehicle/controller and Jolt's ray/shape-cast vehicles against migration costs. A physics solver can replace contact infrastructure but does not supply this game's handling, world support surfaces, recovery, tuning or drift design. Do not introduce an engine into production without evidence that it improves this integration.
