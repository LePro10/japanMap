# JapanMap TODOs

## table of contents:

- general bugs
- map bugs
- general feature requests
- map feature requests
- platform / release

## 1. general bugs:

### - Menu and ESC Logic:

- Currently when pressing ESC while the cursor still beeing on the Menu doesn't work. in general the menu needs to be improved. The actual new menu (tabs, shop, settings, analytics, photo mode, …) is specified under 3. Menu — this here is only the ESC / pause behaviour.
- Also when pressing ESC i want that while beeing in the Menu the car doesn't drive further. I want everything to be paused. also the pedestrians the physics the particles i think really everything. beeing ide like that for maye 30sec or something could also be nice to put the player in an afk mode where all graphics and map doesn't have to be renderd. but i don't know exactly how we could implement that, so when he recomes he doesn't have to notice anything different as he would just had paused the game for 10sec. (expect 1-3 seconds rerendering the map but not loading the game from 0)

- Right now when the player drives with full speed in his car and exits the car stops imediatelly wich already doesn't make much sense. But even worse is the fact that when the player want's to enter the car again it drives further like it was before (from 0 - full speed) from one frame to another. this really has to be fixed: the player should not be able to exit the car before it reached a speed with makes sence (for example 5km/h or something). and when entering the car it starts at 0km/h (physics and speed reseted).

### - Races:

- Right now all races are bugged. This is not a small polish, the whole race flow is broken and has to be redone until a race actually starts, runs and finishes like a race.
- At the start the cars don't spawn straight on the grid. They spawn crooked / rotated wrong. Every car (player and NPCs) has to spawn aligned on the start line, facing the right direction, before the countdown.
- Also when the countdown (3...2...1...) apears during this time you shouldn't be able to do a early start and just drive (wich is possible currently)
- NPCs in races are too weak / too slow / not really racing. They should be better drivers and faster so a race actually feels like a race, not like driving past statues.
- Collision during races has to stay — this is the opposite of ghosting. You should be able to ram NPCs and knock them out of the way ("wegschallern"). Right now that isn't really there. Terrain and world collision stay as they are; we are not making cars pass through each other.

### - Pickups:

- When you collect the current "yen" pickups they sit half inside the ground and look glitched. That's a placement / animation bug and has to be fixed independently of the new currency (the currency itself is under 3. General).

## 2. map bugs:

- the bridge from the highway to the tokyo city has a transparent fundament and also when driving into it you get glitched on top of the bridge. also in general the bridge shouldn't be a bridge at all because it doesn't look quite good.
- all ramps distributed accross the map should be removed and replaced with better ones (first physics should be improved) and then update their form and design and also place them to some usefull places.
- the water on the ricefield is sometimes too high so the car looks too sunken and also when you look from the side sometimes you can see under the water because at the start of the ricefield step there is no dirt covering that.
- there is a river on the mountain wich looks horrible right now. its only a 2d "paper" wich you can't even see when going up the mountain pass but feel because at one place you are stuck. but because the "river" is above you you can't see it. here the river has to change its place / form or create a small bridge for the mountain pass at the collisioning spots.

## 3. general feature requests:

### - Physics and Controls

- add the feature to double press space wich unlocks a FULL Drift mode. similar to the already existing single space press with puts the player into a drift mode. But in this new mode you should be much more free to hit crazy stunts for example 180, 360ies wich is currently not possible in the "single space press mode". this mode should be called "Stunt mode" and should be really enjoyable for the players.
- when beeing in the charachter mode (after you exit the car) the player should be able to press CTRL while the terrain is straight or going downwards. Should basically function exactly the same as the "sliding" feature in Fortnite.
- The "breaking" feature should be improved. Right now we can only break the things on the side of the road and the trees. but i want that these things near the road break about 50% lighter and the trees about 25% faster. Then i want that you add that break effect to bascially all objects arround the map except the really big towers in tokyo. but also the small snack automates and so on they should break into pieces or also these small houses on the ricefield, basically everything. also i want that the trees or the houses don't disapear when you drive into it instead it should really fall down into its pices (for example the house should fall into its rectangles and all elements). the same for trees and so on. can be a little compromised for performance but should be more realistic.
- Offroad physics should be improved, but in a simple way: you should be able to drive basically everywhere on the map. Not through walls or cliffs — the traction limit still exists — but dirt / grass / hills shouldn't feel like a trap. The car should keep moving instead of getting stuck or crawling.
- At full speed on normal roads the cars need more grip / better ground contact. Right now they feel like they lose the road. This should apply to every car; the racecar can have even more on top of that.
- Each car needs its own physics, not a reskin of the same handling. Default values (weight, grip, acceleration, braking, steering, …) should actually be calculated / set per car so a truck feels heavy and a racecar sticks. Tuning and upgrades then modify those defaults — they shouldn't replace a missing identity. The racecar especially should have clearly better ground contact / grip than the offroader or the truck.

### - Tuning & Upgrades

- add the option to tune all cars. for a first version keep it relatively simple. you should be able to upgrade engine brakes stearing and maybe grip or a few things like that. with also a little incremental prices and cool animations and visuals. (all vailable in the tuning and upgrades garage at the spawn).
- Tuning has to sit on top of the per-car defaults from Physics. When you upgrade engine / brakes / steering / grip, you are changing that car's calculated base values, not a generic shared spec. Weight and the other defaults stay part of the car's identity unless a tune explicitly changes them.

### - Cars / Assets

- The current cars are not enough. I want a lot more cars, and they should look realistic (real-world-like road / sports / offroad cars, not placeholder boxes). The existing four should be replaced with proper models, and on top of that there should be many more buyable cars in the auto house. This is a big content piece, not just swapping textures on the current four.

### - Menu

This is not a polish of the current ESC menu. I want a completely new game menu. Simple, really easy to use, looks good, and the average user can find anything they want. Looks and feels have to match the rest of the game.

The menu should be built around tabs (names can be nicer, the structure is what matters):

- **Play / Continue** — back into the game. This is also where ESC-pause lives (see 1. Menu and ESC Logic: everything paused).
- **Shop** — cars you can buy, cars you already own. From a car you can go straight into tune with that car already selected. Somewhere in here (or in Garage) there has to be spawn / enter the car next to the character.
- **Garage / Tuning** — option to directly enter the upgrades and tuning garage in the lobby, but directly in the dialog where i can tune and upgrade and everything. Teleporting directly as a character to the auto house where you can see and buy all cars.
- **Map** — option to open the minimap. Option to teleport to the lobby.
- **Photo Mode** — opens the photo mode (see below). Has to be reachable from this menu, not only a secret key.
- **Analytics** — longest airtime, fastest speed, and similar records. What would be cool: when we hit a record while we are driving we get some coins / money and also create a small screenshot which is visible in the analytics menu afterwards.
- **Settings** — controls, sensitivity, graphics, etc. Also custom keybinds so the player can remap the important actions.

On top of the menu, while you are on foot (character mode), there should be a button to teleport your car to you. The car should spawn just beside the character. This is the "i walked away and want my car back" button, not only an option buried in the garage tab.

### - Photo Mode

- Implement a photo mode and put it in the menu (see Menu tab above). In this mode the camera is free, the world is paused, there is a render button, and that render runs at high / ultra — not the current gameplay quality. Then you can download the image as a PNG. v1 does not need filters / time-of-day / a full Forza photo suite. Pause + free camera + high quality render + download is the feature.

### - General

- add a half circle with the current gear maybe nitro and a cool thing like in high end cars
- we already have the feature for "og123" (when pressing on japanMap logo). I want that when this mode is active you have unlimited turbo nitro when pressing "shift".
- keep the drift multiplier cap at 5x — that max is good. what has to change is the climb: from 2x on it should take exponentially longer to get there, so 5x is a long-run thing, not something you hit in a short session. on top of that cars and upgrades have to be more expensive. the economy should make the player grind a good while for the next car / tune, but not so long that they quit because nothing moves. same curve for upgrades and tuning.
- Replace Yen with our own in-game currency. Not Yen, not USD — something unique that feels cool and fits the game (name still open). Collecting it needs a proper animation and a readable icon, not the current half-glitched pickup. The clipping bug itself is under 1. Pickups; this here is the currency + how collecting should feel.

### - Sound

- Currently we already have sound effects for the engine and i think also drifting (not sure). But the overall sound-/effects has to be improved by a lot. First the raw engine sound when driving really sounds like ai slop audio. its good that it sounds different when just putting another gear in yk. but the problem is just the sound itself. also i want that each car have different engines and different sounds. now we are also able to see the gears it should be synced perfectly with the sound. but i want that the sound somehow is "rendered" (efficiently of course). because later when we tune the cars and upgrade the engine i want that the player hears a real difference. its a small detail wich directly makes the game feel premium without realising it.
- we also need drift / environment sounds. when drifting its pretty obvious what a player expects in terms of sounds. but also when we drive in water or on dirt the drift should combine with the sound from the surface we are currently driving on (when drifting)
- add sounds for all collisions. for example when breaking a tree, a small house or just crashing inside a big tower or a rock the sounds should perfectly fit to the current speed and angle you are hitting the object / entity. also when hitting a pedestrian.
- add a background noise wich is not annoying by any way but idk maybe a mix of a music a little wind or a very quit rain drop sound. but it should vary and not be a constant pressure on your ears.

## 4. map feature requests:

### - "Tokyo City"

- increase the size of the city by adding more buildings streets parks and more. (take some inspiration from forza horizon 6). this also helps to solve the problem that the map is too empty. we have enough place so why we don't use it?
- change the look from a boring city wich looks generic and always the same to a really dynamic city with many grocery stores, pedestrians, snack or drink automates, a few npc cars (with collision but should be easy to push them away so players still enjoy it), restaurants good lightning and also small but meaningfull details. the goal is to show all highlights from tokyo in the city for example shibuya crossing. and no we are not going to put 1000 pedestrians but maybe a few the goal is to drift there. so basically really take serious inspiration from the forza horizon 6 map. When rolling over a pedestrians it should not just drop flat to the bottom it should really "feel" the knockback and for example when driving with full speed the pedestrians should almost fly. just make them realistically but no big real collision (don't make it that the player looses to much speed but a little pysical collision should be there)
- now that we have the feature to exit the car and walk arround it should also be able to go inside these restaurants and grocery stores. no real functionality for now but we should be able to to explore the map and entertain the user further.
- make the cherry trees like all other trees (same opimizations when beeing wide away). and also breakable like the other trees.

### - Lobby / Spawn

Right all players spawn in the middle of the cherry tree circle.

- The Goal is to create a small lobby / hub there. there you should have the option to walk into a car store and buy cars directly, it should also filled with pedestrians and cool japan themed buildings but not like tokyo. a little different a little more open but still visual stunning. because thats the first thing the player sees when he joins the first time. he really needs to be impressed by the looks of the map / lobby. also there should be a tuning or upgrades garage where you can drive in with your car and tune or upgrade you car.

### - General

- add a cozy but visual stunning town (fishing village) like we see it in games or photos. there should be some rightly themed pedestrians doing there work. this place should be the most beatiful of the entire map. Players should come there to explore it and have to be really impressed. really add many visual impressing details for example a little river with a water wheel going inside a house. maybe a small farmland or a few animals. really give attention to detail there and cook. i think the best spot to place it is to replace a piece of the riecefield or put it nearby. it should just fit perfectly in the environment.
- add a cool f1 track somewhere in the map. it shouldn't really collide with other current highways but maybe we can still do a crossing or more bridges. in the f1 track its important that you automatically have about 50% better grip compared to normal streets (doesn't matter wich car you drive but this can imrpove grip even more so don't fix this value) and there should be a very long straight part where the players really can test their cars to full speed. maybe the f1 track could also be integrated in a tunnel or a few parts at least or come from behind the mountains or something. also take some inspiration from forza horizon 6.

- we need to improve the density over the entire map. right now we have many empty maps and just generic repetitive trees. i want to create a map wich is extremely entertaining with for example a small stunt park in the middle or tempels or idk some hidden easter eggs wich are not just a stone with a pole i want that the player is really getting entertained and popping dopamine when finding something. maybe it would be cool to create like small minigames at these eastereggs. take some inspiration from forza horizon 6. like getting a card where a red x is on the map and going there or a small hint idk. we really need to take inspiration from the forza game and also be creative and think what could make the game overall combine with the map better and entertaining the player as much as we can.

### - Zones and Minimap

Right now we already have a Minimap but it should be improved along with adding the different Zones.

- Add different Zones. There Should be something like 4-8 differnt Regions wich makes sense. for example: For these "spots" there should be a region: the city, the ricefield, the mountain and pass, the beach to the atlantic, spawn etz. but you know we need to be creative with the names and not just call it "spawn zone" because thats boring and maybe the zone is also a little bigger than just the spawn / lobby. also its important than like in forza horizon 6 there can't be a place wich is not in a zone. the zones are distrobuted trough the entire place.
- Bei der ersten Endeckung bzw Betretung dieser Zone sollte sowas kommen wie "{Region_name} explored! \n you explored 3/X Zones" und dann zb eine Belohnung in der eigenen Währung (nicht Yen, nicht USD).
- The minimap has to show these zones, not just a flat map. Color the zones so you can read the map at a glance, and put small icons on the important spots (ricefield, city, spawn / lobby, mountain, beach, …). Icons should be hoverable and clickable (e.g. to see the zone name or jump the view there). And the minimap must not stretch / warp on different devices — phone, tablet, desktop all get a correct aspect, not a squeezed map.

## 5. platform / release:

### - CrazyGames

- Integrate the official CrazyGames SDK (user, cloud save, gameplay events / loading).
- The current GitHub-hosted build MUST keep working until we actually submit to CrazyGames. Don't break internal / GitHub paths for the SDK. The CrazyGames path fixes are for the submission build; until then GitHub has to stay playable as it is now.
- The CrazyGames build currently has wrong asset paths (internal / GitHub). That has to be fixed for the submission, without taking down the GitHub version. (just document everything)

### - Persistence

- Nothing is saved between sessions right now, so there's no reason to come back. Cars, upgrades, money, unlocks and stats have to survive a reload. This should go through CrazyGames cloud save (not only localStorage). GitHub / local play still needs a fallback so it works before the CrazyGames submit.

### - Localization

- Everything that is still German has to be English: player-facing UI, error messages, and console.log / console output. This is an international CrazyGames game.

### - Mobile

- The mobile version has to be first-class, not an afterthought. Both the touch UI / layout AND performance. Average phone users should be able to find everything and the game should actually run.

### - Textures

- Re-encode textures to KTX2 to improve quality and performance.
