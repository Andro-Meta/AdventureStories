// storyHooks.js — Phase 3.5 follow-on.
//
// THE PROBLEM
// The narrator (Gemma-3n-E4B) has strong priors toward certain plot tropes —
// "Sunken Library", "Heart of Shadow", "Shadow Blight", "ancient evil
// awakens" — that bleed into EVERY playthrough regardless of theme. Two
// dinosaur-themed runs produced near-identical openings about a Sunken
// Library; that breaks replayability.
//
// THE FIX
// Pick a random STORY HOOK at game start. The hook is one of ~10 archetypes
// tailored per theme. We pass the hook into the initial-story prompt, AND
// we explicitly forbid the trope words the model loves to default to. The
// narrator gets clear setup material that's different every run.
//
// HOOK ARCHETYPES (theme-agnostic high-level shapes):
//   - "stranger_arrival" — someone new shows up with information / a problem
//   - "ancient_awakening" — something dormant becomes active
//   - "missing_person"    — a known individual has vanished
//   - "festival_disrupted"— a celebration is interrupted by intrusion
//   - "found_object"      — player discovers something with consequences
//   - "prophecy_named"    — old foretelling names the player
//   - "rival_emerges"     — a competitor or enemy makes their move
//   - "natural_disaster"  — environment itself becomes the threat
//   - "treasure_rumor"    — word of something valuable + dangerous
//   - "betrayal_revealed" — someone trusted is not who they seemed
//
// Per-theme, we describe WHAT each archetype LOOKS LIKE in that theme so the
// narrator has concrete imagery to anchor on. No more "Sunken Library" by
// default — the hook IS the inciting incident.

const ARCHETYPES = [
    'stranger_arrival',
    'ancient_awakening',
    'missing_person',
    'festival_disrupted',
    'found_object',
    'prophecy_named',
    'rival_emerges',
    'natural_disaster',
    'treasure_rumor',
    'betrayal_revealed'
];

/**
 * Theme → archetype → concrete-flavor descriptor. The narrator gets the
 * descriptor verbatim as part of the initial-story prompt; it sets the
 * inciting incident without dictating exact words.
 *
 * Keep these crisp and concrete (one sentence each). The narrator inflates
 * them into prose. Vocabulary that's UNIQUE TO THE THEME is the goal —
 * dinosaur descriptors should never sound generic-fantasy, etc.
 */
const HOOK_FLAVORS = {
    fantasy: {
        stranger_arrival: 'A hooded courier collapses at the village gate, clutching a wax-sealed missive bearing the king\'s broken sigil.',
        ancient_awakening: 'The standing stones at the edge of the moor have begun to hum at midnight, and the old wells are running dry.',
        missing_person: 'The miller\'s daughter went into the woods three days ago to gather mushrooms and never came back. Her empty basket was found at the treeline.',
        festival_disrupted: 'The harvest festival\'s prize bull was found dead in the square at dawn, throat untouched but eyes white as boiled eggs.',
        found_object: 'You unearthed a tarnished bronze coin in the field today; touching it makes your teeth ache and you can faintly hear voices speaking a language you do not know.',
        prophecy_named: 'The hedge-witch called you to her hut last night and whispered a verse from the Old Book — your name, and a date three weeks hence.',
        rival_emerges: 'A noble\'s second son has ridden into town with a retinue of foreign mercenaries, claiming the deed to your family\'s land by right of the new charter.',
        natural_disaster: 'A black river of ash has begun flowing east from the mountains, killing crops on contact. Cattle won\'t cross it.',
        treasure_rumor: 'A drunken peddler in the tavern swears the old hilltop tomb opened on its own this winter, and that something gold-plated is visible just inside the entrance.',
        betrayal_revealed: 'The town magistrate — your father\'s oldest friend — has been signing arrest warrants in the names of farmers who refused his "land protection" tithe.'
    },
    dinosaur: {
        stranger_arrival: 'A scout from a distant tribe staggers into your clearing, body marked with claw-strike patterns from a predator no one in living memory has seen.',
        ancient_awakening: 'The geyser fields north of camp have begun erupting in a regular pattern — every seventeen heartbeats — and the ground itself trembles in answer.',
        missing_person: 'Your sister-of-the-hunt set out at first light to track a wounded ankylosaur and has not returned by moonrise. Her territory-marker carving is gone from the stone.',
        festival_disrupted: 'During the great migration-feast, the herd of titanosaurs the tribe was driving suddenly stampeded south, leaving fresh blood on the trampling-stones — something terrified them.',
        found_object: 'In the riverbed today you found a perfectly round stone, warm to the touch, with shapes inside it like trapped lightning. Birds will not approach it.',
        prophecy_named: 'The wise-mother of the tribe took you aside, looked at the markings on your arm — the ones from birth that nobody could read — and named them for the first time.',
        rival_emerges: 'A rival tribe led by a woman who paints her face with raptor-feathers has claimed the southern hunting-grounds, and has set spear-bearers along the boundary stones.',
        natural_disaster: 'The mountain that has always smoked is now bleeding fire down its eastern flank, and a hot wind carries the smell of cooking flesh from the valley below.',
        treasure_rumor: 'A wandering trader brought obsidian shards he claims came from a cave where the walls glow at night, deep in territory the great predators rule.',
        betrayal_revealed: 'The chieftain\'s son has been trading with the rival tribe in secret — you saw him this morning at the boundary stones, handing over a clutch of your tribe\'s sacred eggs.'
    },
    space: {
        stranger_arrival: 'A derelict escape pod docks at your station, transponder silent. The single passenger is unconscious, wearing a uniform from a fleet that was scuttled twenty years ago.',
        ancient_awakening: 'The dark side of the third moon has started broadcasting on a frequency no current civilization uses. The signal repeats every seventy-three minutes.',
        missing_person: 'The xenobiologist on the station\'s lower deck failed to clock in this morning. Her cabin is locked from the inside but life-signs read empty.',
        festival_disrupted: 'During the founders-day broadcast, the system\'s primary star flickered — actually flickered — for almost a full second. Nothing in physics says that\'s possible.',
        found_object: 'A cargo manifest miscategorized a small black cube as a paperweight. It has no mass when you hold it. It hums when you set it down.',
        prophecy_named: 'The station\'s ancient astrogator AI — supposedly retired a decade ago — just sent you a personal message containing the exact navigation coordinates of a star that doesn\'t exist on any chart.',
        rival_emerges: 'A corporate frigate has dropped out of jump in this sector flying colors no one can identify, and they\'ve filed a salvage claim on your home asteroid.',
        natural_disaster: 'A solar flare three magnitudes above predicted maximum will hit your habitat in twenty-six hours. Shields are rated for eighteen hours of exposure.',
        treasure_rumor: 'A drunk freighter pilot at the station bar is showing off a fragment of pre-collapse alloy and saying he can fly you to where it came from — if you can pay, and if you don\'t mind that he\'s only made the trip once and his crew didn\'t come back.',
        betrayal_revealed: 'Your station\'s deputy administrator has been routing supply shipments through a shell company that traces to a foreign intelligence service.'
    },
    pirate: {
        stranger_arrival: 'A man in a tattered captain\'s coat washed up on the harbor steps at dawn, mumbling coordinates and the name of a ship that sank fifty years ago.',
        ancient_awakening: 'The old idol that fishermen offer salt to has cracked down the middle, and the tide refuses to retreat from the harbor wall.',
        missing_person: 'The harbormaster\'s wife has not been seen in a week. Her wedding ring was found pressed into the wax of a candle on the lighthouse stairs.',
        festival_disrupted: 'During the Saint-of-Sailors procession, the lead cog took on water at the harbor mouth despite a clear hull — and the priest aboard refuses to say what he saw before he jumped.',
        found_object: 'In your nets today you hauled up a brass spyglass with no maker\'s mark. Looking through it shows you ships that are not there.',
        prophecy_named: 'A blind cartomancer at the dockside fair flipped the Drowned King twice in your reading, and asked your name with a tremble in her voice.',
        rival_emerges: 'A frigate flying no flag has dropped anchor outside the harbor and is hailing only one captain by name — yours, somehow.',
        natural_disaster: 'A red tide has rolled into the bay overnight, killing every fish in the shallows. The wind tastes of copper.',
        treasure_rumor: 'A one-eyed cooper in the Boar\'s Head tavern swears he saw the lights of an unknown ship anchored over the Black Reef three nights running, and that they were lowering boats both nights.',
        betrayal_revealed: 'The first mate of your ship has been sending letters to the colonial governor for months, sealed with a wax that doesn\'t match any merchant house you know.'
    },
    underwater: {
        stranger_arrival: 'A bottlenose dolphin has been pacing your settlement for three tides, carrying a slate of script no current scholar can read.',
        ancient_awakening: 'The hydrothermal vents east of the colony have started pulsing in a rhythm that matches your heartbeat exactly.',
        missing_person: 'A diver from the cultivation team failed to surface yesterday. Their tether was cut clean, not torn.',
        festival_disrupted: 'During the spawning-festival, every krill cloud in the bay turned and fled at once — swimming TOWARD shallow water.',
        found_object: 'The tide brought a smooth black scale onto the kelp-bed today. It\'s warm. It\'s the size of your palm. Nothing native is that big.',
        prophecy_named: 'The eldest in the colony pressed a piece of carved bone into your hand last night and said, "the song asked for you by name."',
        rival_emerges: 'A neighboring colony has begun harvesting on your reef-side of the boundary, and they have brought weapons that do not look hand-made.',
        natural_disaster: 'A current shift has begun pushing cold deep-water into the coral gardens, and three of the shallow lagoons have already gone silent.',
        treasure_rumor: 'A seer in the colony has dreamed three nights running of a sealed grotto deep in the trench, and on this morning\'s tide a piece of worked metal washed up that came from down there.',
        betrayal_revealed: 'A scout from your own pod has been guiding outsiders to your spawning-grounds — you found the markers they left in places only your kind knows.'
    },
    jungle: {
        stranger_arrival: 'A wounded explorer crawls into your camp at dawn, raving about glyphs that move and a temple where the wrong shadow follows you home.',
        ancient_awakening: 'The howler-monkey colonies that surround your village have gone silent for the first time anyone can remember. The silence began at the same instant in every direction.',
        missing_person: 'The shaman\'s apprentice went to gather ayahuasca three suns ago. Her satchel was found at the river\'s edge, beads cut from the strap.',
        festival_disrupted: 'During the rains-blessing, the river ran briefly with a green far brighter than algae ever produces, and three of the dancers fell into trances that lasted hours.',
        found_object: 'You followed an unfamiliar bird into the brush this morning and found a stone disc carved with constellations, half-buried, glass-smooth on top.',
        prophecy_named: 'The jaguar-priest, who has not spoken your name in forty years, called for you specifically, and asked if you have started dreaming of the high temple.',
        rival_emerges: 'A logging-camp at the river\'s mouth has begun sending men UP-river instead of down, and they aren\'t carrying axes — they\'re carrying surveyor\'s instruments.',
        natural_disaster: 'A new mosquito has appeared with the rains — jet black, with a sting that makes the bitten weep blood. They follow human voices.',
        treasure_rumor: 'A hunter found cut stone steps under tree-roots last week, and the village elders argued for a full evening before forbidding anyone to return.',
        betrayal_revealed: 'The mission-priest who has been "translating" tribal documents to the governor has been writing entirely fabricated tribute demands in your tribe\'s name.'
    },
    arctic: {
        stranger_arrival: 'A sled-team arrived at first dawn carrying one survivor, frostbitten silent, with a charcoal map and the word "south" repeated on the back of every page.',
        ancient_awakening: 'The thunder-ice has begun cracking out of season — great booming reports across the bay every dusk.',
        missing_person: 'A hunter and her two dogs went out two days ago and have not returned; her tracks were found going INTO a lead in the ice that should not have been there.',
        festival_disrupted: 'During the long-night feast, the aurora flashed in colors no one has names for, and the elders refused to meet your eyes when you asked what it meant.',
        found_object: 'You chipped open a fish today and found inside it a polished ivory bead carved with a face. The fish was caught a thousand miles from where bone-carvers work.',
        prophecy_named: 'The shaman pulled you aside during seal-cutting and asked, very quietly, when you began dreaming about the dark place under the ice.',
        rival_emerges: 'A coastal whaling ship from a far nation has anchored off your hunting grounds and is harvesting in your protected waters.',
        natural_disaster: 'A warm current has appeared where none should be; the sea-ice is thinning by the day and the seals are migrating in confusion.',
        treasure_rumor: 'A trader from the southern villages has been showing off a coin made of metal that doesn\'t freeze in winter. He says it came from a cave below the eastern ice-shelf.',
        betrayal_revealed: 'A trusted hunter has been guiding the foreign whalers to your seal-haunts in exchange for goods only southern traders sell.'
    },
    steampunk: {
        stranger_arrival: 'A clockwork courier arrived at your workshop this morning with a sealed letter — the seal bears the crest of a guild that was disbanded thirty years ago.',
        ancient_awakening: 'The Great Engine in the city center, retired since before your grandmother\'s time, has begun emitting steam at regular intervals. Nobody has the keys to its boiler-room.',
        missing_person: 'A respected airship-engineer failed to disembark from the morning packet, though manifests confirm she boarded. Her brass goggles were found on the platform.',
        festival_disrupted: 'During the Mayoral procession, the lead automaton\'s programming card ejected itself — which is impossible — and the punched holes spelled out a name when held to the light.',
        found_object: 'You pulled a small clockwork heart out of a pawnshop bin yesterday. It still ticks, on its own, with no key.',
        prophecy_named: 'A retired difference-engine programmer from the war years sent you a calling-card with your full name, your address, and a date three weeks hence — and you have never met her.',
        rival_emerges: 'A foreign industrialist has bought up every rival workshop in the district, and has just made an unsolicited offer for yours.',
        natural_disaster: 'The fog over the city has not lifted for nine days, and people walking into it have begun returning hours later with no memory of where they\'ve been.',
        treasure_rumor: 'A drunken air-rigger in the dockside pub claims he saw a derelict skyship lodged in the chimneys of the Old Quarter, and that the colors on its hull match a pirate flag from the last war.',
        betrayal_revealed: 'Your business partner has been selling your workshop\'s secret schematics to a competing concern across the river.'
    },
    haunted: {
        stranger_arrival: 'A black coach arrived at the manor gates at midnight; the driver said your name, refused to come to the door, and was gone by sunrise.',
        ancient_awakening: 'The portraits in the long gallery have begun to weep — actual moisture, in actual streaks — and only at three in the morning.',
        missing_person: 'A guest at the manor went to bed two nights ago and has not been seen since. Their room has been locked from the inside the entire time.',
        festival_disrupted: 'During the masquerade ball, every clock in the manor stopped at the same instant — and a guest in a stag-mask was counted leaving who no one remembers inviting.',
        found_object: 'A yellowed photograph fell out of a book in the library today; the figure in it is unmistakably you, but the date written on the back is a hundred years ago.',
        prophecy_named: 'The medium your aunt insists on hiring asked for you specifically tonight, and during the seance she went pale and would not say what came through.',
        rival_emerges: 'A distant cousin you never knew you had has produced a will naming her sole heir of the manor — dated AFTER your grandfather\'s death.',
        natural_disaster: 'The fog rolling off the lake has begun forming shapes — reaching shapes — and three farmers have been found cold in their fields, perfectly intact, just dead.',
        treasure_rumor: 'A folio of sealed letters in the manor\'s lower library has just become unsealed on its own; the topmost letter mentions a hidden chamber and your family\'s name.',
        betrayal_revealed: 'The housekeeper who has served three generations of your family has been holding seances in the wine cellar with persons she is not legally permitted to invite onto the property.'
    },
    cyberpunk: {
        stranger_arrival: 'A face you\'ve never seen pinged your private deck with a video file showing your own apartment — from inside, last night, while you were asleep.',
        ancient_awakening: 'A pre-collapse mainframe in the corp district just came back online after forty years dark, and it\'s requesting authentication from terminals that don\'t exist anymore.',
        missing_person: 'A friend went deep-link last week and never reconnected. Their meatbody is still breathing in a med-pod. Their account just sent you a message twenty minutes ago.',
        festival_disrupted: 'During the corp-jubilee broadcast, all five of the megacorp anchors blinked at the exact same instant — a deepfake tell, except the broadcast was certified live.',
        found_object: 'A street-runner left a chrome hex on your bartop and ghosted before you could speak. It\'s blacker than black on five sides and seamless on the sixth.',
        prophecy_named: 'A retired netrunner who hasn\'t left their stack in a decade just dropped your real name on a closed channel — you are not on any closed channel.',
        rival_emerges: 'A new ICE specialist has rolled into your district flying corp colors that don\'t exist in any registry, and they\'ve put a bounty on a job tag only you would recognize.',
        natural_disaster: 'A fleet of construction drones has begun dismantling occupied tenements in the lower district, paperwork-signed by an executive who reportedly died last month.',
        treasure_rumor: 'A fixer in the noodle bar swears there\'s a cache of pre-corp data eggs in an abandoned subway tunnel three districts over, and the bounty on it is ten years\' rent.',
        betrayal_revealed: 'Your runner-team\'s netrunner has been selling exit logs to a rival crew — you found the deposit pattern in the building\'s public energy use.'
    },
    wild_west: {
        stranger_arrival: 'A stranger rode into town today on a horse not from any of the local stables. He didn\'t talk. He left a folded paper on the bar with your name on it.',
        ancient_awakening: 'The old mine the town was built around — sealed since the cave-in — has cold air coming from the seal that smells like sulfur and wet copper.',
        missing_person: 'The schoolteacher hasn\'t opened the schoolhouse in three days. Her boarding-room door is locked. The window is open and the bed unslept-in.',
        festival_disrupted: 'During the town\'s founders-day rodeo, every horse in the corral spooked at once and all kicked the same direction — east, away from the church.',
        found_object: 'You pulled a tarnished pocket-watch out of the creek today; it\'s wound, ticking, and the engraved initials match a man buried in the town cemetery before you were born.',
        prophecy_named: 'The old Comanche woman who lives at the end of the gulley sent her granddaughter into town with a single message: she needs to see you before the next moon.',
        rival_emerges: 'A railroad surveyor has arrived with a federal contract claiming right-of-way through the heart of the town. The signatures on the document are illegible.',
        natural_disaster: 'A coyote-pack ten times larger than any anyone has seen has begun hunting in daylight at the edge of town, and they aren\'t hunting cattle.',
        treasure_rumor: 'A drifter at the saloon has a Spanish doubloon he claims came from a cave he found while sheltering from a dust-storm two days ride south.',
        betrayal_revealed: 'The sheriff has been taking payments from the cattle baron whose herd has been "accidentally" trampling the homesteaders\' fields.'
    },
    post_apoc: {
        stranger_arrival: 'A stranger walked out of the dust at the edge of camp at sundown carrying a working radio and a list of names. Yours was on it.',
        ancient_awakening: 'The old broadcast tower in the dead city has started transmitting again, on a frequency the radios in your camp shouldn\'t be able to receive.',
        missing_person: 'A scavenger from the south group went out alone three dawns ago and hasn\'t come back. Her gear was found arranged neatly at the perimeter, as if she\'d sat down to wait.',
        festival_disrupted: 'During the harvest-share gathering, every radio in camp picked up the same voice for ninety seconds — a voice nobody recognized, repeating coordinates.',
        found_object: 'You scavenged a sealed metal canister today; it contains a single intact pre-collapse photograph showing a building that, in this world, no longer exists.',
        prophecy_named: 'The old man who paints maps for the camp on scraps of plastic asked you, very specifically, when you were going to head north.',
        rival_emerges: 'A new gang has set up at the old gas station, and they\'re flying a colors no one in living memory has worn.',
        natural_disaster: 'The black rain has started falling on the eastern fields and the crops it touches turn to ash within hours.',
        treasure_rumor: 'A trader at the swap-meet had three working batteries and would not say where she got them — but she traded a map for a week\'s worth of food, and the map points to a sealed vault eighty miles east.',
        betrayal_revealed: 'The camp council has been quietly negotiating with the warlord whose territory borders yours, offering up the names of "troublemakers" in exchange for safe passage.'
    },
    future_utopia: {
        stranger_arrival: 'An unknown citizen — no public profile, no civic-mesh footprint — walked into your atrium today and asked for you by your hidden personal address.',
        ancient_awakening: 'A pre-Reformation server farm in the old archives has started drawing power again, and its systems are running protocols the Civic AI quarantined a century ago.',
        missing_person: 'A friend from your collaborative-design pod hasn\'t logged into the civic mesh in four days. Their welfare-check ping says "well, at home" but their door doesn\'t open.',
        festival_disrupted: 'During the Reaffirmation Day broadcast, the Civic AI paused for a half-second before its closing remarks. It has not paused, ever, in fifty-seven years of recorded broadcasts.',
        found_object: 'You picked up a tiny silver disc out of the mulch in the public garden today; the Civic AI recognizes it but won\'t tell you what it is.',
        prophecy_named: 'A retired civic-historian from the early Reformation invited you to tea and casually told you that your bloodline is on a list she has been keeping for three decades.',
        rival_emerges: 'A new political faction has begun publishing manifestos using the public-broadcast channel — manifestos that argue for the dismantling of the very Civic AI that allows them to publish.',
        natural_disaster: 'The civic-engineered weather has begun glitching: a cold rain in mid-summer, hail that fell upward for twelve seconds, fog that smells of antiseptic.',
        treasure_rumor: 'A historian in your district has located the sealed records vault from the Reformation War and confirmed it can be opened — but only by a citizen with a very specific civic-trust score, and you are one of three eligible.',
        betrayal_revealed: 'A respected member of your collaborative pod has been quietly editing public records to make minor inconveniences they caused other citizens disappear.'
    },
    custom: {
        // Custom themes use a placeholder; the narrator gets the user's
        // freeform description and improvises within the chosen archetype.
        stranger_arrival: 'A stranger arrives, carrying news that demands an immediate response and that only the player is positioned to act on.',
        ancient_awakening: 'Something dormant in the world has begun to stir; small signs accumulate that something old is becoming active again.',
        missing_person: 'Someone known to the player has disappeared under unusual circumstances; there are clues but no clear answers.',
        festival_disrupted: 'A planned communal celebration is interrupted by an unsettling event nobody can yet explain.',
        found_object: 'The player discovers an artifact, document, or trace evidence that shouldn\'t exist where they found it.',
        prophecy_named: 'A respected figure with knowledge of old forecasts identifies the player as a key figure in events still to come.',
        rival_emerges: 'A new antagonist or competing power makes a move that directly threatens the player\'s situation.',
        natural_disaster: 'The environment itself becomes a threat — something has shifted in the world\'s natural order.',
        treasure_rumor: 'Word reaches the player of something valuable, hidden, and dangerous to retrieve.',
        betrayal_revealed: 'Someone the player or community trusted is exposed as having a secret agenda.'
    }
};

/**
 * Trope words/phrases the narrator over-defaults to. Forbidden unless the
 * theme actually warrants them. Folded into the system prompt so the
 * narrator avoids "Sunken Library" and "Heart of Shadow" type fallbacks.
 */
export const FORBIDDEN_TROPES = [
    'Sunken Library',
    'Heart of Shadow',
    'Heart of Darkness',
    'Shadow Blight',
    'the Heart of',
    'Whispering Woods',
    'Whisperwood',
    'the Old Book',
    'the Ancient Evil',
    'the Chosen One'
];

/**
 * Pick a random hook archetype + theme-specific flavor for a new game.
 * Called once at game-init; persisted on gameState.storyHook.
 *
 * @param {string} theme - gameState.adventureTheme (e.g. 'dinosaur', 'space')
 * @param {string} customDesc - gameState.customThemeDescription (used when theme==='custom')
 * @returns {{archetype: string, flavor: string, themeForFlavor: string}}
 */
export function pickStoryHook(theme, customDesc) {
    const archetype = ARCHETYPES[Math.floor(Math.random() * ARCHETYPES.length)];
    const flavorMap = HOOK_FLAVORS[theme] || HOOK_FLAVORS.fantasy;
    const flavor = flavorMap[archetype] || HOOK_FLAVORS.fantasy[archetype];
    return {
        archetype,
        flavor,
        themeForFlavor: theme,
        customDesc: customDesc || ''
    };
}

/**
 * Build the prompt fragment that injects the chosen hook into the
 * initial-story call. Use this verbatim in the narrator's user-content
 * prompt at game start.
 */
export function describeHookForPrompt(hook) {
    if (!hook) return '';
    const customLine = hook.customDesc
        ? `\nThe player's custom theme description: "${hook.customDesc}". Honor this — use vocabulary, props, and conflicts native to that setting.`
        : '';
    return `\n=== STORY HOOK FOR THIS RUN (use this as the inciting incident) ===
Archetype: ${hook.archetype}
Concrete inciting incident: ${hook.flavor}
${customLine}
DO NOT default to library/scholar/scroll plotlines unless the theme warrants it. The hook above is your starting beat — anchor turn 1's prose to it. Vary every other detail (NPC names, place names, exact wording) so this run feels different from any past run.`;
}

/**
 * Returns a system-prompt fragment listing forbidden trope words. Caller
 * concatenates into generateSystemPrompt's output.
 */
export function describeForbiddenTropes() {
    return `\nFORBIDDEN TROPE PHRASES (do not use these exact words; they are over-used patterns from training data and break replay variety):
${FORBIDDEN_TROPES.map(t => `  - "${t}"`).join('\n')}
Invent fresh names and vocabulary native to the chosen theme. A dinosaur-era story should have hunting-grounds, migration-stones, ash-fields — not libraries and shadow-blights.`;
}
