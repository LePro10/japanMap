# japanMap — Game Design Plan

**Design decision:** Build a place where a player can leave a warm, walkable car court, make something exciting happen within seconds, and return with a car that feels more like theirs. The city supplies street choices, the pass rewards commitment, the circuit rewards precision, and the countryside rewards curiosity. Buying the fastest car must not make the other three pleasures obsolete.

This is a product and content specification, not a development schedule. Numbers below are design targets unless explicitly identified as observations. Currency and session estimates are balancing assumptions, not measured retention or earnings.

## 1. Evidence, boundaries, and the decisions that matter

Read: `ASTRA_BRIEF.md` from `TASK` onward, `TODO.md`, `README.md`, `SPEC.md`, `ARCHITECTURE.md`, all 15 project screenshots, and all 21 images in `docs/astra-refs/`. `PLAN.md`, `CLAUDE.md`, and `src/` were not opened. No implementation code was inspected or changed.

Additional spatial evidence came from existing data outside the source tree: `assets/props.json`, generated terrain metadata/heightfield/paddy mask/navigation image, generated roads, and the inspection hillshade. These distinguish the actual harbour from a speculative village on the wrong side of the map. The live URL was attempted; no connected browser was available and the web fetch failed. There was no live driving, mobile, sound, or collision evaluation.

The sources disagree in places. The brief's **800 × 800 m city baseline** is the area reference used here, not the much smaller bounding box of the existing city race spline. The local road data reports a **3,502 m pass**, whereas the older SPEC describes 2,616 m and nine hairpins. Preserve the actual baked pass alignment; do not rebuild an old length from prose. All proposed road lengths below are targets for the new alignment, not claims that those roads already exist.

### What the images actually contribute

| Evidence | Observation or useful logic | Design consequence |
|---|---|---|
| Project `01`, `02`, `05`, `09` | The mountain gives almost every journey a direction. The city has an abrupt edge and the surrounding land lacks intermediate places. | Preserve the massif. Build inhabited approaches, distinct urban districts, and a deliberate countryside-to-city transition. |
| Project `03` | Repeated window grids, similar building profiles, little difference between ground floors. | Change street sections, roof silhouettes, storefront depth, and corner destinations before adding more neon. |
| Project `04`, `10`, `11` | Paddy parcels read as dark plates; banks are prominent and reflected highlights can overpower the car. | Show rice rows, shallow water and complete earth banks. Make crossings explicit. |
| Project `06`, `07` | The temple path and harbour already exist. Both need enclosure and inhabited foregrounds. | Keep the harbour as a working port. The beauty-peak village is a new composition on the western paddies, using the farmhouse already there. |
| Project `08`, `12`–`15` | The ocean and vehicle wake exist; several shots make the car read as waterborne. | Keep the coastal spectacle in shallow, readable areas. A road car is not an unlimited ocean vehicle. |
| `Japan_small_streets_and_vibe`, `small_streets2`, `tokyo_City_tour1`–`4`, `crossing` | Narrow streets release into broad junctions; shops, corners and distant towers form a hierarchy. | A connected hierarchy of 5.5 m alleys, 9 m streets and 18 m boulevards, with one unmistakable crossing. |
| `cozy_town`, `japan_town`, `japan_town2`, `cozy_temple_and_houses_in_nature` | Eaves, stone bases, bends, warm interiors and foreground vegetation make small places feel inhabited. | Stillwater Village on the terraces copies this: bent lane, mill house, stepped foundations. Harbour keeps a shorter working lane. |
| `coolField`, `rainy_drive`, `driving_in_water_splash`, `Dirt_race` | Open vistas provide release between enclosed roads; surface changes are a visible action. | Keep the paddies open. Give dirt and shallow water their own short routes and feedback. |
| `Garage`, `Speedmeter`, `cherry_blossom_drift_XP_MAP_CAR` | The car is the hero; gear, speed and scoring have different visual priorities. | Full-size car preview; one gear/RPM/nitro cluster; one temporary score line. |
| `start_race_menu`, `cinematic_start_cooldown`, `drag_race_start` | Preparation, opponents and the start signal sell the event before the first corner. | A useful event card and a short, audible start ritual, with the road visible before control begins. |

Borrow composition and interaction logic. Do not use reference screenshots as game textures, copy their interface skin, reproduce Festival branding, or make recognisable branded cars with their badges removed.

### Explicit wishlist changes

| Wishlist | Decision and player reason |
|---|---|
| Make the city 4–6 times larger | Choose **2.60 km² of serviced urban area, 4.06× the brief's 0.64 km² baseline**. Six times would consume the countryside that makes leaving the city worthwhile. This is a genuine eastern expansion, not a larger label around the old blocks. |
| Put the fishing village in the paddies | **Owner lock: yes.** The beauty peak is **Stillwater Village** on the western terraces, not a rename of the east harbour. Ocean boats stay at Tideglass Harbour. The village is a river/canal settlement: mill wheel into a house, leat and pond at terrace height, a few river boats, farmland, animals. Same water system as the western river — not a second sea. |
| Break almost every small building | Break roadside furniture and designated sheds, with visible pieces. Occupied homes, usable interiors, retaining walls and race barriers remain standing. Otherwise every interesting street becomes a vacant demolition lot after one visit. |
| Launch pedestrians at full speed | Keep light, comic knockback and clear avoidance. No human-hit score, body collection or prolonged ragdoll spectacle. The satisfying destruction challenge uses objects designed for it. |
| Double Space enables unrestricted stunts | Keep double Space as an optional shortcut, but make Stunt mode explicit and accessible to one thumb. Spins require speed or a launch, and a landing has a readable success condition. |
| Exponentially slower ×5 across a long grind | Keep ×5 and an exponential **within-chain** climb. Do not require hours of play to make today's drift feel good. Losing a long-session multiplier to a kerb would drive players away. |
| Grind longer for every purchase | Give a first paid vehicle in roughly 1–2 sessions; make special cars and complete collections long goals. Useful initial tuning is affordable and never required to repair a deliberately bad starter. |
| Enter shops that have no function | Seven interiors, each with an interaction, a visual payoff and a direct exit. No repeated empty rooms or hunger/shopping chores. The seventh is the mill house at Stillwater Village. |
| Fill every empty part of the map | Put meaningful choices on travel routes; preserve quiet sightlines and the paddy panorama. More roadside clutter is not more play. |
| F1 track with tunnels or bridges | Build an original **Needle Circuit**, with an open-wheel car and a 900 m straight. Reroute the southwest ring arc around it at ground level. No licensed F1 presentation, no tunnel pretending a heightfield has an interior. |
| Screenshot every new record and pay each improvement | Save one card per meaningful record, replace it when improved, and pay fixed milestones once. Tiny repeated improvements must not generate storage clutter or infinite money. |

ESC/pause implementation, existing race bugs, pickup clipping, SDK integration, cloud-save plumbing, legacy language cleanup and KTX2 are assumed separately resolved. The player-facing pause flow, race fantasy, saved content, language of new content and ad choices are specified here. No multiplayer or day/night cycle is added.

## 2. A first visit that reaches play

### Sakura Commons: the first thirty seconds

Use **S**, the existing sakura bowl's on-foot spawn anchor. S is a reference to the current placement, not a newly invented world coordinate. All offsets here are metres in world X/Z; negative Z is north. Reserve a 180 m radius around S from city generation, ordinary traffic and circuit placement.

The player starts at S, looking toward their **Kite S**, parked 4 m north with its driver's side visible. Behind it, two low timber buildings frame the mountain: **Petal Motors** at S + (−38, −22), and **Open Bay** tuning at S + (38, −22). Warm work lights illuminate real wheel arches and wet paint. Six people are visible around the court: mechanic, two browsers, a person with an umbrella and two seated visitors. The 24 nearest sakura trees form irregular clumps around the existing bowl, leaving a clear route out. Further trees use the normal vegetation distance treatment.

| Time after control is available | What happens | What the player does |
|---|---|---|
| 0–3 s | Already on foot. A single prompt says **“Your car. Take it out.”** Engine idles softly; petals cross the foreground. | Move toward the car or tap **Enter car**. The first prompt can reach the car from spawn, avoiding a compulsory walking lesson. |
| 3–7 s | F / Enter car performs a 0.45 s entry transition and puts the player in chase view. No dealership, name entry or tuning modal. | Accelerate. On phone, auto-throttle is on and the left thumb steers. |
| 7–18 s | Five small Spark markers trace a broad right curve inside the bowl. A 45–60 km/h bend invites one handbrake tap; touching a cone does not fail the introduction. | Make a first slide, or simply drive through. **“Nice start +100 Sparks”** appears once for reaching the last marker. |
| 18–30 s | The exit reveals the larger landscape. A sign offers **City / Pass / Circuit**, and a contextual card offers **“Sakura Starter · about 1 minute”**. | Start the optional sprint, turn toward a visible landmark, or reverse back into the court. |

The five markers are at S + (16, −26), (48, −20), (65, 15), (45, 55), (0, 75). Their route is 10 m wide, with at least 18 m of forgiving grass outside the bend. Connect the last marker to the nearest existing ring-road point by a 9 m lane; use the bowl's existing exit corridor and a normal junction. Shops and pedestrians occupy the northern court, separate from this southeastern loop.

The first completion of Sakura Starter gives 500 Sparks total and ownership of the **Pip 650**; later completions pay 200. Skipping it forfeits nothing permanently: the card remains in Play. The intro route plus first event therefore pay 600 Sparks, enough for a visible brake upgrade; the Commons discovery adds another 200. The player can save all of it. There is no forced purchase tutorial.

### Returning is different

Continue restores the last safe parked position, selected car and on-foot/driving mode. The initial walking scene does not repeat. If a saved position has become invalid after a world update, return to S with the chosen car parked beside the player. The Play screen leads with **Continue**, the player's pinned purchase, and one unfinished activity. No daily popup blocks the world.

Four visits must all make sense:

- **Phone player:** enters with one tap, uses auto-throttle, gets a first reward without mastering a chord of buttons, and can find their car after walking away.
- **Drift/racing teen:** immediately feels a controllable rear-driven starter, sees a difficult pass, and can test a more demanding car before committing earnings.
- **Crash player:** sees the Breakyard on the map and gets fast, noisy, repeatable impacts without destroying every shop they might later explore.
- **Collector:** has ten distinct garage silhouettes, 24 placed discoveries, permanent photo cards and a visible next purchase. A return session changes their collection, not just a counter.

## 3. One map, with enough land for the proposal

### Coordinate and area contract

World bounds remain **X/Z ∈ [−1536, +1536]**, north = −Z, sea level = 0. Heights come from the current baked world and the authored road surface. Coordinates specify design placement; they do not authorise placing a flat slab over a hillside.

Known anchors from the existing data:

| Anchor | X/Z, metres | Treatment |
|---|---|---|
| Existing city race loop | Approximately (620, 120); loop extents X 494–744, Z −13–254 | Retain as a recognisable central road, open its surrounding blocks into the larger city. |
| Existing city entrance | Ring end (878, 214), city end (734, 199) | Replace the raised-looking entrance with East Gate Avenue. |
| Pass foot / end | (−552, −344) / (−600, −1210) | Existing alignment remains the mountain driving spine. |
| Temple hall / approach foot | (820, −954) / (837, −522) | Keep the hall and full sandō; expand the wooded setting. |
| Field path end | (−1140, 128) | Connect to Stillwater Village and the dirt loop. |
| Existing harbour huts | X 706–842, Z 962–1042 | Working ocean port. Upgrade in place. This is not the beauty-peak village. |
| Boat ramp / coast path entrance | (760, 1040) / (533, 710) | Preserve the working waterfront and its connection to the ring. |
| Lighthouse | (−180, 1160) | Retain as a separate destination, roughly a kilometre west of the harbour. |
| Existing western farmhouse | (−1244, 409) | Anchor **Stillwater Village** here — the map's most beautiful place. |

### City land: account for it before drawing buildings

The **Neon Basin** urban envelope is X **−80 to 1490**, Z **−1000 to 960**. Remove the temple corridor X **620–1040**, Z **−1000 to −520**, and the harbour approach X **560–1040**, Z **780–960**. Exclude sea-level land below 5 m and the protected 180 m circle around S.

A read-only 10 m grid sample of the present heightfield found **2.7104 km² above 5 m** within that envelope after the rectangular exclusions. Even subtracting an entire 180 m spawn circle leaves about **2.6086 km²**. This establishes a plausible **2.60 km² urban-area target**. It is coarse land accounting, not proof of road gradients or buildable foundations. The inspected heights reach 242.7 m in the northern envelope: those are hillside neighbourhoods, not extensions of the existing flat city slab.

The new land is specifically the sparse **eastern fringe**, the **southern inland approaches north of the harbour**, the **central land immediately west of the current city**, and the **northern slopes on either side of the temple reserve**. No city takeover of the principal paddies, no new island, and no circuit counted as city area. Stillwater Village takes a declared terrace pocket (below), not the whole biome.

Count connected urban blocks, their streets and small neighbourhood parks toward 2.60 km²; exclude the temple forest, spawn reserve, harbour, sea, and empty perimeter buffer. Parks/courts may occupy at most 18% of the counted urban area. A disconnected road through forest does not count. The design deliberately takes the lower end of the requested 4–6× range because the larger end would erase the map's contrast.

The northern streets follow contour benches with individually stepped plots. Main-road gradients target ≤8%, local hill streets ≤12%, with pedestrian stairs where appropriate. Visible retaining walls finish every cut. Do not flatten the eastern half of the map to one Y value. At implementation review, reject a layout that achieves the area number only by hidden foundations, unusable slopes or counting undeveloped land.

### Eight regions, with no unassigned point

Regions are discovery/navigation areas, not terrain material masks. Apply the following priority order; first match owns the point. Bounds include their lower edge and exclude their upper edge, except the outer world boundary, which is included.

| Priority / region | Membership | Map colour / first-visit scene |
|---|---|---|
| 1. **Sakura Commons** | Circle of radius 180 m about S | Rose; open car court under petals. |
| 2. **Needle Works** | X −1160 to −80, Z 540 to 940, excluding Commons | Vermilion; circuit, pit court and Breakyard. |
| 3. **Tideglass Harbour** | X 520 to 1100, Z 780 to 1536 | Sea blue; working ocean port, nets and boats. Not the beauty village. |
| 4. **Neon Basin** | The city envelope and exclusions above, land ≥5 m | Violet; ground-floor lights and stepped neighbourhoods. |
| 5. **Cinder Pass** | Remaining points with X < −80 and Z < −250 | Slate; existing mountain/pass terrain. |
| 6. **Bellwood** | Remaining points with Z < −520 | Cedar green; temple forest and northern/eastern ridges. |
| 7. **Stillwater Terraces** | Remaining points with X < −80 and Z < 620 | Rice gold; paddies and **Stillwater Village**. |
| 8. **Longshore** | Every remaining point, including sea and outer margins | Teal; coastal travel, lighthouse and open horizon. |

Enter a region's land for 1.5 s to discover it; loading, camera flight and a car passing over it in a jump do not count. Show **“Stillwater Terraces explored · 3/8 regions · +200 Sparks”** for 2.5 s without covering the road. Commons is granted after first movement. Discovering all eight adds 800 Sparks and the eight-region wheel decal. Roads and destinations are usable before discovery; no invisible progress walls.

### The city is five neighbourhoods, not five copies of the old block

All neighbourhood extents are clipped to the city envelope and reserves. Apply their rows in this order to avoid overlapping block ownership.

| Neighbourhood | Land / hero location | What changes, what the player sees and does |
|---|---|---|
| **Old Neon** | X 400–1000, Z −180–420; hero crossing (620, 120) | Rework the current city, retaining its central loop. A 42 × 42 m diagonal crossing, rounded corner shop, slatted cinema front and 54 m glass hotel give four distinct corners. Drift the crossing loop, thread Arcade Row, park at the diner. |
| **Hill Steps** | Remaining city north of Z −180 | New terraced neighbourhoods on existing slopes. Two-to-four-storey houses, retaining walls, a 72 m split-fin **Beacon Tower** at (1180, −650), and stairs connecting contour streets. Run Hill Lanterns or walk to the tower's public forecourt. Keep the tower original; no replica Tokyo Tower. |
| **East Lantern** | Remaining city east of X 1000 | New 3–7-storey residential/shop streets, narrow garden strips and a 120 × 80 m **Rain Garden** centred at (1240, 460). Drive a flowing boulevard, take a pocket-park photo, use the garden lane as a race alternate. |
| **South Market** | Remaining city south of Z 420 | Extend toward, but stop short of, the harbour reserve. Warehouses become low food halls and workshops rather than identical towers. **Market Hall** at (470, 660), delivery bays and open awnings. Run Market Switchback and a short pickup delivery. |
| **West Works** | All remaining city land | Workshops and 2–5-storey apartments link the bowl/central land to the old core. **Rotor Court** at (180, 280), a 70 × 55 m meet-up yard with a tyre mural and turning loop. The player has a place to drift, inspect their paint and start a route west. |

Author **64 urban blocks**: 16 in Old Neon, 18 in Hill Steps, 12 in East Lantern, 10 in South Market and 8 in West Works. Roads define their actual polygons; do not lay a second unrelated square grid over them. Approximately 640 building bodies is a composition estimate, not a mesh quota. On principal central streets, enclose 80–90% of the frontage with buildings, arcades, courtyard walls and gates. Hills can retain 35–55% building frontage where stepped walls, planted banks and roof overlap supply the enclosure. Apartment/market bodies have 30–50 m street fronts, subdivided into 8–14 m storefront modules. No blank drivable facade runs longer than 35 m: a door, recessed bay, side lane, planted wall or differently shaped shop interrupts it. Shared opaque kits and baked light provide the density; unique meshes and materials do not.

Use eight original facade families: tiled convenience shop, shuttered workshop, timber restaurant, narrow apartment, brick cinema, glass hotel, plaster hillside house and corrugated market shed. Each has three roof/width variants. Ground floors have 0.5–1.5 m depth, canopy undersides, visible doorway recesses and varied window lighting. Only one in three upper-storey windows is lit. Keep a dark roof band against the sky. The city can read at night without every surface emitting light.

### Named streets and connections

These are route control locations in X/Z, not sampled spline vertices. Join consecutive locations in order, curve corners within the specified road class, and match the baked ground through an authored road profile. Junctions connect at the same height. The existing ring is a through-road, not an inaccessible elevated border.

| Road | Alignment / dimensions | Purpose |
|---|---|---|
| **Crosslight Avenue** | (80,160) → (300,120) → (620,120) → (1120,120) → (1410,240); 18 m asphalt, 3 m footways | Broad east/west urban release and crossing approach. |
| **Lantern Avenue** | (620,−380) → (620,−180) → (620,120) → (650,420) → (470,660) → (440,850); 14 m asphalt | Main north/south spine through core and market. |
| **East Gate Avenue** | Existing (878,214) → (830,220) → (780,210) → (734,199); 12 m asphalt, 2 m shoulders | Replaces the disliked highway bridge. See below. |
| **Glass Loop** | Existing city loop, with junctions opened onto Crosslight/Lantern | Retains the old circuit's location; three wide corners and one 45 m-radius crossing arc. |
| **Arcade Row** | (460,−100) → (490,30) → (470,180) → (540,300); 5.5 m shared lane, widening to 8 m at bends | Slow exploration and a deliberate technical route for small cars. |
| **Cinema Lane** | (300,120) → (310,−100) → (460,−100) → (620,−180); 9 m | Closes a compact race loop through varied facades. |
| **Hotel Walk** | (620,120) → (780,80) → (880,−80) → (620,−180); 8 m | Second return through Old Neon; the last 30 m has a wide paved corner. |
| **Workshop Way** | (80,160) → (180,280) → (340,380) → (650,420); 11 m | Links Rotor Court, central city and the circuit side of the map. |
| **Market Street** | (650,420) → (850,600) → (700,730) → (470,660) → (340,380); 11 m | Market Switchback circuit; two very different braking points. |
| **Rain Garden Drive** | (1120,120) → (1280,280) → (1340,460) → (1160,620) → (850,600); 12 m | Fast, flowing eastern arc around the park. |
| **East Lantern Road** | (1410,240) → (1420,−160) → (1290,−360) → (1100,−420); 11 m | Connects eastern expansion to the hills. |
| **Beacon Road** | (1100,−420) → (1180,−650) → (1330,−840) → (1450,−720); 9 m | Contour climb to the tower and an 18 m-radius turnaround. |
| **Bellwood Edge** | (620,−380) → (480,−500) → (400,−700) → (280,−850) → (160,−960); 9 m | Western hill neighbourhood. Connect to the existing ring at its nearest two encounters. It does not cut through the temple. |
| **Temple Link** | Existing ring at approach foot → existing sandō (837,−522) | Retain the existing route. Last 150 m stays a walking-led temple approach. |
| **Harbour Lane** | (470,660) → existing coast-path entrance (533,710) → (630,830) → (720,950) → (790,1000) → (850,980); 7 m | A deliberate descent from market workshops to the working waterfront. |
| **Mill Lane** | Existing field path end (−1140,128) → (−1180,250) → (−1210,340) → (−1244,409) → (−1180,450) → (−1130,470); 5.5 m, widening to 7 m through the village street | Follows paddy edges into Stillwater Village's bent main lane; no highway across field centres. |
| **Terrace Track** | (−1140,128) → (−1030,180) → (−900,330) → (−680,380) → (−490,210) → existing village-road end (−190,90); 7 m packed dirt | Actual offroad event route across farm margins, with one defined shallow crossing. |
| **Needle Approach** | (180,280) → (100,420) → (−50,520) → (−250,560); 11 m | City-to-circuit drive; gives a visible destination to the new western streets. |

Secondary streets are named by neighbourhood plus a number, **Old Neon 01–08, Hill Steps 01–10, East Lantern 01–06, South Market 01–05, West Works 01–04**. Each is a 9 m two-ended cross-connection between adjacent primary roads, at successive evenly spaced intervals along the longer boundary. Split any resulting block longer than 180 m with a 5.5 m lane named for its parent plus “Mews”. Keep lanes outside protected reserves and provide a physical turnaround at the three hill termini. These rules specify infill connectivity and naming; random dead ends are not allowed.

**The bridge replacement:** East Gate Avenue is a normal descending approach on a **solid earth embankment**, with exposed stone-faced retaining sides, drainage grates and an open, flared ring junction. The existing endpoints differ by about 7.2 m over 145 m, a roughly 5% average descent. Give the road a continuous profile between them, with at least 20 m of transition at each end. There is no deck void, pier, invisible underside or collision volume that hoists the car upward. City sidewalks taper into the shoulders. This is an entrance you drive through, not an obstacle you climb.

### Needle Circuit: exact land, and the road it displaces

Reserve the southwest shelf **X −1120 to −120, Z 620 to 910** for the track; place the pit court at **(−350,585)**, within X −450 to −250, Z 540–620. The river is farther west and the principal paddy body is north. A coarse height sample found about 0.288 of the 0.290 km² track box above 5 m, with elevations about 4–54 m. The track therefore follows a coastal slope; it is not a tabletop at sea level.

The current ring crosses this box. Replace its southwest arc, between the existing road nearest **(−986,458)** and the existing road nearest **(272,856)**, with **Orchard Bypass**:

**(−986,458) → (−1010,510) → (−820,540) → (−550,530) → (−120,500) → (40,650) → (272,856)**.

Use 11 m asphalt, broad planted shoulders, ≥55 m-radius bends and the existing ring's gradient discipline. The 15 m corridor takes only a narrow southern paddy margin; restore obsolete ring surfaces outside the circuit as meadow. Where the pit access meets the bypass, use an ordinary signed T-junction. This preserves a continuous ring and completely separates traffic from racing without stacking roads.

Track direction follows this sequence, counterclockwise on a north-up map. **South Straight** runs east from **(−1060,855) to (−160,855)**: **900 m**, 16 m wide. **Sea Bend** then turns north around (−140,780); **Uphill Esses** go through (−280,690), (−460,720), (−650,665); **Cedar Bend** reaches (−920,665); **West Hairpin** turns through (−1080,720) to the straight. Target lap length **2.05 km**, eight corner control locations including the straight's ends, 12 m ordinary width, minimum inside racing-line radius 35 m. Preserve the full straight between its tangent endpoints when rounding the return bends. The straight follows a smoothed profile through existing land; retain its visible rise toward the east. Concrete kerbs are 4 cm high, with 8 m grass runoff and a soft barrier on ordinary bends. The east end has 70 m of runoff extending to X −80, so a late brake does not immediately hit city buildings.

Place pit entry before West Hairpin, pits at (−350,585), and pit exit into the early uphill section via a separate 7 m lane. The track remains open for free driving; event gates close its two access lanes during timed competition. The 900 m straight supports a 402 m drag plus braking space, high-speed testing, and an acceleration record even if a particular tune cannot reach its displayed theoretical top speed there. Do not falsify speed to promise that every car reaches its limiter.

Circuit asphalt gives **1.50× lateral tyre grip** to every car relative to ordinary wet road, after that car's defaults and tune. Blend it over 25 m at track entrances and across a 2 m shoulder; use physical surface membership, not the region label. Braking traction gets 1.20×, not an unexplained 50% improvement to every vehicle parameter. The circuit sign and event card say **“Prepared surface · extra cornering grip”**. Stunt mode remains available in free practice; timed circuit events use normal driving mode.

### Harbour, paddies, mountain and useful quiet

| Place | Exact placement and change | Sight and action |
|---|---|---|
| **Tideglass Harbour** | Existing nine huts at X 706–842, Z 962–1042 are upgraded, moved at most 25 m each into a continuous bent working lane, and joined by up to six new workshops (not a second town). Keep the existing ramp, boats, two landing structures and net racks. | A real ocean port: nets, boats, salt air. Four working NPCs unload and mend nets. Explore Net House, make the harbour delivery, take a waterfront photo. It is not the map's beauty peak and must not copy Stillwater's timber-town composition. |
| **Net House** | Adapt the waterfront workshop near (784,1006), 12 × 9 m, door on the lane side | Open loft, rope pulley and miniature boat shelf. Walk through to a balcony over the existing boats. The pulley is a discovery puzzle, not an empty room. |
| **Stillwater Village** | Existing farmhouse at (−1244,409) is the mill house. Pocket **X −1340 to −1080, Z 240–520** (~0.10 km²) taken from the western paddy edge; the rest of the terraces stay rice. | **The most beautiful place on the map.** Bent 7 m stone lane (refs: `cozy_town`, `japan_town`). About 22 buildings: mill house with a 3 m wheel *entering the wall* at (−1255,405), 14 homes, two sheds, a drying-net rack over the pond, a 6 × 4 m river-boat slip. Warm windows, overlapping eaves, stepped stone bases. Eight working NPCs: miller, two farmers, two net-menders, a boat handler, two walkers. Two penned goats, four chickens, vegetable patch 28 × 16 m, small orchard strip. This is where players come to walk, photograph and slow-drive. |
| **Village water** | A 1.5–2.5 m leat, ≤0.30 m deep, leaves the existing western river's nearest upstream bank, fills a 22 × 14 m mill pond at (−1240,390), drives the wheel, then returns downstream. Maximum diversion 160 m. Two small river boats moor on the pond, not the ocean. | Same water body as the western river, at terrace elevation. No sea-level harbour in the paddies, no water sheet above the pass. An open timber flume finishes the last drop *into* the mill house. Players can walk the pond edge; cars use the stone lane and a 4 m ford on Mill Lane south of the pond. |
| **Stillwater fields** | Preserve the main paddy mask, except Stillwater Village's ~0.10 km² pocket and the ≤15 m-wide bypass/track-access corridors | Irregular rice rows, narrow earth bunds and one bright footpath, with open views toward the mountain. Use field edges for dirt driving. The terraces remain an agricultural biome; the village sits *in* them, it does not urbanise them. |
| **Shallow Run** | A 28 × 12 m prepared crossing centred at (−900,330), on Terrace Track | 0.12 m of water over a firm bed, visible ramps in/out, bank spectators set back. Any car can splash through; the offroader carries more speed. No deep-water shortcut is needed for an event. |
| **Cinder river** | Keep the western river corridor and mouth shown on the baked navigation map; replace the bad crossing segment near (−1085,−518) with the profile below | A cut channel with opaque rock/earth banks, two short cascades and a stone box culvert beneath the existing pass. The culvert has a 4 m clear width and 1.5 m internal height, with headwalls below the road shoulder. Retain the pass alignment. No collision belongs to the top of a decorative water sheet. |
| **Cinder Lookout** | Existing pass end (−600,−1210), expanded to a 45 × 28 m turning/parking court on its existing end plateau | Six parking bays face the mountain shoulder; one original ridge marker and a tea flask shelf. Start the descent, inspect a personal-best photo, or take a finished approximately 140 m contour footpath to the existing small shrine near (−718,−1161). |
| **Bellwood Temple** | Existing hall (820,−954), sandō and nine torii retained; 80 m planted depth on both sides of the final 150 m | Tall cedars enclose the approach, moss bases meet the terrain and lantern pools guide the eye. Cars park at a 24 × 18 m forecourt 160 m south of the hall. Walk to the bell alcove; the temple precinct itself is not a stunt park. |
| **Longshore Light** | Lighthouse remains (−180,1160); walking/photo viewpoint 15 m north of it; road turnout on the ring nearest (−80,988) | A 3 m-wide coastal footpath joins the turnout to the lighthouse. Coast sound drops behind its lee wall. Find the lamp-pattern puzzle and use the shoreline as a contrast to city crowds. No second lighthouse is invented. |
| **Breakyard** | (−1030,580), 100 × 60 m court north of the circuit, access from Orchard Bypass | Painted demolition sheds, crates, vending shells and breakaway trees stand in three resettable lanes. A car can make a noisy mess in 60 seconds, then immediately try a different vehicle. |

**The mountain crossing is a height problem, not just a thin material.** Read-only comparison of the generated river with pass nodes finds one close crossing cluster near **(−1085,−518)**: river samples are about **Y 116.0–116.7**, while the nearest road node is **Y 86.75**. A decorative bridge over that water would lift the pass by roughly thirty metres and destroy the driving line.

Instead, regrade only the river's roughly 180 m crossing reach, keeping these X/Z and water-level anchors: **(−1068,−594), Y 116.71 → (−1080,−565), Y 98.71 → (−1085,−535), Y 86.71 → (−1085,−518), Y 84.75 → (−1099,−474), Y 77.00 → (−1103,−414), Y 64.91**. The first two drops become **18 m and 12 m rock cascades**, set into an 8–12 m-wide ravine; small connecting pools carry the remaining fall. The final anchor rejoins the current downstream profile. The culvert invert is **Y 84.40**, roof underside **Y 85.90**, beneath the unchanged approximately Y 86.75 road surface. Show the cascades from a safe 12 × 6 m lay-by 25 m uphill of the crossing, not from an invisible collision below a water sheet. Check the full road and river widths after rebaking; any additional contact follows the same below-road channel rule, never a raised road deck invented by the renderer.

Paddy water is **0.08–0.12 m above each parcel's bed**, rather than the current metadata's 0.30 m. Each parcel owns one horizontal level; it ends 0.25 m inside an earth bank whose crest is at least 0.20 m higher. Complete the bank's vertical sides down to the lower neighbouring bed, including oblique viewing angles. Keep a few drained parcels with damp soil to explain the water depth visually. Tyre spray originates at the wheels; side ripples stay below the door sill. The car loses some acceleration, not all mobility. Ocean depth beyond each vehicle's fording limit triggers a two-second **“Too deep · returning to shore”** recovery, not endless seabed driving.

## 4. Ramps belong to activities

Remove the six current generic placements. Install the six specific constructions below. They are optional branches with visible landing areas; no main road has a compulsory launch and no discovery requires a blind leap onto a roof. Geometry and driving surface must describe the same ramp.

| Ramp | Placement / direction | Form and target action |
|---|---|---|
| **Petal Hop** | S + (95,45), launch south, outside the introductory route | 10 m-wide earth rise, 1.0 m high over 14 m; land 8–16 m away on a 30 m grass pad. Learn one straight jump at 55–75 km/h. |
| **Breakyard Table** | (−1030,580), launch east | 12 m wide, 2.2 m rise over 18 m, 16 m filled tabletop gap and broad descending landing. Try a 180 at 70–95 km/h; undershooting is drivable. |
| **Needle Service Bank** | (−800,590), launch west inside a fenced practice spur | 12 m wide, 3 m rise over 24 m, 30 m clear landing apron. A long, controlled jump from 90–120 km/h, separated from circuit traffic. |
| **Terrace Roller** | (−680,380), eastbound off Terrace Track | 9 m wide, 1.4 m rise over 16 m; 22 m firm dirt landing. Offroad suspension has a purpose, without requiring an offroader. |
| **Market Loading Bank** | (390,590), northbound in a marked freight yard | 10 m wide, 1.8 m rise over 16 m; a 24 m ground-level landing lane passes between two warehouse awnings. A city stunt with an obvious visual target, no rooftop teleport. |
| **Harbour Slip** | (700,920), southeast toward a 30 × 18 m inland pad at (724,944) | 8 m wide, 0.9 m high, 12 m approach; land beside stacked nets. It does not launch into occupied boats or the open sea. |

Approach signs show recommended speeds as above. A white landing chevron is visible from the takeoff, never behind the camera. An escape lane passes beside every ramp. Each stunt event uses a clear temporary orange perimeter; a player who wants to drive past can do so.

## 5. Driving, stunts and impacts

Keep the existing arcade driving model, suspension/support logic, nitro, drift scoring and walking mode. Different cars are specifications within that model, not separate physics engines. The changes below define the intended experience, not claims about uninspected implementation.

### Four actions that must feel different

| Action | Trigger | Response and end condition |
|---|---|---|
| **Normal corner** | Steering, without handbrake or Stunt mode | Front responds promptly, rear follows. High-speed steering sensitivity falls progressively above 100 km/h; a single tap cannot turn a 250 km/h GT sideways. Releasing steering settles yaw in 0.35–0.65 s depending on car. No artificial loss of road contact on smooth asphalt. |
| **Handbrake drift** | Space / Drift button, while steering at ≥30 km/h | Immediate handbrake feedback; rear grip blends down over 0.15 s. A short tap initiates, steering and throttle sustain, and countersteer/releasing throttle recover. Intended controllable slip is 15–60°. A held handbrake slows the car rather than granting free acceleration. |
| **Stunt mode** | Q / labelled Stunt toggle; optional two Space presses within 280 ms | A small orange **STUNT** tag appears and a two-note sound confirms. The first Space press still responds immediately. Rear yaw restraint reduces, steering can carry a 180/360 on an open pad, and airborne yaw/pitch control increases. Toggle again to exit, blending back over 0.4 s. It is never secretly activated by normal braking. |
| **Nitro** | Hold Shift / Boost, in a car with charge | Stronger acceleration, a restrained camera pull and a different intake/exhaust layer. Releasing stops consumption. It does not override braking, cliffs or wheel contact. All ten cars use it, including the prototype. |

Ordinary nitro has a **100-unit tank**, consumes **20 units/s**, and refills **4 units/s** after 2 s without boosting. A banked drift adds 8 units, a valid stunt landing adds 12; the tank never exceeds 100. It raises the car's speed ceiling by 10% while active and drive force by 25%. No currency is charged for fuel or nitro. Race starts give all entrants a full tank; difficulty never gives AI a hidden infinite supply.

In Stunt mode, a ground spin needs ≥35 km/h at initiation. A valid **180** ends at 150–210° rotation and at ≥20 km/h, continuing either forward or in controlled reverse. A **360** ends at 330–390° and retains ≥25% of entry speed. Airborne rotation scores only after four-wheel contact settles for 0.25 s, landing within 45° of travel direction and without a major impact for 0.5 s. Award 300 base score for a ground 180, 600 for a ground 360, and 800 for an airborne 360. A held spin in place is not a new stunt. The same trick at the same ramp earns 50% score on the immediate repeat and full score after using another ramp or driving 200 m.

Air input is A/D yaw and W/S pitch on keyboard. On touch, left steering controls yaw; while airborne in Stunt mode, a right-side two-way pad replaces throttle/brake with **Nose up / Nose down**. It occupies the same thumb area, appears before launch when Stunt is armed, and returns to pedals after landing. Normal jumps need no air input. Keep roll auto-level assistance; do not require three-axis flight controls on a phone.

Timed road, drag and circuit events use ordinary driving mode. Drift events allow handbrake drifting but not Stunt mode. Stunt events and free roam allow it. The event card explains this before Start; mode restoration after the event returns to the player's previous free-roam choice. This prevents a hidden physics-mode advantage while keeping the toy accessible.

### Drift score: make a chain readable, not disposable

Valid scoring requires ≥30 km/h, ≥12° slip, forward path movement and wheel contact. Score rate is **100 points/s at 30 km/h and 20°**, scaling linearly with speed to a cap of 2× at 100 km/h and with angle to a cap of 1.5× at 50°. Above 70° slip, score stops; rotating on the spot is not drifting. Alternating direction cleanly adds 150 points, at most once every 2 s.

The multiplier applies to points **as earned**, not retroactively to the whole chain. Accumulated valid drift time in the current chain unlocks ×2 at **6 s**, ×3 at **18 s**, ×4 at **42 s**, and ×5 at **90 s**. Time between these steps doubles. The HUD shows the next step's progress; it never implies that ×5 is one short tap away.

Allow a 3 s linking gap. After 3 s without a scoring action, bank the score automatically. A major collision immediately banks 50% of the pending score and ends the chain; it cannot confiscate previously banked currency. Minor brush contact costing under 10 km/h only cancels the linking grace for 0.5 s. End-of-event banks the remaining valid score. A chain does not persist across reloads or fast travel.

The two existing doubled drift zones become **Sakura Bowl** (the existing bowl's outer drive loop) and **Rotor Court** (70 × 55 m about (180,280)). They give **2× base score within their marked boundaries**, shown as **SPOT BONUS**, separate from the ×1–×5 chain. Currency conversion has the same cap everywhere; driving circles in the hub is not the fastest garage progression. Drift-event star targets use event score, not the free-roam spot bonus.

### Terrain, braking and recovery

All cars can cross ordinary dirt, grass and the prepared shallow crossing. Road cars retain at least 65% of their road drive force on these surfaces below 50 km/h; utility cars retain 85%. Low-speed crawl assistance remains. Terrain still becomes a wall at truly steep slopes: do not let nitro glue a coupe to a cliff. Utility cars gain clearance and suspension travel, not permission to pass through rocks.

Use continuous grip/surface transitions over about 0.25 s. Loose dirt gives a car-specific lateral grip factor of 0.65–0.85, shallow water 0.75, damp grass 0.65. **Cairn** and **Torrent** use the high end on dirt; other cars use 0.65–0.75 as their table identities specify. Braking should shorten a straight-line stop before it increases turn-in. A car recovering from a road crest should regain stable support without a sudden yaw kick.

R / **Recover** returns to the last valid road or activity pad within 1 s, facing travel direction, at zero speed. It is free. In a timed event it adds 3 s, resets the live chain and returns behind the next unpassed checkpoint. In free roam there is no fine, fuel loss or repair bill. Repeated failed terrain movement may offer Recover, but must not teleport a player who is deliberately holding position for a photo.

### Destruction has a material vocabulary

The roadside threshold request becomes a data rule: existing light breakable objects use **0.50× their former break impulse**, ordinary trees **0.75×**, then each class receives the bounds below so an oversized truck and a tiny hatch do not produce identical impacts. Those ratios are proposed changes, not measured current values.

| Object class | Intended head-on break speed in the Kite S | Visible result / sound / collision |
|---|---|---|
| Cones, empty crates, lightweight signboards | 5–10 km/h | 2–4 pieces tumble, sharp plastic/wood tick, ≤3 km/h speed loss. |
| Vending machines, stall fronts, fence panels | 20–30 km/h | 4–8 authored pieces, door flaps or cans scatter, metal thump and glass rattle, 5–12 km/h loss. A vending interaction becomes unavailable until it resets. |
| Ordinary/sakura trees | 35–50 km/h | Trunk breaks visibly, crown falls in the direction of impact, 4–6 pieces plus leaves. First contact resists; falling foliage is not a new wall. Deep wood crack, with a softer leaf wash. |
| Marked farm/Breakyard sheds | 45–65 km/h | 8–12 recognizable roof/wall/frame pieces fall outward. Foundation remains as a low, drive-over outline. Heavy timber sequence rather than an explosion. |
| Homes, interior buildings, tower, temple, rock, retaining wall, race barriers | Solid | A speed/angle-appropriate thud, scrape and short camera impulse. Body panels may show cosmetic scuffs. No health meter and no permanently ruined handling. |

For grazing contact, reduce both damage impulse and impact sound; let a sliding car scrape along a wall rather than stop at every facade seam. At most **12 substantial nearby fragments** retain collision for up to **1.5 s**; other fragments are nonblocking visual animation from birth. Keep at most **48 visible fragments** in total, settling and disappearing within **8 s**. At the cap, emit fewer larger pieces while preserving the destroyed prop state and reward. Restore free-roam props only when at least **120 m away and unseen for 20 s**. Breakyard has a manual **Reset yard** action while stopped; its challenge resets its own props. Do not respawn a house in the player's photograph.

Traffic comprises **six active nearby civilian cars maximum**, within 220 m along connected roads, with the same cap and collision opportunities on desktop and phone. Spend these actors on visible streets and upcoming junctions; parked vehicles supply additional visual density. Use Pip, Skiff, Cairn and Meridian body families in subdued paint. City traffic travels 25–45 km/h, ring traffic 50–70 km/h. Only streets ≥9 m carry traffic; none in the bowl, sandō, circuit or narrow harbour lane. Three race rivals replace civilian traffic on the race corridor. Vehicles yield at junctions and leave enough width to pass. Their effective push resistance is 55% of a same-weight race rival; low-speed gridlock must clear with a nudge. No police, wanted level or traffic-fine system.

Keep **twelve active nearby pedestrians maximum**, at most four within a street crossing area, using the same rules across presets. They notice an approaching car and step away. Contact creates a brief comic tumble capped at 8 m displacement, a cloth/body thump and at most 3 km/h player speed loss. They get up out of the road after 2 s. No gore, human-hit reward or persistent casualty state. Race roads clear pedestrians before the countdown; three physical AI rivals still race and can be shoved off their line. Spectators remain behind the barriers. Distant shop activity uses simple posed figures or infrequent local animation, not another simulated crowd.

## 6. Ten original cars, ten reasons to own one

Classes describe purpose, not a universal hierarchy: **Street, Utility, Sport, Track**. Events compare records by car and installed upgrade tiers; driving assists are recorded separately. A Truck-to-Prototype upgrade ladder would destroy the reason to own a truck.

Numbers are stock performance targets on ordinary wet asphalt, without nitro. Lateral grip is target peak steady cornering acceleration in g, not a claim about literal real-world tyre friction. Weight is part of collision/response identity; tuning does not silently equalise it. All cars have visible suspension/wheel motion, brake lamps, headlamps, a plausible underside and a simple cabin visible through the windows. Special car interiors here means the mesh quality of the cabin, not ten extra walkable spaces.

**Session unit:** ten active minutes earning about **3,000 Sparks**, excluding one-time discovery bonuses and ads. Purchase session counts mean saving for that car from zero, not an unlock timer or a promise of owning the entire fleet by that session. All prices are available from the start; driving skill or ownership of another car is not an additional purchase gate.

| Car / player | Stock mechanical identity | On this map | Access |
|---|---|---|---|
| **Kite S** — Street; first-time driver and budding drifter | Rear-drive, 1,180 kg, 135 kW; 0–100 in 7.2 s, 205 km/h, 0.95 g, 38 m stop from 100; 35° low-speed wheel lock. Light nose, progressive rear slide, predictable recovery. | The bowl and Cinder Pass. A good starter, not a bad car awaiting upgrades. | Owned at first join; the displayed car at S. |
| **Pip 650** — Street; phone player and alley explorer | Front-drive, 820 kg, 70 kW; 10.5 s, 160 km/h, 0.90 g, 39 m stop; 39° lock. Immediate low-speed turn-in, safe lift-off, short handbrake rotation rather than sustained power oversteer. | Arcade Row and village lanes. Its width, 1.50 m, is a practical benefit. | Permanent reward for Sakura Starter, normally first session. |
| **Skiff Mini** — Utility; playful crash driver and delivery fan | Rear-drive cab-over pickup, 1,080 kg, 78 kW; 12.0 s, 150 km/h, 0.78 g, 46 m stop; 38° lock. Short wheelbase, visibly bouncy rear, modest top speed, low-gear pulling force. | Breakyard deliveries and Stillwater Village. Loose dirt grip factor 0.75; 0.24 m clearance, 0.30 m fording. | 3,600 Sparks; 1.2 sessions, usually first paid car in sessions 1–2. |
| **Cairn 4** — Utility; explorer who wants to leave the road | Four-wheel drive, 1,880 kg, 145 kW; 8.8 s, 180 km/h, 0.82 g, 45 m stop; 32° lock. Heavy turn-in, long suspension, climbs without becoming a racing coupe. | Terrace Track and shallow shore. Dirt factor 0.85; 0.32 m clearance, 0.45 m fording. | 9,000; 3 sessions. |
| **Torrent R** — Sport; dirt racer and all-weather corner attacker | All-wheel drive, 1,320 kg, 205 kW; 5.6 s, 225 km/h, 1.06 g, 35 m stop; 33° lock. Punches out of corners; short, catchable dirt slides; faster response than Cairn. | Terrace Rally, Cinder Climb, mixed routes. Dirt factor 0.85; 0.22 m clearance, 0.30 m fording. | 15,000; 5 sessions. |
| **Ribbon R** — Sport; drift specialist | Rear-drive, 1,280 kg, 225 kW; 5.8 s, 235 km/h, 0.98 g, 37 m stop; 43° lock. Long usable drift angle, rear throttle sensitivity, deliberate countersteer. Harder to drive cleanly than Kite. | Rotor Court and long Cinder drift chains. Gives control range, not a passive score multiplier. | 18,000; 6 sessions. |
| **Meridian GT** — Sport; high-speed tourer and highway record chaser | All-wheel drive, 1,660 kg, 285 kW; 4.7 s, 270 km/h, 1.03 g, 36 m stop; 29° lock. Stable and planted at speed, wide turning circle, slower direction changes. | Ring Trial and Longshore Run. Dirt factor 0.70; 0.16 m clearance. | 27,000; 9 sessions. |
| **Morrow 8** — Sport; engine-sound enthusiast and drag/crash player | Rear-drive long-hood coupe, 1,740 kg, 320 kW; 4.9 s, 265 km/h, 0.91 g, 40 m stop; 30° lock. Heavy front, strong low/midrange torque, rear squirm under boost. | South Straight drag and wide city slides. Strong impacts but worse brakes than the GT. | 30,000; 10 sessions. |
| **Ember RS** — Track; precision driver who still wants a road car | Rear-drive mid-engine coupe, 1,240 kg, 320 kW; 3.9 s, 295 km/h, 1.22 g, 31 m stop; 28° lock. Fast yaw response, strong high-speed grip, less forgiving of an abrupt lift mid-corner. | Needle Sprint and East Lantern Sweep. Dirt factor 0.65; 0.12 m clearance, assisted crawling when offroad. | 42,000; 14 sessions. |
| **Needle 01** — Track; open-wheel aspiration | Rear-drive single-seater, 710 kg, 300 kW; 3.3 s, 305 km/h, 1.35 g at low speed rising to 1.65 g above 160 km/h, 27 m stop; 24° lock. The most planted and precise fast car, light in collisions, poor at dirt speed. | Needle Circuit and open-wheel time trials. 0.10 m clearance; an offroad crawl assist prevents a trap without making it an offroader. | 54,000; 18 sessions. Free event loan for Open Seat; ownership is for roaming and tuning it. |

Unless listed otherwise, road cars have 0.16 m clearance, 0.20 m fording depth and 0.70 dirt grip factor. A trial shows these limitations before purchase. Tarmac grip and stability of Ember/Needle must remain clearly above utility cars after any legal tune. Stunt yaw capability is scaled by weight and wheelbase: a Skiff can tumble playfully, but a Meridian never spins with Pip's instant response.

### Model and customization brief for every car

Every exterior is a new design using realistic vehicle proportions. Commission or author original meshes; use CC0 materials and unbranded generic parts where appropriate. A CC0 label on a recognisable real car does not grant brand rights: CC0 expressly leaves trademark and patent rights unaffected. Keep a model provenance record, original design sheets and asset credits. This is an original-asset strategy, not a claim that removing logos clears a replica. [Creative Commons CC0 legal code](https://creativecommons.org/publicdomain/zero/1.0/legalcode.en)

| Car | Original silhouette / factory paint | Wheels and one optional body kit |
|---|---|---|
| Kite S | Low three-door notchback, offset rectangular lamp pair and short rear deck; **Cloud** | Factory 15-inch plain five-spoke; **Split Six** or **Basket Eight**, 16-inch. **Club** kit: small lip, side sill, ducktail. |
| Pip 650 | Tall rounded two-box hatch, upright rear glass and vertical corner lamps; **Jade** | Factory 13-inch steel; **Petal Four** or **Aero Disc**, 14-inch. **Pocket** kit: round fog pods and contrasting bumper insert. |
| Skiff Mini | Narrow forward cab, bevelled square lights, exposed flatbed; **Persimmon** | Factory 13-inch steel; **Work Slot** or **Chunk Five**, 14-inch. **Workday** kit: empty roof rack, bed rails and mudflaps. |
| Cairn 4 | Short two-door utility wagon, split horizontal grille and rear utility panel; **Sand** | Factory 17-inch utility; **Trail Six** or **Work Slot**, 17-inch. **Ridge** kit: unbranded roof basket, skid plate and short flares. |
| Torrent R | Compact five-door hatch, broad rear shoulders and twin small upper grille openings; **Deep Teal** | Factory 17-inch thin multi-spoke; **Rally Disc** or **Split Six**, 18-inch. **Stage** kit: four nose lamps, modest wing and mudflaps. |
| Ribbon R | Long-roof two-door liftback, wide rear glass and segmented blade lamps; **Plum** | Factory 17-inch deep six-spoke; **Dish Five** or **Basket Eight**, 18-inch. **Angle** kit: bolt-on flares, vented hood and medium rear wing. |
| Meridian GT | Long four-seat fastback, arched roof and separated crescent tail lamps; **Navy** | Factory 19-inch turbine; **Aero Disc** or **Split Six**, 19-inch. **Touring** kit: clean splitter, rear diffuser and subtle lip. |
| Morrow 8 | Broad long-hood two-door, short cabin and three rectangular rear lamp segments; **Amber** | Factory 18-inch thick five-spoke; **Dish Five** or **Work Slot**, 19-inch. **Torque** kit: shallow hood scoop and short deck spoiler. |
| Ember RS | Low wedge, short nose, open side buttresses and a central rear cooling slit; **Rose** | Factory 20-inch paired spoke; **Split Six** or **Aero Disc**, 20-inch. **Apex** kit: front canards, vented rear cover and compact wing. |
| Needle 01 | Open wheels, blunt tapered nose, exposed suspension, simple original halo and narrow sidepods; **Silver** | Factory plain 13-inch racing rim; **Aero Cover** or **Race Five**, same diameter. **Sprint** kit: alternate nose/sidepod covers and wing endplates. All are cosmetic, preserving visible collision dimensions. |

The shared paint palette is **Cloud, Ink, Silver, Sand, Jade, Deep Teal, Navy, Plum, Rose, Persimmon, Amber, Ice**. All factory colours are free on their original car. Any additional colour costs **120 Sparks per car** once; applying an owned colour is free. Gloss is standard; satin finish is **300**, pearl **600**, per car. Wheel designs cost **450** each, kit **900** per car. Wheels have **Silver / Graphite / Bronze / White** finishes included. Factory parts can always be restored free. Kits do not secretly add performance; tuning owns the performance changes.

Give Kite, Meridian and Needle a more detailed cabin for hood/cockpit-adjacent photo angles: readable instruments, seats and steering animation. Other cars receive clean silhouettes and materials, not black voids. There is no compulsory cockpit driving camera; chase and hood remain the two gameplay choices.

### Tuning is a set of decisions, not four infinite bars

Each car has stock, Street and Sport tiers in four categories. Tiers are sequential; prices are **incremental**, not the total to reach that tier. Stage II requires Stage I in the same category, not purchase of the whole car's Stage I set.

| Category | Street tier / price | Sport tier / additional price | Player-visible tradeoff |
|---|---|---|---|
| **Engine** | +6% drive force, +2% non-nitro top speed; 900 | Total +12% force, +4% top speed; 2,700 | Stronger rear-wheelspin tendency on Ribbon/Morrow; a little more braking preparation. No change to mass. |
| **Brakes** | −6% straight-line stopping distance; 600 | Total −11%; 1,800 | Firmer initial bite, audible pad hiss; does not increase steering lock or erase the heavier car's inertia. |
| **Steering** | −8% response delay; 600 | Total −15%; 1,800 | Quicker response. High-speed sensitivity limit remains, so steering upgrades do not make the motorway twitchy. |
| **Tyres** | +4% road lateral grip; 900 | Total +8%; 2,700 | Better normal cornering; handbrake still initiates a drift. Loose-surface identity stays car-specific. |

A complete Street package costs **3,000 Sparks, one session**. Sport adds **9,000**, so a full performance build costs **12,000, four sessions**. These changes are modest enough that a fully tuned Cairn remains a heavy utility car. The prepared-track grip factor multiplies the tuned result; it does not replace it.

Three free setups sit on top of owned parts: **Road** (stock balance), **Drift** (rear yaw damping −15%, recoverable steering range +10%, no grip/score gift), and **Dirt** (ride height +20 mm where body clearance allows, high-speed steering response −5%). Needle offers Road and Drift; its Dirt setup is replaced by **Safe Return**, low-speed crawl assistance only. Setups are available immediately, saved per car, and do not require paid respecs. Three clearly labelled choices are sufficient; no differential-angle spreadsheet or manufacturer part catalogue.

Selecting an upgrade previews changed numbers and a 2 s visual close-up of the actual component area. **Hold to compare** restores the current setup while held. **Buy and fit** is a single explicit purchase; selecting a card never spends money. The purchased component slides into view over 0.35 s, the price counts down once, and the car gives a short engine blip for an engine change. Preview sounds and animation can be muted/reduced.

**Test drive** is free for 90 active seconds in the circuit practice area, with every car and selectable stock/Street/Sport preview available. It does not consume or award money, discoveries or records. The player can end immediately. Expiry returns them to the preview with **Buy / Keep browsing**, without a surprise purchase. This is how someone learns why Ribbon and Meridian are different before six or nine sessions of saving.

### Sound is part of the car specification

The current gear, RPM and engine-load state drive both the instrument cluster and the sound. The HUD never invents a gear by looking at speed separately. An automatic upshift targets 92% of redline under full throttle, downshifts below 42% under load, and holds a gear at least 0.5 s to prevent hunting. Gear changes produce a brief load cut and a real pitch drop. Their transient should coincide with the displayed gear change within one 60 Hz simulation step.

| Car | Engine character / gears / redline | What the player hears |
|---|---|---|
| Kite S | Naturally aspirated inline-four / 5 / 7,000 RPM | Dry, eager midrange rasp; soft intake bark on throttle, 140 ms shift cut. |
| Pip 650 | Small turbo three-cylinder / 5 / 6,500 | Uneven little thrum, light compressor chirp, a rising buzz that never becomes a generic siren. |
| Skiff Mini | Small inline-three / 4 / 6,000 | Low mechanical chatter, short gearing and an audible 220 ms pause between shifts. |
| Cairn 4 | Low-rev turbo inline-four / 5 / 5,500 | Broad growl, tyre/gear texture under load, subdued turbo breath. |
| Torrent R | Turbo inline-four / 6 / 7,500 | Fast intake spool, tight exhaust pulses and a short overrun burble; no perpetual gunfire. |
| Ribbon R | Turbo inline-six / 6 / 7,200 | Smooth rising howl, clearly audible boost release when the player lifts mid-drift. |
| Meridian GT | Twin-turbo six / 7 / 6,800 | Insulated low tone, restrained turbine air and a 100 ms clean shift. |
| Morrow 8 | Naturally aspirated V8 / 6 / 6,500 | Uneven low idle, heavy bass pulses and an open upper growl; the torque car should be identifiable without looking. |
| Ember RS | High-rev V6 / 7 / 8,500 | Bright, rapid pulses behind the camera, sharp 90 ms shifts and short intake resonance. |
| Needle 01 | High-rev race V6 / 6 / 10,500 | Thin mechanical urgency, transmission whine and 70 ms shifts; loud relative to its size, with no distorted wall of sound. |

Unspecified road-car shift cuts are 140 ms. Engine Street adds an intake layer and slightly opens the exhaust tone; Sport adds a deeper loaded harmonic and stronger release transient. Pitch still follows RPM, so a tune does not simply transpose the whole engine recording upward. Use original recordings or verified CC0 source recordings and authored layers; do not ship unreviewed generated engine audio because it nominally changes with gears.

Tyre slip combines a high asphalt scrub with surface sound: granular hiss and stones on dirt, low swish plus wheel fans in shallow water, softer tearing on grass. Scale them by actual slip and contact speed. Nitro adds a breath of intake and exhaust pressure, not a science-fiction laser. A clean landing gets one suspension thump, not both a crash alarm and a success bell.

World sound is local: subdued workshop tools in the bowl, transformers and doorway conversation in Old Neon, net/rope/boat creaks at the harbour, waterwheel, irrigation and chickens at Stillwater Village, wind and occasional bird calls on the pass, one long bell decay at the temple. One quiet original instrumental bed is optional, 25% default volume, with 20–40 s gaps between phrases. No continuous rain hiss after the rain has stopped. Environmental sound falls behind engine load, and important event signals duck music by 6 dB for their duration. Separate sliders: **Engine, Tyres & impacts, World, Music, UI**; master mute remains immediate.

## 7. Walking has destinations and fast exits

F / **Exit car** works only below **5 km/h**, with braking engaged. The car parks at zero stored velocity. Re-entry also starts from zero, never resumes an old high-speed vector. This behaviour is a design requirement independent of pause wiring. If neither side has 1.2 m of safe standing room, offer **Move to safe side** and place the character at the closest clear rear/side point within 4 m.

Walk at **3.0 m/s**, run at **5.5 m/s** with Shift / Run toggle, and jump **0.7 m** with Space / Jump. No stamina bar. CTRL / Slide requires speed ≥4 m/s and a slope from 20° downhill to 3° uphill. It lasts **0.85 s**, begins at 6.5 m/s and decelerates; downhill speed caps at 8 m/s. Steering adjusts heading by at most 35° during a slide. Release cancels, collision stops it, and a 0.5 s recovery prevents perpetual slide hopping. The animation is an original crouched skid, not copied animation/IP from another game.

The on-foot HUD always has **Call car**. It places the selected owned car in the closest safe 6 × 3 m slot **3–8 m** from the player, facing a usable exit, with a 0.5 s headlight blink. If none exists, the UI says **“Car waiting at the nearest road · 24 m”** and marks it; never spawn it in a temple staircase, shop, waterwheel or another car. A second button **Go to car** is available after placement, moving the player to the safe door point. Both are free. Calling a different car uses Garage → Owned → **Bring here** and preserves the same placement rule.

### The complete interior list

Only doors with a warm open doorway and a small universal **Enter** icon lead inside. These are actual compact spaces at their exterior location, with no loading-to-a-second-world fiction. Seven interiors; the mill house is the village's one walk-in.

| Interior / entrance | Contents | Interaction and reason to walk |
|---|---|---|
| **Petal Motors**, S + (−38,−22), 24 × 16 m | Three display pads, vehicle turntable, rear collection wall; all ten cars selectable on the pads | Inspect car proportions at human height. F / Use opens Cars on that car. The collection wall shows the player's owned paint/model silhouettes. |
| **Open Bay**, S + (38,−22), 22 × 16 m | One drive-in bay, tool bench, wall tyre rack | Drive in below 10 km/h and stop for 0.5 s, or walk to the bench, to open Tune on the current car. A 30 m loop behind the garage returns to the bowl. |
| **Lantern Diner**, (495,35), 14 × 10 m, off Arcade Row | Counter, four stools, rain-streaked front glass, route-card board | Sit for a low window photo of the parked car; take the city discovery clue. **Drive again** exits directly to the car. No food meter. |
| **Corner Mart**, (644,145), 12 × 9 m, southeast crossing corner | Two aisles, checkout, cold cabinet, vending alcove | A three-button vending puzzle reveals one postcard. Shelves have reusable original package graphics, not licensed snack brands. Nothing needs purchasing with real or game money. |
| **Net House**, (784,1006), 12 × 9 m | Net bench, pulley, narrow loft balcony | Pull the correct marked rope to reveal the harbour discovery; photograph the boats from above. |
| **Bell Alcove**, 8 m east of the existing temple hall door, 8 × 6 m | Bell beam, rope and stamped map panel | Complete the bell pattern and look back along the existing torii path. The inner temple remains closed scenery, not another empty room. |
| **Mill House**, (−1244,409), 14 × 10 m | Wheel shaft in the wall, two millstones, grain chute, window over the pond | Walk in from the lane. The wheel is visible turning through the wall opening. Operate the sluice from the inner lever (same puzzle as ST2). Photograph the pond through the window. **Drive again** exits to the lane. |

Interactions use F on desktop; on phone a 56 px **Use** button appears within 2 m with an exact verb such as **Ring bell**, **Pull rope**, **Sit**, **Open sluice**, or **Browse cars**. Walking away closes the prompt. All seven interiors allow a 1.2 m path and turn-around space for the camera. No locked collectible is hidden behind an apparently usable but inert door.

## 8. Events: a race should feel like an invitation

Keep the current event system and replace/extend its content with the catalogue below. The six current events remain recognisable: Coast Loop, Tōge Descent, Neon Circuit, Tōge Climb, Ring Time Trial and Tōge Drift Run map respectively to **E02–E07**. They are not discarded in favour of a disconnected new racing stack.

### Arrival, preparation, start, finish

An event marker becomes readable from 50 m away. Enter its 12 m radius below 15 km/h to see **“Join [name]”**; F / Join opens its card. Driving through never starts a race accidentally. The card shows route shape, surface split, estimated duration, selected car, three rival names where applicable, difficulty, normal-mode rule, personal best and exact rewards. **Start**, **Change car**, **Tune**, and **Back** are the only main actions. Starting from Map offers **Drive there** or **Travel and start**; the latter puts the player at the same real start pad after the car/event card is accepted.

First start at a venue: a **2 s** low camera move shows the player's car and one nearby rival, followed by **3–2–1–GO** over **3 s**. Return to the chosen chase/hood view at least 1 s before GO. The existing fixed starting behaviour is assumed working. Sell anticipation through three rising short tones, revving engines, brake lights and a brief crowd response. No ten-second logo movie. **Retry** goes straight to the three-second countdown.

Holding throttle during the countdown is allowed as an input preparation; movement begins at GO. A perfect launch is a small optional technique, not a penalty for a child holding the touch accelerator: releasing the launch brake within 0.20 s after GO gives +5% force for 0.5 s. The ordinary auto-throttle launch remains competitive. Drag uses the same visible lights and engine preparation, not a separate timing UI to learn.

Three recurring AI drivers have driving personalities: **Mina** brakes early and exits cleanly; **Joss** uses wide, aggressive entries; **Ren** preserves speed and is vulnerable on tight corners. Names and cars appear on the start card, never a fake list of online users. Match their car purpose and upgrade tier to the event/player. They use the same visible traction and nitro rules, can make a braking error, can be pushed sideways, and recover without teleporting. No hidden top-speed boost after the player takes the lead.

Difficulty is **Cruise / Club / Expert**, selected on the event card and remembered. Cruise uses roughly 12% lower corner entry targets and less frequent boost; Club uses the target line; Expert uses stronger exits and later but physically valid braking. Completing a race pays the same base at all difficulties. Expert adds 10% to the placement bonus only. Do not automatically change difficulty mid-race or make the starter unwinnable to sell an upgrade.

Sprint HUD: position, checkpoint distance/arrow, elapsed time and progress. Circuit HUD: position, lap X/Y and lap split. A missed gate shows **“Checkpoint missed · follow arrow”** and keeps the route visible; Recover is available with the stated penalty. No new reward toast appears over the next corner during racing. At the finish, coast/brake into a safe turnout, play a 0.8 s finish response, then show the result sheet. **Retry / Next route / Free drive** are equally reachable. “Next route” recommends one geographically connected activity, not a loading trip across the map.

### Complete event catalogue

Lengths and durations are proposed route targets. Tune the route profile and opponent pace to these experiences; do not force times by displaying a false speed. Time trials use the chosen car/setup's target, preserving a stock Pip's reason to participate. Race completion bases and maximum placement/medal bonuses are in Sparks.

| ID / event | Start and exact road sequence | Format, target duration / payout | Why queue it |
|---|---|---|---|
| **E01 Sakura Starter** | Fifth intro marker S + (0,75); bowl exit → nearest ring junction → 300 m along ring in the direction of the city | Solo guided sprint, 45–65 s; first finish pays 500 and Pip, repeats pay 200 | First success without a tutorial exam; skipping remains possible. |
| **E02 Coast Loop** | (470,660), Market Hall turnout; Harbour Outer Road described below, clockwise, two laps | 3 rivals, about 3.1 km / 150–210 s; 650 + up to 200 | Fast market frontage descends into tight harbour bends, then opens inland again. |
| **E03 Cinder Descent** | Existing pass end (−600,−1210), down the full existing pass to (−552,−344) | 3 rivals, current alignment about 3.5 km / 140–220 s; 700 + 200 | Gravity, visible braking decisions and recoverable contact. Retains Tōge Descent. |
| **E04 Neon Circuit** | Existing city loop's start near (671,−13), Glass Loop, three laps | 3 rivals, about 2.6 km / 110–160 s; 550 + 150 | A short familiar loop transformed by new street-level landmarks. |
| **E05 Cinder Climb** | Pass foot (−552,−344), full existing pass uphill | 3 rivals, 160–230 s; 750 + 200 | Throttle discipline and nitro allocation; feels different from descending the same road. |
| **E06 Ring Trial** | Existing ring start near (−796,118), one full clockwise lap including Orchard Bypass | Solo, revised ring about 6 km / 195–330 s depending on car; 850 + 100 | Learn the whole map and compare a GT tune against its own previous time. |
| **E07 Cinder Drift Run** | Cinder Lookout, descend the pass in ordered gates | Solo score, finish within 240 s; 600 + 100/200/300 for bronze/silver/gold at 15k/35k/70k points | The place to sustain the difficult ×5 chain. Banked chains add together for the event. |
| **E08 Crosslight Dash** | Crossing (620,120); Crosslight west → Cinema Lane → Hotel Walk in reverse back to the crossing | 3 rivals, about 1.5 km / 65–95 s; 350 + 100 | A compact browser race; see the broad crossing open after narrow corners. |
| **E09 Hill Lanterns** | Bellwood Edge's turnaround (160,−960), descend Bellwood Edge → Lantern to crossing → Crosslight west → Workshop Way to Rotor Court | 3 rivals, about 2.2 km / 100–150 s; 500 + 150 | Race through the new hillside city rather than just decorating it. |
| **E10 East Lantern Sweep** | (1120,120); Rain Garden Drive → Market Street backwards from (850,600) to (650,420) → Lantern north → Crosslight east | 3 rivals, about 2.1 km / 90–135 s; 450 + 150 | Long loaded corners suit Meridian/Ember; the park is a braking landmark. |
| **E11 Terrace Rally** | Field path end (−1140,128); Terrace Track → existing village road backwards → existing field path west, two laps | 3 rivals, about 4.4 km / 175–235 s; 800 + 200 | Dirt, a shallow splash and a short tarmac return. Torrent and Cairn earn their existence. |
| **E12 South Straight Drag** | (−1030,855) east to (−628,855), 402 m of the circuit straight | One rival, best of three, 10–24 s driving per heat / 35–100 s match; 150 + 50 for match win | Launch, shift sound and choosing when to spend boost. Pay once for the match, not on each eight-second restart. |
| **E13 Needle Sprint** | South Straight start near (−1000,855), full circuit, two laps | 3 rivals, about 4.1 km / 105–160 s; 600 + 200 | Overtaking, the long straight and the prepared surface are the event. |
| **E14 Open Seat** | Same circuit start; one lap in a stock Needle 01, loaned automatically if unowned | Solo, 55–80 s; 300 + 100 | Try the open-wheel aspiration with meaningful driving, without grinding first. No setup advantage allowed in this event. |
| **E15 Petal Style** | Outer sakura loop plus Petal Hop; start S + (65,15) | 90 s score challenge; bronze/silver/gold 6k/12k/20k; 400 + 100/200/300 | Combine easy drift, one ramp and an intentional spin. Normal or Stunt mode, no rivals. |
| **E16 Breakyard Bash** | Breakyard entrance (−1080,560); three demolition lanes and Table ramp | 60 s; 220 + 60/120/180 for 1k/2k/3k score | Weight and impacts have a joyful, repeatable home. See object scoring below. |
| **E17 Market Switchback** | Market Hall (470,660), Market Street clockwise, two laps | 3 rivals, about 2.7 km / 115–165 s; 550 + 150 | Alternating fast corners and narrow loading-yard exits reward a responsive car. |

**Harbour Outer Road**, completing E02's real loop, is **(470,660) → (850,600) → (1090,740) → (1010,900) → (850,980) → (720,950) → (630,830) → (533,710) → (470,660)**. Use 9 m on the new inland arc, narrowing to the existing 7 m Harbour Lane on the waterfront approach. Provide two marked 12 m-wide passing pockets at (1010,900) and (630,830). The working quay remains outside the race line. A Coast Loop is not made by closing an imaginary road over water.

For **Terrace Rally**, retain the existing village-road and field-path alignments, widening their driven surface to **7 m with 1 m firm shoulders** where currently narrower. Place a 12 × 24 m staging/passing pocket at the shared junction (−760,60). These are farm-edge corridors, not rectangular platforms across whole parcels; the paddy-water masks and complete bank faces end at their finished shoulders.

Placement bonuses for three-rival races are **100% / 65% / 35% / 0%** of the listed maximum for first through fourth, rounded to whole Sparks. Score-event medals grant the highest achieved bonus only. For the one-time first-medal bonus, first/second/third in a race count as gold/silver/bronze; fourth still gets the normal completion base. E06/E14 give 100 for beating the benchmark and 50 for within 10%; no medal bonus otherwise. Changing targets is a balance version change, not a silent rewrite of an existing personal best.

Initial **E06 stock benchmark seconds** are Kite **250**, Pip **300**, Skiff **330**, Cairn **290**, Torrent **235**, Ribbon **240**, Meridian **220**, Morrow **225**, Ember **205**, Needle **195**. For Street/Sport Engine multiply the target by **0.99/0.98**; Brakes **0.99/0.98**; Steering **0.995/0.99**; Tyres **0.99/0.98**, applying each owned tier once. Round the final target to 0.1 s. Free setups do not change it. **E14's fixed stock Needle benchmark is 70.0 s**, with the lesser bonus through 77.0 s. These are explicit initial balance values to validate on the authored routes, not times claimed to have been driven. Keep difficulty labels on AI races; solo benchmarks have a single standard, with assists recorded separately.

For Breakyard Bash: cone/crate 20 points, fence/sign 40, vending shell 80, breakaway tree 120, marked shed 200; each object pays once per attempt. Author **30 light objects, 12 fence/sign pieces, 6 vending shells, 6 trees and 4 sheds**, total **3,080 object points**, plus valid stunt score. The goal is choosing an efficient destructive line, not waiting for objects to respawn.

All ordinary events allow every owned car. A suggested car is advice, never a purchase wall. Open Seat supplies its fixed car; drag matches the selected car/tune. A car too wide for the easiest Arcade Row line still has the wider parallel streets in free roam; no event forces a prototype through a 1.5 m gap.

Two short deliveries supplement the catalogue without creating a job simulator:

- **Market to Nets:** stop at Market Hall for 1 s, accept **Deliver crates**, follow Harbour Lane to Net House, stop in its marked 6 × 3 m bay. Target 70–110 s, limit 180 s, 450 Sparks plus 100 for under 100 s. Use Skiff if owned or a free event loan; collisions can cost time but do not delete the load or charge a fine.
- **Mill Run:** accept at Stillwater Village mill court (−1244,409), take Mill Lane → field path → village road to its existing end (−190,90), stop beside the produce shelter 8 m north of the road end. Target 65–100 s, limit 150 s, 400 plus 100 under 90 s. Same loan rule. It supplies a countryside reason to drive the pickup through the paddies.

Leaving either delivery returns to free roam with no payment or penalty. The visible crates are on the truck only during the activity. They do not require an inventory screen.

## 9. Money, collection and reasons to reopen

### One currency: Sparks

**Sparks** use an original split-diamond icon: two offset warm amber facets with a dark notch, readable at 16 px. Never a ¥, dollar, premium gem or energy bar. Physical pickups are the same icon as a small lantern-like token; collecting one pulls three tiny facets toward the wallet over 0.4 s and plays one two-note sound. Batch pickups within 0.3 s into one count-up so a route does not sound like an alarm clock.

The economy is designed around **2,400–3,600 Sparks per ten-minute ordinary session**, with **3,000** as the pricing unit. Four 120–150 s events at roughly 550–750 each produce that range. Free driving can approach it through drift, discoveries and short challenges. A player can buy something visible every session, or save for a mechanically different car.

| Source | Exact payment and limits |
|---|---|
| Race/challenge/delivery | Catalogue amounts; full completion base even when last. No entry fees. Abandoning does not pay the completion base. |
| Free-roam drift/stunt bank | 1 Spark per 100 banked score, rounded down; retain fractional remainder for the next bank. Maximum **400 Sparks in a rolling 90 active seconds**. Score/records continue above the currency cap; the wallet line simply stops increasing. |
| First region | 200 each; all eight adds 800. Total regional income **2,400**. |
| Discovery card | 100 each for 24 cards; puzzle cards additionally give a named cosmetic, not another currency. |
| First bronze-or-better in each E02–E17 | 150 once per event, separate from normal repeat rewards. E01 uses its own introductory reward. |
| Meaningful personal milestone | 100 once at each threshold below. Regular personal best improvements save a new card but do not always pay. |
| Road Card | 600 for a completed three-part card; one newly issued card per day, with an archive rather than a disappearing deadline. |

During an event, its completion/medal payments replace the free-roam score conversion; no double currency payout. Displays can still celebrate drift points during a race. Discovery and region popups are deferred until the result, and their one-time flags prevent re-awarding on Retry. Test drives, event loans in free trial, photo flight and secret practice do not generate economic progress. The specified free Open Seat and delivery events do pay their event rewards.

**Milestone thresholds, each once per save:** road speed **160 / 220 / 280 km/h**, valid jump airtime **1 / 2 / 3 s**, valid jump distance **15 / 35 / 60 m**, banked chain **5k / 20k / 60k**, cumulative driving distance **10 / 30 / 100 km**. Total milestone currency is **1,500**. Jump records need the valid landing rule; falling off the map does not win an airtime prize. Speed milestones require ordinary non-secret driving on a traversable surface for 0.5 s. Cosmetic kit ownership does not affect records.

The eight paid stock cars total **198,600 Sparks**, about **66 saving sessions / 11 active hours** at the pricing unit. That is a collection goal, not the threshold before the game becomes fun. Owning every Sport upgrade on all ten cars adds 120,000, roughly 40 sessions; nobody needs to do this to access a road or complete a basic event. Early discoveries accelerate the first purchase, while long-term prices stay understandable.

The garage's pinned target says **“Cairn 4 · 6,400 / 9,000 Sparks”** and **“About one more good session”**, with the estimate based on the player's recent actual rate. If a player earns below 1,800 per ten active minutes across three visits, surface easy nearby activities and offer Cruise difficulty; do not inflate rewards secretly, change store prices per user or push ads as the solution.

### Replace ninety anonymous pickups with twenty-four discoveries

Keep the moment of collecting, cut the repetitive count. **Three discovery cards per region**, each at a named place, are worth more than ninety identical floating objects. Two in each region are straightforward visual finds; one is a small interaction. No car, performance upgrade or whole region depends on finding them all.

On first opening a clue, show a postcard crop of the actual place, a one-sentence hint and a broad **80 m search circle**. **Show route** points to the nearby road, not through a mountain. After two minutes of searching, **Narrow clue** gives a 20 m circle free. On touch, Use actions have the same generous timing as keyboard, and symbols accompany colours/sounds.

| ID / region | Exact card placement or anchor | Trigger / puzzle answer / payoff |
|---|---|---|
| SC1 Commons | Founder plaque, S + (−12,−10) | Walk within 2 m and Inspect. Introductory collection card. |
| SC2 Commons | Open Bay exterior light board, S + (32,−18) | Hint: **“Read the tyre stacks: two, one, three.”** Press the three labelled stack symbols **2 → 1 → 3**; no timing limit. Reveals **Petal Stripe** decal. |
| SC3 Commons | Bench beside Petal Hop, S + (110,50) | Approach on foot or drive within 3 m; the card faces the landing, not the underside of the ramp. |
| NB1 Neon | Diner window ledge (495,35) | Sit once; automatically frame a postcard of the car through glass. |
| NB2 Neon | Corner Mart vending alcove (644,145) | Hint printed on shelf: **“Bottle. Carton. Can.”** Press the three matching silhouettes in that order. The drawer gives **Night Grid** decal. Unlimited free retries. |
| NB3 Neon | Beacon forecourt, 12 m south of (1180,−650) | Inspect the telescope-shaped viewing frame facing the city; no paid tower interior. |
| NW1 Needle | Pit scoreboard at (−350,570) | A retired starting board says **“Count them home.”** Set its three visible number panels to **3 / 2 / 1** and press Test. Lights descend; reveals **Pit Chevron** decal. |
| NW2 Needle | Pedestrian stand at (−620,885), behind the straight barrier | Walk up its 1 m stair/ramp and Inspect. Not on the racing line. |
| NW3 Needle | Breakyard safe entrance booth (−1090,555) | Inspect a toy-sized shed model. Can be reached before buying a heavy car. |
| ST1 Stillwater | Existing produce farmhouse (−483.77,25.28), porch 3 m toward the village road | Inspect a rice tray; the physical farmhouse remains intact. |
| ST2 Stillwater | Mill House inner lever, or the outer sluice at (−1255,405) | Hint: **“Let the white paddle meet the mark.”** Hold Open sluice, release when the white paddle is within the visible 45° marked sector. It turns once in 6 s; no penalty for a miss. Reveals **Mill Spoke** wheel-centre decal. |
| ST3 Stillwater | Shallow Run's dry north bank at (−900,320) | Step into the viewing frame; explains the shallow crossing before a player drives in. |
| CP1 Cinder | Existing small shrine at (−718,−1161), beside its path | Inspect the roadside map panel. Do not put the token inside sacred scenery or require hitting it. |
| CP2 Cinder | Lookout at (−620,−1205) | Three ridge silhouettes are cut into a panel. Rotate its pointer through **left peak → tall centre → right saddle**; use three labelled buttons, no camera pixel hunt. Reveals **Ridge Line** decal. |
| CP3 Cinder | Lay-by on the uphill right shoulder at **60% of the existing pass length from its foot**, 6 m outside the road edge | Approach the visible red thermos; the placement is road-distance anchored so a rebake cannot strand it on a cliff. |
| BW1 Bellwood | First torii of the existing final 150 m approach, 3 m west of its base | Inspect a lantern plaque. |
| BW2 Bellwood | Bell Alcove, 8 m east of the hall doorway | Panel shows **two rings, pause, one ring**. Ring twice within 2 s, wait at least 2 s, ring once within the next 4 s. Visible pulse icons duplicate audio. Reveals **Bell Arc** decal. |
| BW3 Bellwood | Viewing bench 20 m east and 10 m north of the temple hall, on a short finished path | Approach the bench; the whole sandō appears between the trees. |
| TH1 Tideglass | Net House loft (784,1006) | Three ropes have 1/2/3 knots. Pull **2 → 1 → 3**, matching the net diagram. A wooden fish swings aside, revealing **Net Weave** decal. |
| TH2 Tideglass | Working quay at (795,1025) | Inspect the tide board beside the six existing boats. |
| TH3 Tideglass | Fish-market bench at (830,977) | Pick up a hand-drawn harbour card; boat deliveries pass in the background. |
| LS1 Longshore | 15 m north of the existing lighthouse (−180,1160) | Lamp panel visibly flashes three pulses. Tap its large button three times at the same broad rhythm: intervals **0.6–1.6 s**, with no sub-frame precision. Reveals **Lightkeeper** decal. |
| LS2 Longshore | Dry bank **10 m inland from the existing river mouth**, on its west side | Inspect a driftwood marker beside the water, never submerged. |
| LS3 Longshore | Beach at **X 400**, 8 m inland from the actual southern shoreline | Approach a lifering/sign assembly reached by a 3 m coast footpath from the nearest ring turnout. The shoreline, not an assumed Z height, anchors it. |

All 24 cards yield the stated 100 Sparks once. Completing a region's three cards fills its album row and adds a small garage-wall tile; all 24 unlock **Lantern Pearl**, an additional free paint finish on every owned car. Future cars inherit that finish. No randomness, paid hints, duplicate drops or loot-box car fragments.

### Tomorrow's invitation, without a streak debt

The **Road Card** is a short three-part route combining something the player knows with something they have not tried. At most one new card is issued per UTC day after the first session. The archive holds seven unfinished cards; when it is full, stop issuing new ones until a slot opens, and never delete an unfinished card to make room. Cards do not expire, and completing yesterday's card does not require watching an ad. The first three authored cards are:

1. **Pink to Blue:** bank 3,000 drift points in the bowl; finish Coast Loop in any car; Inspect the Tideglass tide board. Reward 600 Sparks and a garage photo frame.
2. **Working Wheels:** complete Mill Run with the Skiff loan or owned Skiff; pass Shallow Run; break 20 objects in Breakyard Bash. Reward 600 and a workbench garage prop.
3. **One Clean Line:** finish Open Seat; beat any saved valid lap time by at least 0.1 s or complete another lap within 2% if no PB improves; visit Cinder Lookout. Reward 600 and a timing-board garage prop.

Subsequent cards cycle those three routes, substituting the player's least-used owned car where an event allows it and a not-yet-collected card in the destination region. No card demands an unowned car without providing a loan. Cosmetic first completions are permanent; repeats pay only the 600 Sparks. The menu shows one selected card, not three competing quest logs on the road.

### Exactly what is worth saving

| Saved permanently | Why it survives a reload |
|---|---|
| Spark balance, unique reward-claim IDs and purchase history | Earned value, with no double award after an interrupted result or ad. |
| Ten car ownership flags; per-car upgrades, setup, paint, finish, wheels, body kit | The garage is the main identity and long-term investment. |
| Eight explored regions, 24 discovery IDs, unlocked decals/finishes and garage-wall props | Exploration has memory; the player does not hunt the same card tomorrow. |
| Event completion/medals, best times/scores per car and upgrade setup, difficulty/assist category and balance version | A different car or handling update does not silently invalidate a meaningful comparison. |
| Milestone claims; peak speed, valid airtime, jump distance, banked chain, driving distance and race totals | The Records screen has real achievements rather than always-empty tiles. |
| Last safe position/mode, selected car, pinned purchase/activity and active Road Card/archive | Continue resumes an intention, not only a balance. |
| Key bindings, touch preferences, steering sensitivity, audio, graphics choice, reduced-motion/HUD options | The same game remains comfortable on return; device-specific layout overrides stay per device. |
| Record-card metadata and up to 24 pinned record thumbnails | The garage has a visual history. Keep raw photo PNG downloads outside the progress save. |

Do not persist traffic positions, fallen debris, active particles, half-finished race physics, test-drive time, current drift chain or secret turbo activation. A interrupted event restarts from its event card; already granted rewards remain granted. Unbanked free-roam score may be lost on a hard close, so bank automatically on a normal menu exit or planned travel.

Normal saves occur after purchases, reward grants, discoveries and safe parking; the player sees a subtle **Saved** tick. Account/cloud and local fallback wiring are assumed available. If the connection fails, state **“Saved on this device · sync pending”** and continue playing. If existing saves conflict, compare car count, balance, progress date and playtime on a **Choose progress** sheet; choosing a copy does not sum wallets or reissue its rewards. Keep a recovery copy of the unchosen save. Logging in never resets a guest's progress without showing that choice.

The hidden logo interaction remains hidden. Clicking the japanMap logo opens its small code field; **og123** activates unlimited Shift turbo for the current visit. Re-entering it toggles it off. It is absent from Settings, car upgrades, loading tips and reward offers. On touch, the normal Boost button maps to the same active turbo action. While active, activities are labelled **Practice** and cannot overwrite ordinary records, claim milestones or mint progress; the player can freely use owned cars and make photos. Reload disables it. Secret fun should not corrupt the collector's ordinary history.

## 10. Menu and HUD: a complete replacement

### Visual and navigation rules

Use dark ink panels, warm white type, amber for money/selection, muted rose for discovery and blue for nitro. Reserve red for braking/error states. The world remains visible behind menus; opaque text panels provide contrast instead of blurring the entire screen. One large car image or route image dominates each screen. Avoid tiny tiled promotions and moving banners.

Body labels are at least **16 px**, secondary text **14 px**, critical driving numbers **32–48 px**. Targets are at least **48 × 48 px** with **8 px** spacing; primary touch actions are **56 px** high. A focus outline and icon/text accompany colours. UI scale is **90 / 100 / 115 / 130%**; 100% is default. Respect device safe areas and browser chrome. Nothing important requires hover.

There are **six main destinations: Play, Cars, Map, Records, Photo, Settings**. Desktop uses a 184 px left rail, Escape opens the menu, and a large Continue button stays at the bottom of the rail. Phone uses a bottom row of six icon-and-label tabs, each at least 52 px wide, and a persistent 56 px **Continue** action above the row. On a narrow portrait viewport, tabs use their short labels; subpages scroll vertically, not in two directions. A Back arrow always returns one level; closing the root resumes the game. Menu tabs never secretly move the player.

The navigation bar is a row of contiguous cells with padded icons, an exception to separate-button spacing: at 360 px wide, 12 px margins leave six 56 px cells. At 115% or 130% UI scale in portrait, use a **three-column, two-row** tab grid with 56 px rows rather than compressing labels or hit areas. Controls keep their safe-area offsets as browser chrome changes.

### Every screen and how to reach it

| Screen | Contents and primary action | Mouse/keyboard and thumb entry / exit |
|---|---|---|
| **Loading / Start** | One live/static view of the bowl and Kite, truthful load progress, mute icon, **Play** when ready. A returning visitor sees **Continue**. On asset failure: **Retry loading** and a concise explanation. | Click/tap Play, or Enter. The one gesture can enable audio. No separate title menu must then be dismissed. |
| **Play** | Continue; selected Road Card; one nearby recommended event; pinned purchase progress; small **Go to Sakura Commons**. While in an event, replace the recommendation with **Restart event** and **Leave event**. | Escape/menu button opens here; click/tap Play tab. Continue resumes exact position. Travel is explicit and never tied to opening this tab. |
| **Cars — Owned / Showroom** | Default to Owned, with selected car large and a horizontal model strip. Showroom shows all ten, price, Owned state and a one-line role. Filters **All / Street / Utility / Sport / Track**. | Cars tab or showroom Use. Tap a card, click, or arrow through it. Owned/Showroom is one labelled switch, not separate inventories. |
| **Car detail** | 3D turntable; identity sentence; acceleration, top speed, braking, grip, dirt/clearance summary; price/session estimate; **Drive / Bring here** if owned, **Buy** if not; **Tune**, **Appearance**, **Test drive**. | Tap/click car; drag preview to orbit, pinch/scroll to zoom. Stats use labelled values, not unexplained 1–10 bars. Back retains catalogue position. |
| **Purchase sheet** | Car/part name, price, balance before/after, **Buy and select** / **Back**. If insufficient: exact amount missing and **Pin goal**; no ad button replacing Buy. | Explicit Buy opens it. Two equal, full-width touch buttons; Enter only acts on the focused button. Closing spends nothing. |
| **Tune** | Selected car, four upgrade categories, Street/Sport comparison, owned state, total pending price; Setup choices below. **Buy and fit**, **Test drive**, **Reset to owned stock**. | From car detail, event card or Open Bay. One category per vertical row on phone; two-column comparison on desktop. No horizontal fine sliders. |
| **Appearance** | Paint palette, finish, Wheels and Body tabs; live car preview; Owned/price labels. **Apply** for owned parts, **Buy and apply** otherwise. | From car detail; tap swatches or click. Dragging the model never changes a selection. Back restores unpurchased previews. |
| **Travel to garage/showroom** | Small destination sheet with **Open Tune here**, **Visit Open Bay**, **Visit Petal Motors**. The latter two state that they move the player to the bowl. | Garage shortcut in Cars. Open Tune here stays put; Visit moves to the safe court/bay and opens the intended interaction. Keep the selected car. |
| **Test drive** | 90 s remaining, car/setup being previewed, **End test**; ordinary driving controls. | Test drive button places the car on the practice spur. End/expiry restores the previous car/location and detail screen. No empty locked-control state while returning. |
| **Map** | Correctly proportioned full map, eight tinted regions, real road hierarchy, player, selected destination, filter row and one info panel. **Drive there**, **Travel**, **Commons**. | M, minimap tap, or Map tab. Mouse drag/scroll or one-finger pan/pinch; tapping an icon opens its card, not travel. A selected empty land point can be a waypoint but not a teleport. |
| **Region / destination card** | Name, explored state, 0–3 discoveries, available events, one place photo. Event pins show time and reward. Unknown discoveries show clues only. | Tap/click map region or icon. Desktop hover provides a tooltip but click supplies the full panel. Back clears selection before closing Map. |
| **Event card** | Route, duration, surface, mode, car, rivals, difficulty, best and rewards; Start/Change car/Tune/Back. | Join at a marker, Play recommendation or Map pin. If travelling, the accepted card takes the player to the actual start. |
| **Countdown** | Three large numbers/lights and route name; road/first turn visible. No menu panels or drifting reward overlays. | Follows Start/Retry automatically; pause remains available. The player can hold prepared inputs. |
| **Results** | Placement or medal, time/score, car/setup, personal-best card, **base + bonus + first-time = total** and updated balance. Retry/Next route/Free drive. Optional ad offer only when eligible. | Opens after finish. Keyboard focus starts on Free drive, not an advertisement. All three normal choices remain immediately available. |
| **Records** | Tabs **Driving / Events / Discoveries / Garage wall**. Driving has speed, airtime, jump distance, chain and distance; Events has per-car filters; Discoveries has eight rows of three; Garage wall shows unlocked display props. | Records tab. Tap a tile to open its detail; no developer frame-time counters on this screen. “Analytics” becomes player-readable **Records**. |
| **Record detail** | Thumbnail, value, date, car/tune, location, difficulty/assist category; **Pin**, **Show on map**, **View car**. | Open a record tile. Pin displaces the oldest unpinned thumbnail if storage is full, with no loss of its numeric record. Back returns to the same tab. |
| **Discovery / Road Card detail** | Actual place crop, hint, progress, reward; Show route, Narrow clue when available, Select card. Completed cards display their cosmetic reward. | From Records, a map icon, board interaction or Play. On phone this is a single column; Back never abandons saved clue progress. |
| **Photo** | Free camera, current framing, **Capture High**, **Hide UI**, **Reset camera**, **Exit**; no filters or time-of-day sliders. | Photo tab or P outside a menu. Exit returns to exactly the prior view/position/mode. |
| **Photo result** | Full image, resolution, **Download PNG**, **Retake**, **Return to game**. If a high capture fails, keep the preview and offer **Capture smaller**. | Follows successful capture. Download is a deliberate click/tap and uses the browser's normal download/share destination. |
| **Settings** | **Controls / Audio / Graphics / Accessibility / Progress** subpages. Values below; current values always visible. | Settings tab. Phone uses a vertical subpage list and a Back breadcrumb; desktop uses a secondary rail. Closing applies reversible settings immediately. |
| **Binding / touch layout editor** | Select action, press key or drag a large control, show conflict and **Swap bindings**; **Restore defaults**. A static driving preview shows safe areas. | Controls → Customize. Capturing a key ends with Escape/Cancel. Save layout is explicit so accidental dragging cannot ruin driving. |
| **Choose progress / sync status** | Local and account copy summaries, dates, cars/balance/playtime, two clearly named choices; a recovery copy remains available. Normal sync status is a small text row. | Settings → Progress, or when the existing persistence layer reports a conflict. No repeated login wall on Continue. |
| **World interaction panel** | The specific interior action or one discovery puzzle, with large symbol buttons and immediate success feedback. | F / Use at the object. Walk away or Back closes it; solved state persists. |

**Settings values:** steering sensitivity 50–150%, default 100; chase camera distance 4–8 m, default 6; camera shake **Off / Low / Full**, default Low; key remapping for throttle, brake/reverse, steer, handbrake, boost/run, stunt, enter/use, recover, camera, map, menu, photo and slide. Touch options are **Auto-throttle on/off** (default on), **Stick / Left-right buttons** (stick default), **Left-handed mirror**, and button scale 100–140%. Braking overrides auto-throttle. Reverse requires holding Brake at rest for 0.4 s. Choosing manual throttle adds a dedicated pedal but never disables the simpler layout.

Desktop driving defaults are **W/S throttle/brake-reverse, A/D steer, Space handbrake, Shift boost, Q Stunt, F enter/exit/use, R Recover, C chase/hood, M Map, Escape menu, P Photo**. On foot, Shift is Run, Space Jump and CTRL Slide; A/D/W/S move. Gear selection is automatic in all cars, including drag; buying a car does not require learning manual shifting. V/free flight remains a developer tool; the production exploration camera is Photo. Key conflicts are resolved explicitly by Swap, never by silently assigning one key to two simultaneous driving actions.

Graphics retains **Auto**, the existing five quality presets and **Custom**, with a clear **Recalibrate** action. Custom exposes render scale, vegetation density/range, reflections and effects using the existing valid limits; it cannot change collision or remove an event obstacle. Accessibility includes Reduced motion, larger HUD, high-contrast route, colour-independent markers and subtitles for important nonverbal signals such as **GO** and **CHECKPOINT**. Progress shows save status, recovery copy and account entry; it does not contain hidden turbo. F1 remains a dev-only debug key, unrelated to the original open-wheel circuit or player menus.

### Driving HUD layouts

The HUD has four visual groups: navigation, car instruments, temporary skill score and activity status. Currency appears for 2 s when gained and on menus; it is not a permanent competing scoreboard. Default units are km/h, with mph available in Settings; event target times and route distances remain consistent.

**Desktop, reference 1920 × 1080:** a 190 × 190 px north-up minimap sits 24 px from the lower left. A 220 × 180 px instrument cluster sits 24 px from the lower right. The instrument has a 180° RPM arc above, **gear in its centre**, large speed below, and a separate blue **100-unit nitro arc** on the outside lower edge. Never make RPM and nitro two indistinguishable half-circles. The gear is R/N/1…7 as appropriate; it flashes once on a shift. The redline segment is car-specific. The score appears centred at 20% viewport height, one large number and multiplier with a thin progress line and one reason such as **Clean link**. Race information uses the top left; the next checkpoint direction sits just above the car's forward sightline.

**Phone landscape, reference 844 × 390 CSS px:** minimap **112 × 112**, 12 px from top/left; instrument **144 × 118**, 12 px from right and 138 px above bottom. The centre 45% of screen width remains clear of persistent controls. Left steering pad is **128 × 112** at bottom-left plus safe area. Right thumb has three **56 px** targets in a triangular group: Drift lowest/inboard, Brake lowest/outboard, Boost above; Stunt is a **48 px** toggle just above/inboard of that group. Menu is **48 px** at right edge around 38% screen height, above driving controls. Auto-throttle means the right thumb can brake, drift or boost without also holding an accelerator. Dragging from Boost onto Drift releases Boost and immediately applies Drift; it does not require three simultaneous fingers.

**Phone portrait, reference 390 × 844:** minimap stays 112 px at upper left, instruments 132 × 112 at upper right, activity/score strips stack between Y=140 and 220. Steering and action groups occupy the lower 180 px with the same target sizes. The driving camera pulls back 0.6 m and lifts 0.3 m to show the upcoming turn above the car. Menus become vertical sheets. The game remains playable; a dismissible **Landscape gives a wider view** hint is shown once, never as a rotation lock.

In manual-throttle touch layout, Throttle is an 80 × 64 px hold zone immediately inboard of Brake; the other controls move up by 64 px, and the camera keeps that region clear. Left-handed mode mirrors controls but keeps map text upright. Layout scaling never nonuniformly stretches the map or instrument. At the minimum supported 360 px width, shrink noninteractive instrument decoration before shrinking a touch target.

**On foot:** remove RPM/speed/nitro. Keep minimap and region, left stick and right camera drag, Jump/Run/Slide, persistent Call car, and contextual Use. Enter car replaces Use beside a door. Car distance appears next to Call car. There is no car-shopping carousel over the walking view.

**During a drift:** show only current pending score, ×1–×5 and progress toward the next multiplier. A banked chain briefly collapses into **+N Sparks** if eligible, then disappears. During a score event, show event target progress instead of the wallet conversion. **During a stunt:** add one trick label and a landing indicator; **Landed** confirms the result after contact, not midair. During a race, result/purchase/region notifications wait until the car is safely off the finish line.

### Minimap and world map are different views of the same geography

The minimap is a fixed square with a circular crop option; world X and Z always use identical metres-per-pixel scale. Default visible width is **480 m in car mode**, **160 m on foot**, expanding smoothly to **700 m above 180 km/h**. North remains up by default, with Rotate with car optional. Full map begins fitted inside a square aspect-preserving frame with unused space available for the detail card; never squeeze the world into a phone panel.

Use eight low-opacity region colours, stronger boundary lines, white major roads, thinner grey local roads, dashed ochre dirt and blue water. Icons: wheel for Commons/garage, flag for events, open-wheel silhouette for circuit, lantern for town/interior, torii for temple, sheaf for fields, lighthouse for coast, diamond for known discovery, hollow question mark for a clue. Only the selected route, nearby uncompleted activities and active rivals appear on the driving minimap. Filters **Events / Places / Discoveries / All** are on the full map.

Travel is free to **Commons, Rotor Court, Needle pits, Cinder Lookout, Temple forecourt, Stillwater Village, Harbour entrance and Lighthouse turnout** after the corresponding region is discovered. Entering an event through Travel and start also works before discovering its region, but discovery pays only after real movement there. A map tap previews; a second deliberate **Travel** button performs it. Moving the map's view never teleports the car. In an active event, travel first offers **Leave event and travel**; the loss is the unfinished attempt, not previously earned money.

## 11. Photos and records should preserve moments

Photo mode pauses the current game state and starts at the current camera, within a **100 m horizontal / 40 m vertical leash** around the player. Desktop: WASD move, Q/E lower/raise, right-drag look, wheel change movement speed, Enter capture, Escape exit. Touch: left movement pad, right look drag, large Up/Down buttons, pinch for framing distance, Capture/Exit in a bottom strip. Photo movement cannot discover regions, collect cards or move the parked car.

**Capture High** improves a paused composition without switching the entire world to Ultra. Keep the fixed after-rain lighting, prepare only detail visible in the shot, and prioritise clean edges and the player's car. Aim for **2560 × 1440 on desktop** and **1920 × 1080 on phone**, preserving the framing aspect, only when accounted peak allocations permit it. Render a few jittered samples serially into a reusable accumulator instead of allocating a giant supersampled target; freeze particles and all scene animation between samples. Offer **3840 × 2160** on desktop as an explicit option. Check the allocation before resizing or loading extra assets, including export/readback copies; on a constrained phone offer the smaller safe output with its dimensions shown. A failed attempt keeps the paused composition. Do not rely on recovering from an out-of-memory crash. Returning restores the gameplay camera and resources before driving resumes. A sharp, coherent bounded capture is preferable to the earlier promise of unconditional Ultra presentation on a phone.

There are no weather, time-of-day or fake licensed-camera controls. Save a PNG without HUD or watermark. Filename format is **japanMap_place_car_YYYY-MM-DD_HH-mm-ss.png**. A capture has no currency reward; the value is having a photograph of the player's car in a place they earned the right to remember.

Record values and their time/location are saved immediately; automatic **320 × 180** card images wait for a paused results screen or the next safe parking. Do not capture the exact speed-peak frame or read pixels during a landing or drift bank. If no settled capture exists, use the car portrait and location label. Label a later picture as a record card, not a photograph of the exact record moment. Keep **one current thumbnail for each of the five headline driving records**, plus **up to 24 pinned record thumbnails**. Event bests and discovery cards store their numbers/IDs even when their unpinned thumbnails are evicted. Never put full-resolution screenshots into each progress transaction. This deliberately gives up automatic action photography to protect driving frame time; Photo Mode still provides composed photographs.

Player Records is not developer analytics. Separately, the useful product measurements are: loaded-to-first-move, first car entry, first deliberate drift/boost, E01 acceptance/completion/skip, menu route to first purchase, event finish/retry/leave, use of free test drive, per-session earnings/spending, car-use distribution, return to a pinned goal, recoveries, and optional-ad offer/accept/error/exit. Attach event/car/control-layout identifiers and elapsed durations, not photographs or free-text code entries. The secret field content is never telemetry.

Use those measurements to answer concrete design questions: if over 20% of new players have not entered a car after 30 s, change the car prompt/placement; if one ordinary activity pays more than 1.5× the median Sparks per active minute, rebalance it; if fewer than half of returning owners use a newly purchased car twice, inspect its identity and the event fit. These are proposed investigation thresholds, not measured results or guaranteed retention targets.

## 12. Ads: an optional bargain, not a punishment

The following are product rules. SDK callbacks, availability detection and platform wiring remain outside this document's implementation scope. Current CrazyGames guidance independently requires ads at non-disruptive breaks, clear optional rewards and normal play when an ad cannot run; it also disallows midgame ads on navigation buttons. The design below adopts stricter pacing than merely requesting every eligible opportunity. [CrazyGames advertisement requirements](https://docs.crazygames.com/requirements/ads/)

### Two rewarded offers

1. **Result bonus:** after a completed event lasting at least 45 active seconds, offer **“Watch ad · +300 Sparks”**, alongside an identically sized/styled **Continue** button. The ordinary event reward has already been granted and saved. This adds a fixed 300; it does not double discoveries, first-time car rewards or an entire hour of drift. Eligible after five active minutes of the first visit, at most once per five active minutes and three times per rolling thirty active minutes. E12 eligibility refers to the whole match, not one drag heat.
2. **Long loan:** on an unowned car's detail screen, after its free 90 s test drive, offer **“Watch ad · borrow for 10 minutes”**, with **“Borrow · 600 Sparks”** as the same-duration earned-currency alternative. There is still a free test drive every time. A loan permits free driving and photographs, but no record/economy/discovery awards; timed paid events end the loan and use an owned car or their own explicit event loan. Loan time counts only active driving/walking, not menus or photographs. Warn with 30 s remaining. At expiry, allow up to 20 s to stop safely; if still moving, ease into a controlled stop at the nearest safe road position. Then return to the previously owned car using the same safe placement rule, never swap meshes at full speed. At most one long-loan ad offer per twenty active minutes.

Across both types, at most **one rewarded ad per five active minutes**. No offer appears on the driving/walking HUD. A 17-year-old can rationally choose one because the price and benefit are clear, while a player refusing every offer can own every car and access every road on the stated economy. Ads do not refill basic nitro, restore a failed chain, unlock retries or make the starter handle properly.

### One possible midgame break

Only after a **completed event result has been shown and paid**, and when the player chooses to leave that finished event, may an interstitial transition occur. Label the transition **“Short break”** before it begins. Local eligibility: **at least 10 active minutes since first play, at least three completed events, at least eight active minutes since any ad, no rewarded offer on that result, and no interstitial on immediate Retry**. Platform restrictions can suppress it further. There is no attempt to fill quiet free-roam time with periodic ads.

Opening Play, Cars, Settings, the map, a car door, a discovery clue or Photo never requests an ad. Neither does failing, recovering a stuck car, calling a car, attempting an unaffordable purchase, crossing a region boundary, returning from another browser tab or leaving a delivery unfinished. Those moments already carry friction; adding an ad would turn inconvenience into a reason to close the tab.

No banners on the road, no ad billboard disguised as a race arrow, and no delayed or smaller skip choice. Rewarded ads are never automatically chained with an interstitial. If an ad is unavailable, keep the normal result reward, show **“No ad available”** once, and return to the same usable screen without granting the ad-only bonus or deducting anything. If ads are disabled for the environment, hide the rewarded actions and retain the free test drive and earned-currency loan. A save/login prompt never stands between the player and an already earned result.

## 13. Fit the existing systems and verify the actual design

### System ownership, from ARCHITECTURE rather than source inspection

| Design responsibility | Existing home / boundary to preserve |
|---|---|
| New roads, rerouted ring, city benches, river culverts and parcel banks | Offline world/road baking and the existing RoadNetwork. Navigation, visible road, ground support and AI route must share the authored alignment. Generated outputs are regenerated, not hand-edited into contradictory worlds. |
| District frontage, village composition and interior shells | Existing CitySystem, PropSystem and their emitted placement/collision data. Group ordinary buildings by block, reserve seven identifiable interior shells and hero corners. |
| Car identity, tuning, support, collisions and stunt response | Existing VehicleSpec, Vehicle, ArcadeDynamics, RoadGround and CollisionWorld. Apply per-car data through the current vehicle owner; preserve telemetry and reflection references when changing the model. |
| Ramps and visual landings | Existing RampField/StuntSystem contract. The function the car drives on and the mesh the player sees agree, including at ramp edges. |
| Events, rivals and scoring | Existing RaceDirector, RaceLine, RivalField, CheckpointGate and DriftScore. Extend event definitions and result data; UI does not run a second race or currency calculation. |
| Gear/RPM/engine note, surface slip and impacts | Existing AudioSystem consumes the authoritative telemetry and event bus. Gear display and gear sound describe one shift, and external mute has priority. |
| Menu, HUD, map, touch and walking prompts | Replace the presentation in the existing player UI/HUD/touch layer; consume actual mode/event state. Production UI remains independent of dev-only debug imports. |
| Ownership, wallet, claim IDs, records and last safe intent | A single persistent player-progress owner connected to the already assumed save transport. Results and purchases are transactions, never separately calculated by a shop and a HUD. |
| Phone performance and photo quality | Existing quality ladder and asset upgrader. Lower visual cost, not different roads, cars, opponents, hit boxes or obtainable discoveries. |

The night-after-rain mood remains fixed. Keep the existing Three.js/TypeScript/Vite stack, baked heightfield, fixed simulation step, terrain sampler and quality system. Do not add a second map renderer, a second vehicle engine, a second account wallet or a gameplay dependency on developer debug panels.

### Make the street expensive; keep the renderer small

**This section replaces earlier rendering, population, capture and asset-residency assumptions wherever they conflict.** The 2.60 km² city is a land-use envelope, not 2.60 km² of individually detailed meshes. Its roads, neighbourhoods, doors, businesses and destinations survive every preset. The old 800-call / 3-million-triangle / 512-MB-texture limits are discarded as phone targets. They permit a scene that passes its counters and still drives badly.

Ship for a **sustained 30 FPS floor on the weakest supported phone**, with 60 Hz vehicle simulation; offer sustained 60 FPS when the device has headroom. A cold 60 that becomes 23 after five minutes is a failure. Prioritise steering response, stable frame pacing and a readable road over a reflective screenshot. No preset may change vehicle physics, road contact, event gates, available destinations or collision opportunities.

#### Density at bonnet height

Spend the city's visual budget in three layers: a tactile street immediately around the car, continuous architectural depth down the road, and a few memorable silhouettes above it. A driver's view must contain all three; an aerial view does not set the detail budget.

- **Close the street wall.** In the central districts, target 80–90% occupied frontage on important driving streets. Count an arcade, courtyard wall or deep gate as enclosure; do not fill every opening with another building. Hills can remain more open where retaining walls, trees and stepped roofs frame the road. Keep the planned driving widths. Bring shop canopies, raised kerbs and entrances toward the camera instead of narrowing every road into a collision funnel.
- **Give ground floors real depth where silhouettes reveal it.** Kerb, plinth, door recess, canopy edge and building corner are geometry on every preset, including walking routes. A flat photograph will fail at arm's length. Use a shared kit of these profiles with opaque facade tiles, vertex colour and baked contact shading. The back of an inaccessible shop can be an empty box. Do not model shelving behind every window.
- **Compose frontage, do not scatter detail.** Every 20–35 m of a principal street needs a different readable mass or use: a recessed lit shop, a dark workshop, a canopy, a narrow gap, a stair or a planted wall. Repeat the construction kit freely; vary the bay rhythm, roofline and lighting pattern. Author each junction as a composition. Individual air conditioners and bins are optional; an unbroken luminous window grid is not an acceptable substitute.
- **Preserve anchors in cheap representations.** Each important turn gets one recognisable sign, roof or coloured entrance, built into the first-load mesh and atlas. Beacon, cinema, shrine approach, garage and harbour roofline remain identifiable from their approach roads on Minimal. Optional packs add finish, never the first appearance of a destination.
- **Make upper floors quiet.** Windows are an opaque atlas plus a per-building lighting mask, not separate panes, lights or transparent draws. Keep the established roughly one-third-lit rhythm, with dark runs and genuinely dark roof bands. Upper-storey ledges need geometry only where they affect a visible outline. Roof equipment invisible from accessible viewpoints is cut.
- **Use foreground occlusion deliberately.** Overlapping eaves, a retaining wall, a bend and a few well-placed trees create depth and hide cheap background bodies. Do not line every street with alpha-heavy foliage. A junction can reveal the skyline; the next block should enclose the view again. Keep the circuit's long view open: its depth comes from barrier rhythm, mountain silhouette and speed, not city props pasted beside the straight.

The player notices a floating kerb, empty shop base, identical lit windows, a disappearing landmark and a bad car silhouette immediately. They rarely notice a missing sixth roof vent, an unmodelled shop back wall, flat upper windows or a distant car without an interior. Allocate geometry accordingly. The approximately 640 building bodies remain an authoring estimate; combine or split them to improve street composition. They are not 640 independent update loops, materials or mandatory draws.

#### The night is baked; the car is alive

**No real-time city light grid, SSR or full-scene planar reflection on the phone path.** Cut N8AO from High and below. Retain the fixed blue-hour art direction and bake its useful work: facade recess darkness, canopy undersides, wall-to-pavement contact, warm doorway pools, cool sky-facing surfaces and restrained sign spill. Use shared light tiles, vertex lighting and compact local masks; a unique high-resolution lightmap for every building would exchange draw cost for download and memory failure.

Wet roads use three coordinated signals: darker rough asphalt, thin bright grazing highlights, and stretched colour from the actual nearby light sources. Bake that colour in road coordinates from the same sign/lamp records used to place the visible fixtures. Fade it with angle and roughness; do not bake readable mirrored text or a reflected car that cannot move correctly. Preserve dry patches beneath canopies and along sheltered edges. On hills, the treatment follows the road surface rather than an imaginary city-wide horizontal plane.

Give the player's paint and glass priority. Bake a small set of district environment probes offline, including their filtered mip chains. Sample one local probe and smoothly blend to the next near a boundary; do not capture cubemaps while driving. Ambient tint and lamp-zone intensity change smoothly on the moving car. Use painted panel normals, a clear highlight and a stable under-car/contact shadow on every preset. Dark, opaque reflective windows with a shallow cabin read better than sorting several transparent glass layers. Cockpit views retain the instruments and forward visibility needed to drive; their hidden rear seats can disappear.

On phone presets, headlights are emissive lamp faces plus bounded, unshadowed illumination of the nearby road. No six-light traffic procession or moving shadow maps. Static baked shadows cannot contain traffic, breakable props or moving doors; those get cheap local contact marks that follow their state. A removed object must not leave its own baked silhouette behind.

Bloom is a finish, not the lighting system. Design signs to look luminous through brightness, colour and a narrow painted halo in the base path. Medium may use one small bloom buffer; Low and Minimal use no bloom pass. Grade and tone-map in the main output path where possible, avoiding a separate full-resolution compositor just to retain the palette. Water uses local colour, a few broad moving highlights and shoreline geometry; keep spray and wakes narrow. No screen-filling transparent mist, rain sheet or fog cards. Use distance haze in the surface shading.

#### A complete cheap world underneath local detail

The first load contains the entire playable world at its shipping base quality: terrain, roads, road support, navigation/collision data, building volumes and ground-floor profiles, landmark silhouettes, all seven usable interior shells, event objects and usable base versions of all ten cars. Those assets are sufficient to drive anywhere and finish every activity if no optional download ever succeeds. The base is the designed Low presentation, not a grey emergency placeholder.

Build city visibility groups along the existing block polygons, splitting long frontage into roughly 50–80 m runs. Group repeated parts by shared material **and location**; do not put the whole city in one instanced batch whose bounds intersect every view. Conversely, do not give every shop its own draw. Merge opaque static street pieces into a small number of material groups, and instance repeated fixtures within nearby groups. Instancing reduces submission cost; it does not make invisible instances free merely because their shared batch is visible. [Three.js InstancedMesh documentation](https://threejs.org/docs/pages/InstancedMesh.html).

Bake conservative street visibility connections from road junctions and major openings. Keep the next junction's exits available before the car reaches it. Use these connections to exclude enclosed block backs, with ordinary frustum culling inside visible groups. Include wide safety margins for chase cameras. When a jump or photo camera rises above the roofs, fall back to broad silhouette groups and frustum culling; a street-only visibility set must never expose holes. Do not add synchronous GPU occlusion queries or a per-frame CPU raycast against every building.

Simplify by projected importance, not five concentric distances applied to everything. A narrow gutter can disappear early; Beacon cannot. Preserve junction signs farther down their approach road than side-street trim. Keep nearby tree trunks and chunky opaque crown geometry; use baked silhouette clusters or impostors for distant vegetation. Bake the impostor atlases offline, never on the first drive into a biome. Preserve the CDLOD terrain topology rules and the authoritative road/height data.

Representations share the same roofline, plinth height, sign position and lighting mask. Switch small pieces inside occlusion where possible. Use hysteresis so reversing does not thrash them. Avoid long alpha crossfades that render both buildings or both forests; if a visible silhouette pops, repair its cheaper representation instead of hiding the mismatch in expensive transparency. Interior decoration is visible only through a relevant open doorway or from inside; its facade and usable shell are always present.

#### What the five presets actually mean

**Low is the phone art approval reference.** Build and approve the neighbourhoods there first. Medium is the intended everyday presentation on a capable phone. High and Ultra spend surplus capacity on surface fidelity; they do not repair an empty lower preset.

| Preset | What the player gets | What is cheaper or absent |
|---|---|---|
| **Ultra** | The fullest close shop kit, richest tree crowns, sharp paint and facade materials, long retention of small architectural detail, restrained bloom and local contact AO. | Still uses baked city lighting and district probes. One optional planar reflection may serve a visible, flat hero puddle; exclude sky-hidden interiors, vegetation, particles and small props from that reflection. Never reflect the whole city at full resolution. |
| **High** | Essentially the same street composition and car as Ultra; close eaves, rails and signs retain their shape. Sharper textures and fuller foliage than Medium, with modest bloom. | No planar reflection or N8AO. Wet-road colour and probes carry the gloss. Tiny roof fittings and distant facade relief disappear earlier. |
| **Medium** | Complete three-dimensional ground floors, crisp destination signs, good car paint, stable shadows/contact, selected close props and tree profiles. Small bloom is allowed within budget. | Upper floors are mostly the opaque facade kit; distant vegetation becomes authored clusters. Most road polish is baked. No extra scene render for shadows, AO or reflections. |
| **Low** | The full authored street, the same doors and landmarks, readable cabin, road markings, barriers and car silhouette. Close trunks, canopies, recesses and important signs remain geometry. | Lower drawing resolution, smaller material pages, simpler noninteractive fixtures and crown shapes. No bloom or screen-space effects. Light pools and wet highlights are part of the base art. |
| **Minimal** | The same city with a deliberately graphic night treatment: strong masses, warm shop pockets, dark roofs, clean colour and a glossy, readable player car. Every walking entrance and event remains usable. | Simplified base meshes replace trim-heavy versions; plants use opaque clusters, incidental ground litter is folded into surface colour, and effect bursts use their smallest recognisable form. No extra full-screen effect pass. Resolution falls before destination readability or road geometry does. |

Parked cars that can be entered, breakable stalls and drivable barriers do not vanish with a preset. Their visual representation gets cheaper with the same occupied space and interaction. Pure visual litter can become a road texture because it never blocked the car. Fewer triangles must not leave invisible collision protrusions in a walking route. HUD text remains at CSS/device UI resolution even when the 3D view is reduced.

Use these **starting ceilings**, then lower them when device measurements demand it. They are asset and renderer admission limits, not proof of a frame rate. Pixel counts preserve the viewport's aspect ratio; do not multiply them again by devicePixelRatio.

| Preset | Maximum 3D pixels | Accounted resident GPU allocations, including transition overlap |
|---|---:|---:|
| Ultra | 2.3 million | 384 MiB |
| High | 1.45 million | 224 MiB |
| Medium | 0.95 million | 160 MiB |
| Low | 0.70 million | 128 MiB |
| Minimal | 0.46 million | 96 MiB |

Account for all texture mip levels, geometry, render targets, probe storage and temporary replacement resources. Leave additional room for browser and driver allocations; this accounting is not a claim to know total device VRAM. A small downloaded JPEG can still become a large GPU texture. Use supported GPU-compressed texture formats through a tested asset path and budget the decoded fallback separately. A fallback that exceeds the ceiling selects smaller pages before upload. Batching, back-buffer size and actual texture allocation matter independently. [WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices).

For Low/Minimal, initially admit roughly **160 total submitted draws and 250,000 submitted triangles per normal driving frame**, allowing up to 200 draws / 350,000 triangles at the busiest junction. Count all passes and reflection draws. These are investigation triggers: reduce a batch's visible contents or remove an expensive pass when timing fails, even below those counts. Draw-call savings never justify rendering an entire unseen district. Near-camera translucent effects should normally cover less than 10% of the viewport; a small particle count can still drown a phone in overdraw.

#### Bound the work while driving

Use a shared maximum of **six active civilian cars and twelve active pedestrians**, with at most four pedestrians close to one crossing. Place traffic ahead on connected streets; do not simulate a population across the map. Keep the same active-actor rules across presets. Three race rivals replace traffic on the race corridor; they are not added to a six-car traffic jam. Parked shapes and shop activity supply the rest of the apparent population. Distant workers can use tiny, infrequent pose changes; they do not require full animated skeletons and thinking every frame.

The player's car and nearby collision-critical actors keep the existing fixed simulation. Route choice, pedestrian intention and ambient animation updates run at lower staggered rates; interpolate visible motion. Spawn/despawn actors outside sight and conflict zones. Do not lower the physics rate to save a preset, and do not manufacture a different traffic challenge on a slower phone.

Destruction changes one authoritative prop state, then emits a bounded visual response. At most **12 substantial nearby fragments** may briefly participate in collision; the rest follow cheap ballistic/settling animation and never enter the vehicle collision set. Limit total visible fragments to 48, including dust substitutes. Pack them by shared material, not a draw per shard. At the cap, show fewer larger pieces and a short impact flash; preserve the score, missing panel and sound. Spend spray on two clear tyre ribbons and a few droplets, not a cloud filling the windscreen. Reuse pools for fragments, trails, traffic and UI effects.

Keep full engine layers for the player, with a small shared voice budget for nearby rivals and traffic. Stream music only after play is established. Never decode audio, construct a district, generate an impostor atlas, create dozens of materials, read back a screenshot or save a large photo synchronously during a corner.

For the 30 FPS floor, aim initially for p95 GPU work below **24 ms** and p95 application main-thread work below **8 ms**, measuring them separately because they overlap. This leaves headroom inside a 33.3 ms interval; it is not a promise that browser scheduling will cooperate. The 60 FPS mode needs approximately 12 ms GPU / 5 ms application p95 plus a successful sustained frame-pacing test. Measure with real driving, collision and UI activity.

Auto starts at Low with a bounded back buffer. Raise quality only after useful play shows sustained headroom; do not benchmark an empty menu. For GPU pressure, reduce pixel count first, then bloom and optional surface detail. For CPU pressure, suspend background assembly/uploads and reduce cosmetic work; shrinking pixels cannot fix traffic or garbage collection. Use multi-second windows and hysteresis, with no upgrade during a race, junction entry or collision burst. Avoid swapping presets and recompiling shaders as a frame-by-frame governor. Manual presets retain their chosen feature set; report any necessary resolution/memory limit honestly. Prepare a requested change while paused, then switch once its resources are ready.

#### First load: a finished small game, not a loading trick

Target **18 MB maximum measured cold transfer to genuine play**, leaving 2 MB below the mobile-homepage threshold. CrazyGames measures initial download up to the first Gameplay Start event when using its SDK; that event must represent actual play, not a menu concealing further mandatory loading. The published mobile-homepage limit is 20 MB. Treat that as a total delivery limit, not an extra art allowance. [CrazyGames technical requirements](https://docs.crazygames.com/requirements/technical/).

The earlier 17.02 MB measurement is not spare capacity for this expansion. Rebuild the initial package around this allocation, in decimal transfer MB including required dependencies:

| First-load allocation | Ceiling |
|---|---:|
| Lossless heightfield, roads, support/navigation/collision and world placement data | 6.8 MB |
| Client, engine, required SDK, workers and decoders | 1.6 MB |
| Shared environment material atlases, ground textures and baked lighting masks | 3.3 MB |
| Small sky, offline filtered probes and colour treatment | 0.9 MB |
| Usable base models for all ten cars, with starter material detail | 1.2 MB |
| Shared architectural/foliage kits, landmarks, interior shells and activity meshes | 1.0 MB |
| Essential driving, surface, interaction and UI audio | 1.0 MB |
| Fonts and UI images | 0.2 MB |
| Unallocated delivery contingency | 2.0 MB |
| **Total initial cap** | **18.0 MB** |

These are design allocations, not new measurements. Keep the authoritative height samples lossless; do not buy a smaller package by changing road contact. Replace the 4K sky/HDR download with a small sky and prefiltered reflection data. Reuse eight facade families, a compact sign atlas and per-block colour/window masks instead of unique street textures. Doorway lettering essential to navigation gets more texels than upper-storey brick. All ten base cars must be good enough to select and drive; a detailed replacement is optional, including the free Pip. Showroom background pads use cheaper representations, not three full player-car render budgets.

Boot only the resources needed for the real starter view, its controls and the complete base world. Stage nearby GPU geometry before the player receives control. Distant base groups may be assembled and uploaded incrementally from already-downloaded data, with cheap silhouettes covering them until ready. Check the fastest reachable route, not only a slow tutorial. Do not fire Gameplay Start while a required world download or shader stall remains between the player and ordinary driving. Include decoder/WASM, fonts, sounds, required remote assets and first-use dependencies in the cold network audit.

#### Optional detail must never become a driving dependency

Use independently useful detail packs for the five districts and rural destinations, generally **0.5–1.0 MB each**, plus selected-car surface/cabin upgrades. A pack may contain sharper materials, extra canopy fittings and richer vegetation. It may not contain the only road, doorway, collision mesh, shop sign or event trigger for an area. Do not eagerly fetch every pack immediately after Gameplay Start; that merely moves congestion into the first corner.

Prefetch by connected road travel time, using roughly **five seconds of look-ahead** when capacity allows, not a circular radius alone. At 330 km/h that is about 460 m of road. Keep the current district and the recently traversed branch resident so a handbrake turn does not trigger an unload/reload cycle. Entering an unpredicted lane or losing the network retains the composed base view. Never put a spinner over free driving. Asset absence may reduce fine texture detail, not street density.

On phones, allow at most two optional downloads and one decode/assembly job at once. Prioritise an explicitly selected car, then the current view, then the likely route. Cancel obsolete queued work. Use small material pages, normally no larger than 512² for an optional upload, and bounded mesh groups; do not enqueue an entire district's GPU upload on its first visible frame. Keep pending decoded data under **16 MiB**. Start with a **1 ms main-thread installation allowance per rendered frame**, stop the queue when the frame is under pressure, and split any resource that repeatedly breaks that allowance. An individual driver upload is not pre-emptible; scheduling alone cannot cure an oversized texture.

Share a small, fixed family of already-used materials and shader features between base and detailed representations. Warm their actual render path during the initial loading or a deliberate paused quality change. Optional street packs must not introduce first-use shader variants. Asynchronous compilation may assist when supported, but it does not replace exercising the actual configured pipeline or justify another giant warm-up frame.

**Downloaded is not resident.** Keep reusable files in the browser's normal cache when available, but evict optional GPU textures/meshes and decoded CPU copies under the current ceiling. The earlier one-way visual-asset upgrade rule is replaced by reversible residency. Never evict a visible resource before its base replacement is ready, and count both sides of a transition against the peak budget. Leave useful neighbouring groups resident rather than filling memory with unused Ultra pages. Low/Minimal should usually stop downloading detail entirely once their selected presentation is satisfied.

Photo capture is the only place to spend spare time on additional samples. Pause, bound the shot's resources, prepare only visible optional detail and render within a checked allocation. Do not promote the entire world to Ultra or regenerate global lighting for one picture. Automatic record cards wait for parking/results; driving is never interrupted for pixel readback.

#### Accept moving streets, not six posed hero frames

Keep the six named views as art references, but replace them as the performance gate. Test bonnet and chase views through **Crosslight's junctions, a tight alley turn, an immediate reverse into the previous block, Hill Steps, the harbour opening and the circuit at maximum reachable speed**. Include a jump above the roofline, a prop-impact burst, a race with three rivals, walking through each doorway, and return from photo mode. These expose visibility mistakes, upload stalls and CPU spikes that a still frame hides.

Run the same routes on a recorded low-end Android/Mali device, an Android/Adreno device and an iPhone/WebKit device in the actual CrazyGames embedding. Establish the weakest supported hardware from these measurements, not from the development GPU or a desktop throttle slider. Test a cold cache, a slow connection, optional requests blocked after initial play, repeated direction changes, and at least **15 minutes of uninterrupted driving** for thermal and memory behaviour. Record the exact models, browsers, preset and render resolution with the trace; none has been measured for this revised design yet.

For a 30 FPS claim, require p95 presented-frame intervals at or below approximately 34 ms, p99 below 50 ms, and no game-caused interval above 66.7 ms during ordinary driving or resource installation. Investigate every repeatable missed frame at the same doorway, corner or effect. For 60 FPS, use approximately 17 ms p95 / 25 ms p99 and no repeatable 33.3 ms miss. Report long-frame attribution, CPU/GPU timing, upload/compile events, allocated-resource peaks and cold bytes; averages alone can hide the problem.

Judge appearance from moving Low/Minimal footage at their actual resolution: intact silhouettes, close ground-floor depth, readable signs and road edges, stable contact, coherent wet light and no holes or conspicuous swaps. If a budget fails, first cut extra passes, alpha coverage, unique material pages and unseen geometry; then simplify incidental detail. Redesign a costly frontage into a convincing shared kit before deleting a neighbourhood. A smaller number of well-composed street elements is explicitly preferable to obeying the old prop and hero-detail counts.

### Acceptance scenarios, not a production calendar

- **First visit, 390 px phone:** a new player enters the Kite within 7 s after choosing to do so, drives without a three-finger chord, receives the first 100 Sparks, and can take or ignore E01. No shopping, ad, account or daily screen blocks the thirty-second sequence.
- **Honest land use:** urban measurement reaches at least 2.56 km² against the 0.64 km² baseline, with a 2.60 target and the stated exclusions. Tideglass Harbour stays the ocean port. **Stillwater Village** occupies ~0.10 km² of western paddy edge and is the beauty peak. City plots do not float over the sea or temple reserve. If the coarse area estimate fails detailed grading, adjust the proposed northern/eastern serviced blocks within the declared envelope; do not quietly count forest or annex the remaining paddies.
- **One physical road:** every new primary-road junction, East Gate embankment, river/pass culvert, paddy bank and ramp can be crossed slowly and at its intended speed in Kite and Cairn. Check visible tyre support from the side, not just CPU height values. The ring completes a continuous lap outside the circuit, and all event routes have physically connected gates.
- **Ten identities:** in blind audio/handling comparisons, Kite/Pip, Cairn/Torrent, Ribbon/Meridian and Ember/Needle are distinguishable. Full Sport upgrades do not make a Cairn turn or stop like a Needle. The gear sound changes on the same authoritative shift as the HUD.
- **Stunt intent:** single Space always gives immediate handbrake response; double Space/Q/touch toggle clearly arms Stunt; a first valid 180 can be done in the Breakyard without aerial controls. Invalid landings do not award a record. A 90 s valid drift is needed for ×5 regardless of frame rate or UI refresh.
- **Race fantasy:** first start spends five seconds preparing and launching, Retry spends three; the first corner is visible before GO. Rival contact stays physical, Cruise can be won in a stock starter, and winning Expert does not require an ad or a loaned premium car. Each of E01–E17 has a valid start, finish, reward and meaningful reason to exist.
- **Equal progression:** a ten-minute mixed driving visit falls within 2,400–3,600 Sparks for a competent beginner without ads, excluding clearly reported one-time rewards. Repeating the fastest drag or hub donut does not exceed 1.5× that activity median. A first paid Skiff is plausible in 1–2 visits, while a full fleet remains a substantial collection.
- **Walking with purpose:** each of the seven open doors leads to the described interaction, all eight puzzles are solvable with large touch targets and visible cues, and Call car never puts a car inside a room or forces a long walk back. Stillwater Village and the temple still look inhabited after a destructive drive elsewhere.
- **Every menu path:** on mouse and on a 360 px-wide touch viewport, buy a car, preview a tune without spending, visit the physical garage, call a car, pick a waypoint, fast-travel, retry a race, inspect a record, solve a clue and save a photo. Each has a visible way back, no required hover and no warped map.
- **Photo and save:** gameplay quality is restored after high-quality capture; a failed large capture keeps the composition. Reload after a car purchase, discovery, race result or ad grant retains exactly one reward. Returning to a changed world uses a safe saved fallback. Saved records identify car/setup/assists and are not overwritten by secret practice.
- **Acceptable monetization:** refusing all offers leaves the full catalogue and normal recovery accessible. Ad-unavailable/disabled states have usable buttons. No navigation action, fail, recovery or immediate Retry triggers a midgame ad, and the ordinary race prize is already saved before any offer.
- **Real density at speed:** pass the moving-route, cold-load, blocked-optional-download and sustained-phone checks above. Preserve street enclosure, ground-floor depth, landmark silhouettes and all destinations on Low/Minimal. Six posed hero views, a distant overview and the development GPU cannot establish acceptance.

The product test is concrete: one player leaves the bowl to chase a drift, another to make a mess, another to beat a lap, another to fill a postcard row. Each returns through the same believable landscape with a useful next choice and something worth saving.
