# JapanMap TODOs

## table of contents:

- general bugs
- map bugs
- general feature requests
- map feeature requests

## 1. general bugs:

### - Menu and ESC Logic:

- Currently when pressing ESC while the cursor still beeing on the Menu doesn't work. in general the menu needs to be improved.
- Also when pressing ESC i want that while beeing in the Menu the car doesn't drive further. I want everything to be paused. also the pedestrians the physics the particles i think really everything. beeing ide like that for maye 30sec or something could also be nice to put the player in an afk mode where all graphics and map doesn't have to be renderd. but i don't know exactly how we could implement that, so when he recomes he doesn't have to notice anything different as he would just had paused the game for 10sec. (expect 1-3 seconds rerendering the map but not loading the game from 0)

- Right now when the player drives with full speed in his car and exits the car stops imediatelly wich already doesn't make much sense. But even worse is the fact that when the player want's to enter the car again it drives further like it was before (from 0 - full speed) from one frame to another. this really has to be fixed: the player should not be able to exit the car before it reached a speed with makes sence (for example 5km/h or something). and when entering the car it starts at 0km/h (physics and speed reseted).

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

### - Tuning & Upgrades

- add the option to tune all cars. for a first version keep it relatively simple. you should be able to upgrade engine brakes stearing and maybe grip or a few things like that. with also a little incremental prices and cool animations and visuals. (all vailable in the tuning and upgrades garage at the spawn).

### - Menu

- right now we have our menu (when clicking esc but its not quite user friendly and and UX conform.) i want a simple but really easy to use game menu wich looks good but also where the average user can find anything he wants. i just want that the looks and feels are matching with the rest of the game.
- options wich needs to be available in the menu (optional to add more):
  settings for controls sensitvity graphics etz.
- option to open the minimap
- option to teleport to the lobby
- option to directly enter the upgrades and tuning garage in the lobby but directly in the dialog where i can tune and upgrade and everything,
  teleporting directly as a charchter to the auto house where you can see and buy all houses.
  option to change cars and also see cars you already have. then when i click on a car i should also be able to go to tune and already have the selected car selected, also somewhere should be a option in this to spawn the car or enter the car where the charachter currently is. best is i think that the car spawns just beside the character, also an option in the menü somewhere should be a analytics option where we can see cool stuff like longest airtime fastest speed. and what would be cool when we hit that while we are driving we get some coins or money and also create a small screenshot wich is visible in the analytics menu afterwards.

### - General

- add a half circle with the current gear maybe nitro and a cool thing like in high end cars
- we already have the feature for "og123" (when pressing on japanMap logo). I want that when this mode is active you have unlimited turbo nitro when pressing "shift".
- lower or slow down the drift multiplicator. currently i think 5x is the max wich is good but it should go much longer until you are there (exponentially longer from 2x on). also think a little more about the general economy system. that the players has to play long for getting something but at the same time not too long that he quits the game too early because its boring yk. the same for upgrades tuning etz.

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
- Bei der ersten Endeckung bzw Betretung dieser Zone sollte sowas kommen wie "{Region_name} explored! \n you explored 3/X Zones" und dann zb + 100$ oder sowas.

neu:

collision bei races weg "bumben"

nichts wird gespeichert zwischen sessions. kein grund zurückzukommen missionen daily rewards die incrementell sind zb tag 2 100x guthaben usw alles in cloud save.
leaderboard mit namen online cloud save)

alles alles was german ist ins englische übersetzen (fehlermeldungen)
auch console log in englisch machen

mobile version optimieren

yen in dollar oder so ändenr.

background sound wie regen oder so windig atmoshpäre

photo mode implementieren. mit render button und das dann auf ultra oder hoch rendern. und downloaden

crazygames tool kit (sdk?)

build for crazygames internally falsche paths auf github

texture quality in ktx2 re-encoden um qualität zu verbessern und performance zu optimieren

kleiner analytics tab mit stats (zb max speed longest airtime usw)

allgemeines menü mit tabs shop und settings optimieren (evtl sogar custom keybinds)

beim start von races grade spawnen und npcs besser schneller

beim einsameln von "yen" bessere währung und bessere animation und nd so halb verglitcht im boden.

button um sein auto zu sich zu teleportieren wenn man mit character unterwegs ist.

offroad physics improven eher einfach und das ich überall bsl durchfahren kann.

minimap mit dne zonen einfärben nicht verzogen auf verschiedenne geräten und mit kleinen icons ausstatten zb reisfeld oder stadt oder spawn und anklickbar also hoverbar.

drift multiplikator kleiner oder autos teurer machen

auto assets erstellen

mehr gripp bei fullspeed bessere bodenhaftung

andere physics bei anderen cars (bessere bodenhaftung bei dem racecar)
