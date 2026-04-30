// items.js
// Handles item definitions, themed generation, shop population, loot drops.

// --- Module Imports ---
import * as Config from './config.js?cb=014'; // Needs config values (Tiers, Costs, etc.)
import { gameState } from './state.js?cb=014'; // Needs gameState for context (theme, turn)
// Import specific utils needed
import { generateId, getRandomInt, getRandomElement, shuffleArray, clamp } from './utils.js?cb=014';

// --- Themed Item Data ---
// Base names, prefixes, suffixes, effects per theme for combinatorial generation.
// Theme data for combinatorial generation - additional themes can be added as needed
export const themedItemData = { // Exporting this allows UI to access RevivalItemName etc.
    // --- FANTASY ---
    fantasy: {
        Weapon: {
            Low: { 
                names: ['Dagger', 'Shortsword', 'Club', 'Staff', 'Torch', 'Ice Shard', 'Spark Rod'], 
                prefixes: ['Rusty', 'Worn', 'Simple', 'Cracked', 'Flaming', 'Frozen', 'Charged'], 
                suffixes: ['of Sparks', 'of Might', '', 'of Burning', 'of Frost', 'of Shock'],
                elements: ['Physical', 'Fire', 'Ice', 'Lightning'],
                statusChance: 0.1
            },
            Medium: { 
                names: ['Longsword', 'Mace', 'Warhammer', 'Spear', 'Fire Blade', 'Frost Axe', 'Thunder Mace'], 
                prefixes: ['Steel', 'Iron', 'Hunter\'s', 'Balanced', 'Blazing', 'Glacial', 'Storm'], 
                suffixes: ['of Flames', 'of Smiting', 'of Warding', 'of Incineration', 'of Freezing', 'of Thunder'],
                elements: ['Physical', 'Fire', 'Ice', 'Lightning', 'Poison'],
                statusChance: 0.15
            },
            High: { 
                names: ['Greatsword', 'Battleaxe', 'Glaive', 'Morningstar', 'Inferno Blade', 'Blizzard Axe', 'Lightning Spear'], 
                prefixes: ['Elven', 'Dwarven', 'Knightly', 'Enchanted', 'Molten', 'Arctic', 'Voltaic'], 
                suffixes: ['of Storms', 'of Slaying', 'of Resilience', 'of Immolation', 'of Absolute Zero', 'of Chain Lightning'],
                elements: ['Physical', 'Fire', 'Ice', 'Lightning', 'Poison', 'Holy'],
                statusChance: 0.2
            },
            Special: { 
                names: ['Rapier', 'Katana', 'Scythe', 'Flail', 'Phoenix Blade', 'Void Reaper', 'Divine Hammer'], 
                prefixes: ['Assassin\'s', 'Masterwork', 'Shadow', 'Glimmering', 'Celestial', 'Abyssal', 'Sacred'], 
                suffixes: ['of Swiftness', 'of Souls', 'of Illusions', 'of Rebirth', 'of Darkness', 'of Light'],
                elements: ['Physical', 'Fire', 'Ice', 'Lightning', 'Poison', 'Holy', 'Dark'],
                statusChance: 0.25
            },
            Legendary: { 
                names: ['Dragonfang Blade', 'Hammer of Ancients', 'Sunreaver Bow', 'Worldender', 'Soulrend', 'Lightbringer'], 
                prefixes: ['Legendary', 'Mythic', 'Soulbound', 'Apocalyptic', 'Transcendent', 'Eternal'], 
                suffixes: ['of the Undying', 'of Celestial Fury', 'of Eternal Night', 'of World\'s End', 'of Soul Harvest', 'of Divine Wrath'],
                elements: ['Physical', 'Fire', 'Ice', 'Lightning', 'Poison', 'Holy', 'Dark'],
                statusChance: 0.3
            },
        },
        Armor: {
            Low: { names: ['Rags', 'Leather Jerkin', 'Padded Tunic', 'Hide Armor'], prefixes: ['Torn', 'Simple', 'Dirty', 'Patched'], suffixes: [''] },
            Medium: { names: ['Chainmail', 'Scale Mail', 'Breastplate', 'Studded Leather'], prefixes: ['Reinforced', 'Soldier\'s', 'Traveler\'s', 'Hardened'], suffixes: ['of Protection', 'of Stamina'] },
            High: { names: ['Plate Armor', 'Full Helm', 'Splint Mail', 'Tower Shield'], prefixes: ['Ornate', 'Guardian\'s', 'Adamantine', 'Shining'], suffixes: ['of Fortitude', 'of Deflection'] },
            Special: { names: ['Dragonscale', 'Mithral Chain', 'Obsidian Plate', 'Spirit Guard'], prefixes: ['Ancient', 'Whispering', 'Imbued', 'Celestial'], suffixes: ['of Invulnerability', 'of Shadows'] },
            Legendary: { names: ['Aegis of the Gods', 'Shadowweave Robes', 'Titanium Plating'], prefixes: ['Legendary', 'Unbreakable', 'Ethereal'], suffixes: ['of the Heavens', 'of the Void Walker', 'of the Earth Lord'] },
        },
        Consumable: {
            Low: { 
                names: ['Healing Salve', 'Weak Potion', 'Crude Bandage', 'Herb Pouch', 'Flash Powder', 'Poison Dart', 'Calming Tea'], 
                effects: ['Heals minor wounds.', 'Slightly restorative.', 'Minor first aid.', 'Soothes minor aches.', 'Blinds enemies briefly.', 'Applies weak poison.', 'Cures confusion.'], 
                stats: { applyStatus: ['Blind', 'Poison'], cure: ['Confusion'] } 
            },
            Medium: { 
                names: ['Health Potion', 'Restorative Draught', 'Field Dressing', 'Antidote', 'Alchemist Fire', 'Frost Bomb', 'Berserker Brew'], 
                effects: ['Restores moderate health.', 'Mends wounds effectively.', 'Standard battlefield dressing.', 'Cures poison.', 'Burns enemies with fire.', 'Freezes enemies with ice.', 'Increases attack but reduces defense.'], 
                stats: { cure: 'Poison', applyStatus: ['Burn', 'Frost', 'Berserk'] } 
            },
            High: { 
                names: ['Elixir of Life', 'Greater Potion', 'Troll Blood Vial', 'Panacea', 'Lightning Bottle', 'Paralysis Poison', 'Shield Elixir'], 
                effects: ['Fully restores health.', 'Remarkable healing properties.', 'Potent regeneration.', 'Cures all ailments.', 'Strikes with lightning.', 'Paralyzes enemies.', 'Reduces incoming damage.'], 
                stats: { cure: 'All', applyStatus: ['Paralysis', 'Shield'] } 
            },
            Special: { 
                names: ['Potion of Strength', 'Draught of Swiftness', 'Oil of Sharpness', 'Invisibility Potion', 'Confusion Gas', 'Sleep Dart', 'Haste Potion'], 
                effects: ['Temporarily boosts Attack.', 'Temporarily boosts Speed/Defense.', 'Increases weapon effectiveness.', 'Grants temporary invisibility.', 'Confuses enemies.', 'Puts enemies to sleep.', 'Increases speed and initiative.'], 
                stats: { applyStatus: ['Weakness', 'Confusion', 'Sleep', 'Haste'] } 
            },
            Legendary: { 
                names: ['Phoenix Ash', 'Ambrosia', 'Tear of the Goddess', 'Vulnerability Curse', 'Stun Orb'], 
                effects: ['Revives fallen ally with full health.', 'Grants immense temporary power.', 'Ultimate healing and purification.', 'Makes enemies take more damage.', 'Stuns all enemies.'], 
                stats: { revive: true, heal: 9999, applyStatus: ['Vulnerability', 'Stun'] } 
            }
        },
        Misc: {
             names: ['Lockpick Set', 'Tinderbox', 'Rope (50ft)', 'Spyglass', 'Empty Vial', 'Chalk', 'Map Fragment', 'Odd Gemstone'], prefixes: ['Simple', 'Sturdy', 'Well-used', 'Intricate', 'Mysterious', '']
        },
         RevivalItemName: "Phoenix Down",
    },
    // --- SPACE ---
    space: {
        Weapon: {
            Low: { names: ['Shock Baton', 'Laser Pistol', 'Pipe Wrench', 'Emergency Welder'], prefixes: ['Rusty', 'Malfunctioning', 'Basic Issue', 'Makeshift'], suffixes: [''] },
            Medium: { names: ['Pulse Rifle', 'Plasma Cutter', 'Stun Grenade', 'Ion Blaster'], prefixes: ['Military Grade', 'Calibrated', 'Heavy', 'Reliable'], suffixes: ['Mk II', 'X Version'] },
            High: { names: ['Railgun', 'Particle Beam', 'Singularity Grenade', 'Neutron Repeater'], prefixes: ['Experimental', 'Prototype', 'Advanced', 'Void-Touched'], suffixes: ['Overcharged', 'Elite Model'] },
            Special: { names: ['Gauss Rifle', 'Graviton Hammer', 'Phase Disruptor', 'Tesla Cannon'], prefixes: ['Illegal', 'Precursor', 'Sentient?', 'Zero-Point'], suffixes: ['Custom', 'Supreme'] },
            Legendary: { names: ['Star Devourer Cannon', 'Reality Ripper', 'Nexus Blaster'], prefixes: ['Legendary', 'Xylar\'s', 'Cosmic'], suffixes: ['Infinite', 'Paradox Engine'] },
        },
        Armor: {
            Low: { names: ['Jumpsuit', 'Boiler Suit', 'Cargo Vest', 'Pressure Patch'], prefixes: ['Torn', 'Greasy', 'Standard', 'Thin'], suffixes: [''] },
            Medium: { names: ['Combat Armor', 'Hazard Suit', 'Exploration Gear', 'Light Exoskeleton'], prefixes: ['Reinforced', 'Vacuum-Sealed', 'Scout', 'Powered'], suffixes: ['Model B', 'Enhanced'] },
            High: { names: ['Power Armor', 'Ablative Plating', 'Energy Shield', 'Full Enviro-Suit'], prefixes: ['Heavy', 'Reactor-Powered', 'Titanium', 'Nanoweave'], suffixes: ['Type-C', 'Fortress Class'] },
            Special: { names: ['Chameleon Suit', 'Void Harness', 'Kinetic Barrier', 'Quantum Weave'], prefixes: ['Stealth', 'Dark Matter', 'Temporal', 'Alien'], suffixes: ['Xeno-Tech', 'Singularity'] },
            Legendary: { names: ['Aegis Combat System', 'Null-Field Suit', 'Event Horizon Armor'], prefixes: ['Legendary', 'Omega', 'Celestial'], suffixes: ['Guardian Protocol', 'Unbound'] },
        },
        Consumable: {
            Low: { names: ['Nutri-Paste', 'Stim-Patch', 'Med-Spray (Basic)', 'Scrap Metal'], effects: ['Provides basic sustenance.', 'Minor stimulant effect.', 'Minor healing.', 'Common repair material.'], stats: {} },
            Medium: { names: ['Medikit', 'Hyper-Caff Patch', 'Repair Nanites', 'Anti-Rad Injector'], effects: ['Standard medical treatment.', 'Significant alertness boost.', 'Repairs minor damage/systems.', 'Removes radiation effects.'], stats: { cure: 'Radiation' } },
            High: { names: ['Auto-Doc', 'Combat Stim Injector', 'Universal Repair Gel', 'Neural Harmonizer'], effects: ['Advanced automated healing.', 'Massive temporary combat boost.', 'Repairs heavy damage/systems.', 'Removes mental status effects.'], stats: { cure: 'Mental' } },
            Special: { names: ['Shield Battery', 'Targeting Enhancer', 'Gravity Modulator', 'Warp Cell Fragment'], effects: ['Recharges energy shields.', 'Boosts weapon accuracy.', 'Temporarily alters local gravity.', 'Unstable energy source.'], stats: { /* Temp buff structure deferred */ } },
            Legendary: { names: ['Cryo-Revival Pod', 'Universal Omni-Gel', 'Starlight Elixir'], effects: ['Revives ally, potentially with side effects.', 'Perfectly repairs any system.', 'Grants cosmic awareness.'], stats: { revive: true } }
        },
        Misc: {
             names: ['Universal Spanner', 'Scanner', 'Datapad', 'Oxygen Canister', 'Fusion Cell', 'Wire Spool', 'Alien Artifact Shard', 'Cryo-Canister'], prefixes: ['Standard', 'Multi-', 'Encrypted', 'Bio-', 'Damaged', '']
        },
         RevivalItemName: "Nano-Revive Syringe",
    },
    // --- PIRATE ---
    pirate: {
        Weapon: {
             Low: { names: ['Cutlass', 'Belaying Pin', 'Boarding Axe', 'Flintlock Pistol'], prefixes: ['Rusty', 'Barnacle-Encrusted', 'Crude', 'Leaky'], suffixes: [''] },
             Medium: { names: ['Scimitar', 'Musket', 'Blunderbuss', 'Boarding Pike'], prefixes: ['Sharpened', 'Captain\'s', 'Polished', 'Sea Dog\'s'], suffixes: ['of the Depths', 'of Swashbuckling'] },
             High: { names: ['Naval Cannon', 'Swivel Gun', 'Double-Barrel Pistol', 'Harpoon Gun'], prefixes: ['Masterwork', 'Ornate', 'Heavy', 'Kraken-Blessed'], suffixes: ['of Thunder', 'of the Trident'] },
             Special: { names: ['Saber', 'Repeating Flintlock', 'Grenado', 'Hook Hand (Sharp)'], prefixes: ['Legendary', 'Cursed', 'Ghostly', 'Admiral\'s'], suffixes: ['of Blackheart', 'of Davy Jones'] },
             Legendary: { names: ['Tidal Wave Trident', 'Davy Jones\' Cutlass', 'Kraken\'s Fury Cannon'], prefixes: ['Legendary', 'Sunken', 'Abyssal'], suffixes: ['of the Seven Seas', 'of Eternal Storms'] },
        },
        Armor: {
             Low: { names: ['Sailor Shirt', 'Canvas Trousers', 'Bandana', 'Eye Patch'], prefixes: ['Tattered', 'Salty', 'Simple', 'Worn'], suffixes: [''] },
             Medium: { names: ['Leather Coat', 'Tricorne Hat', 'Buckler', 'Thick Boots'], prefixes: ['Sturdy', 'First Mate\'s', 'Weathered', 'Reinforced'], suffixes: ['of the Sea'] },
             High: { names: ['Officer\'s Uniform', 'Breastplate', 'Helm', 'Cannon Shield'], prefixes: ['Ornate', 'Commodore\'s', 'Hardened', 'Shipwreck'], suffixes: ['of Grog', 'of Resilience'] },
             Special: { names: ['Kraken Hide Vest', 'Cursed Captain\'s Coat', 'Coral Armor', 'Ghostly Garb'], prefixes: ['Legendary', 'Sunken', 'Whispering', 'Undead'], suffixes: ['of the Damned', 'of Tides'] },
             Legendary: { names: ['Poseidon\'s Plate', 'Flying Dutchman\'s Guise', 'Mermaid Scale Mail'], prefixes: ['Legendary', 'Mythic', 'Oceanic'], suffixes: ['of Unending Breath', 'of the Phantom Crew'] },
        },
        Consumable: {
             Low: { names: ['Grog', 'Hardtack', 'Salted Pork', 'Seaweed Wrap'], effects: ['Slightly restorative, maybe dizzying.', 'Basic sustenance.', 'Chewy sustenance.', 'Minor wound dressing.'], stats: {} },
             Medium: { names: ['Rum (Good Stuff)', 'Ship\'s Biscuit', 'Bandage Roll', 'Lime'], effects: ['Restores health, boosts morale (maybe).', 'Reliable food.', 'Standard wound dressing.', 'Prevents scurvy.'], stats: { cure: 'Scurvy' } },
             High: { names: ['Captain\'s Reserve Rum', 'Surgeon\'s Kit', 'Saltwater Cure', 'Mermaid Tears'], effects: ['Excellent restorative, potent!', 'Heals serious wounds.', 'Cures ailments.', 'Grants temporary water breathing.'], stats: { cure: 'All' } },
             Special: { names: ['Powder Keg (Small)', 'Treasure Map Piece', 'Spyglass Polish', 'Message in a Bottle'], effects: ['Explosive potential!', 'Hints at treasure or location.', 'Improves spyglass effectiveness.', 'Contains a cryptic clue.'], stats: { /* Misc effect structure deferred */ } },
             Legendary: { names: ['Davy Jones\' Locker Key', 'Fountain of Youth Water', 'Kraken Ink Bomb'], effects: ['Can revive an ally, but demands a price.', 'Grants temporary immortality.', 'Massive blinding/damaging explosion.'], stats: { revive: true } }
        },
        Misc: {
             names: ['Spyglass', 'Compass', 'Rope Ladder', 'Shovel', 'Lantern', 'Dice Set', 'Piece of Eight', 'Golden Doubloon'], prefixes: ['Sturdy', 'Brass', 'Well-used', 'Silver', 'Cursed', '']
        },
         RevivalItemName: "Davy Jones' Locker Key",
    },
    // --- UNDERWATER ---
    underwater: {
        Weapon: {
            Low: { names: ['Coral Dagger', 'Shell Blade', 'Bubble Blaster', 'Kelp Whip'], prefixes: ['Barnacled', 'Waterlogged', 'Algae-Covered', 'Rusted'], suffixes: [''] },
            Medium: { names: ['Trident', 'Harpoon', 'Sonic Pulser', 'Pressure Gun'], prefixes: ['Reinforced', 'Deep Sea', 'Pressurized', 'Aqua-Forged'], suffixes: ['of the Depths', 'of Crushing'] },
            High: { names: ['Leviathan Fang', 'Abyssal Spear', 'Hydro Cannon', 'Depth Charger'], prefixes: ['Bioluminescent', 'Pressurized', 'Abyssal', 'Tidal'], suffixes: ['of the Abyss', 'of Drowning'] },
            Special: { names: ['Kraken Tentacle', 'Whale Bone Sword', 'Coral Crown', 'Sea Serpent Fang'], prefixes: ['Ancient', 'Mythical', 'Deep One\'s', 'Atlantean'], suffixes: ['of the Lost City', 'of the Sunken King'] },
            Legendary: { names: ['Poseidon\'s Trident', 'Tidal Fury', 'Maelstrom Maker'], prefixes: ['Legendary', 'Oceanic', 'Abyssal'], suffixes: ['of the Sea God', 'of World-Flooding'] }
        },
        Armor: {
            Low: { names: ['Seaweed Wrap', 'Shell Plates', 'Bubble Helm', 'Fish Scale Vest'], prefixes: ['Damp', 'Slimy', 'Barnacled', 'Thin'], suffixes: [''] },
            Medium: { names: ['Pressure Suit', 'Coral Armor', 'Pearl Mail', 'Aqua Helm'], prefixes: ['Reinforced', 'Deep Sea', 'Hardened', 'Waterproof'], suffixes: ['of Pressure', 'of the Reef'] },
            High: { names: ['Leviathan Hide', 'Abyssal Plate', 'Kraken Scale Mail', 'Whale Bone Armor'], prefixes: ['Pressurized', 'Bioluminescent', 'Oceanic', 'Tidal'], suffixes: ['of the Deep', 'of Water Walking'] },
            Special: { names: ['Atlantean Guard', 'Mermaid Scale Mail', 'Deep One\'s Carapace', 'Living Coral Suit'], prefixes: ['Ancient', 'Mythical', 'Sentient', 'Atlantean'], suffixes: ['of the Lost City', 'of Perfect Swimming'] },
            Legendary: { names: ['Neptune\'s Embrace', 'Abyssal Guardian', 'Tidal Plate'], prefixes: ['Legendary', 'Oceanic', 'Eternal'], suffixes: ['of the Ocean Lord', 'of the Endless Deep'] }
        },
        Consumable: {
            Low: { names: ['Kelp Wrap', 'Air Bubble', 'Coral Paste', 'Fish Oil'], effects: ['Minor healing underwater.', 'Temporary air supply.', 'Seals minor leaks.', 'Improves swimming.'], stats: {} },
            Medium: { names: ['Pressure Pill', 'Aqua Lung', 'Deep Healing Algae', 'Bioluminescent Extract'], effects: ['Resist crushing depths.', 'Extended underwater breathing.', 'Moderate healing underwater.', 'Provides light in darkness.'], stats: { cure: 'Pressure Sickness' } },
            High: { names: ['Abyssal Elixir', 'Leviathan Blood', 'Whale Song Crystal', 'Deep Current Tonic'], effects: ['Major healing underwater.', 'Temporary invulnerability to pressure.', 'Communicate with sea life.', 'Control water currents.'], stats: { cure: 'All Aquatic' } },
            Special: { names: ['Mermaid\'s Tear', 'Kraken Ink', 'Atlantean Crystal', 'Deep One\'s Heart'], effects: ['Grants water breathing.', 'Creates dark escape cloud.', 'Ancient power source.', 'Commune with the depths.'], stats: { /* Temp buff structure deferred */ } },
            Legendary: { names: ['Ocean\'s Heart', 'Poseidon\'s Breath', 'Abyssal Pearl'], effects: ['Revives fallen with water powers.', 'Grants mastery over water.', 'Ultimate underwater healing.'], stats: { revive: true } }
        },
        Misc: {
            names: ['Pressure Gauge', 'Diving Bell', 'Sea Chart', 'Pearl', 'Coral Fragment', 'Ancient Shell', 'Atlantean Coin', 'Mysterious Conch'], prefixes: ['Waterproof', 'Deep Sea', 'Ancient', 'Glowing', 'Mysterious', '']
        },
        RevivalItemName: "Ocean's Heart"
    },
    // --- JUNGLE ---
    jungle: {
        Weapon: {
            Low: { names: ['Wooden Spear', 'Blowgun', 'Stone Axe', 'Vine Whip'], prefixes: ['Crude', 'Primitive', 'Wooden', 'Makeshift'], suffixes: [''] },
            Medium: { names: ['Poison Dart Gun', 'Obsidian Blade', 'Bamboo Staff', 'Hunting Bow'], prefixes: ['Tribal', 'Hunter\'s', 'Poisoned', 'Ritual'], suffixes: ['of the Tribe', 'of Hunting'] },
            High: { names: ['Ancient Stone Sword', 'Temple Guardian Spear', 'Sacrificial Dagger', 'Jungle King\'s Mace'], prefixes: ['Sacred', 'Blessed', 'Venomous', 'Primal'], suffixes: ['of the Ancients', 'of Beast Slaying'] },
            Special: { names: ['Serpent Fang Blade', 'Jaguar Claw Gauntlet', 'Living Wood Bow', 'Tribal Shaman Staff'], prefixes: ['Mystical', 'Savage', 'Jungle Spirit\'s', 'Forgotten'], suffixes: ['of the Wild', 'of Lost Civilization'] },
            Legendary: { names: ['Heart of the Jungle', 'Wrath of Nature', 'Ancient God\'s Fury'], prefixes: ['Legendary', 'Primal', 'Mythical'], suffixes: ['of the Forest Gods', 'of Eternal Growth'] }
        },
        Armor: {
            Low: { names: ['Leaf Cover', 'Hide Armor', 'Bark Shield', 'Woven Grass Vest'], prefixes: ['Tattered', 'Simple', 'Natural', 'Woven'], suffixes: [''] },
            Medium: { names: ['Leather Armor', 'Tribal Shield', 'Beast Hide Suit', 'Wooden Armor'], prefixes: ['Hunter\'s', 'Tribal', 'Reinforced', 'Camouflaged'], suffixes: ['of Stealth', 'of the Hunt'] },
            High: { names: ['Jaguar Skin Armor', 'Ancient Temple Guard Plate', 'Living Vine Mail', 'Serpent Scale Suit'], prefixes: ['Sacred', 'Blessed', 'Primal', 'Guardian\'s'], suffixes: ['of the Wild', 'of Beast Mastery'] },
            Special: { names: ['Shaman\'s Regalia', 'Living Wood Armor', 'Spirit Beast Hide', 'Ancient Tribal Plate'], prefixes: ['Mystical', 'Nature\'s', 'Tribal Elder\'s', 'Forgotten'], suffixes: ['of the Spirits', 'of Perfect Camouflage'] },
            Legendary: { names: ['Nature\'s Embrace', 'Ancient God\'s Protection', 'Primal Guardian'], prefixes: ['Legendary', 'Mythical', 'Eternal'], suffixes: ['of the Forest Heart', 'of Untamed Wilds'] }
        },
        Consumable: {
            Low: { names: ['Healing Herb', 'Wild Berry', 'Leaf Bandage', 'Mushroom Cap'], effects: ['Minor natural healing.', 'Basic sustenance.', 'Stops minor bleeding.', 'Strange effects...'], stats: {} },
            Medium: { names: ['Tribal Poultice', 'Warrior\'s Brew', 'Venom Antidote', 'Spirit Herb'], effects: ['Moderate healing.', 'Combat enhancement.', 'Cures poison.', 'Commune with spirits.'], stats: { cure: 'Poison' } },
            High: { names: ['Sacred Tree Sap', 'Shaman\'s Elixir', 'Beast Heart Extract', 'Living Vine Essence'], effects: ['Major natural healing.', 'Grants animal powers.', 'Enhances strength.', 'Control plants.'], stats: { cure: 'All Natural' } },
            Special: { names: ['Spirit Guide Charm', 'Jungle Heart Fruit', 'Ancient Tree Essence', 'Beast Master Totem'], effects: ['Speak with animals.', 'Temporary invulnerability.', 'Control plants.', 'Command wild beasts.'], stats: { /* Temp buff structure deferred */ } },
            Legendary: { names: ['World Tree Seed', 'Primal Spirit Essence', 'Nature\'s Tear'], effects: ['Revives with nature\'s blessing.', 'Unleashes primal power.', 'Ultimate natural healing.'], stats: { revive: true } }
        },
        Misc: {
            names: ['Tribal Mask', 'Spirit Fetish', 'Ancient Idol', 'Rare Flower', 'Beast Tooth', 'Sacred Crystal', 'Jungle Map', 'Strange Seed'], prefixes: ['Sacred', 'Tribal', 'Ancient', 'Mystical', 'Wild', '']
        },
        RevivalItemName: "World Tree Seed"
    },
    // --- FUTURE UTOPIA ---
    future_utopia: {
        Weapon: {
            Low: { names: ['Peace Enforcer', 'Stun Baton', 'Sonic Disruptor', 'Neural Pacifier'], prefixes: ['Training', 'Non-Lethal', 'Safety', 'Civilian'], suffixes: [''] },
            Medium: { names: ['Harmony Beam', 'Order Keeper', 'Plasma Restrainer', 'Mind Calmer'], prefixes: ['Guardian\'s', 'Certified', 'Regulated', 'Balanced'], suffixes: ['of Peace', 'of Order'] },
            High: { names: ['Justice Ray', 'Unity Projector', 'Quantum Pacifier', 'Consciousness Harmonizer'], prefixes: ['Advanced', 'Authorized', 'Precision', 'Enhanced'], suffixes: ['of Tranquility', 'of Enlightenment'] },
            Special: { names: ['Thought Controller', 'Reality Shaper', 'Dream Weaver', 'Peace Manifestor'], prefixes: ['Prototype', 'Experimental', 'Ascended', 'Perfect'], suffixes: ['of Transcendence', 'of Unity'] },
            Legendary: { names: ['Universal Harmonizer', 'Mind\'s Eye', 'Perfect Peace'], prefixes: ['Legendary', 'Ultimate', 'Infinite'], suffixes: ['of Eternal Harmony', 'of Perfect Order'] }
        },
        Armor: {
            Low: { names: ['Comfort Suit', 'Peace Robe', 'Harmony Vest', 'Tranquility Shell'], prefixes: ['Basic', 'Civilian', 'Standard', 'Safe'], suffixes: [''] },
            Medium: { names: ['Guardian Attire', 'Order Keeper Suit', 'Unity Armor', 'Consciousness Shield'], prefixes: ['Regulated', 'Certified', 'Balanced', 'Protective'], suffixes: ['of Serenity', 'of Balance'] },
            High: { names: ['Quantum Weave', 'Mind Shield', 'Enlightened Plate', 'Harmonic Barrier'], prefixes: ['Advanced', 'Authorized', 'Enhanced', 'Perfect'], suffixes: ['of Transcendence', 'of Inner Peace'] },
            Special: { names: ['Reality Membrane', 'Thought Barrier', 'Dream Skin', 'Unity Field'], prefixes: ['Prototype', 'Experimental', 'Ascended', 'Evolved'], suffixes: ['of the New Dawn', 'of Perfect Self'] },
            Legendary: { names: ['Universal Shell', 'Mind\'s Fortress', 'Perfect Form'], prefixes: ['Legendary', 'Ultimate', 'Infinite'], suffixes: ['of Eternal Peace', 'of Perfect Unity'] }
        },
        Consumable: {
            Low: { names: ['Calm Patch', 'Peace Pill', 'Harmony Mist', 'Mind Balm'], effects: ['Minor stress relief.', 'Gentle calming.', 'Promotes clarity.', 'Enhances focus.'], stats: {} },
            Medium: { names: ['Serenity Serum', 'Order Stabilizer', 'Unity Drops', 'Consciousness Clearer'], effects: ['Significant calming.', 'Restores mental balance.', 'Promotes cooperation.', 'Enhances awareness.'], stats: { cure: 'Discord' } },
            High: { names: ['Enlightenment Elixir', 'Transcendence Tonic', 'Perfect Peace Potion', 'Harmony Hyperserum'], effects: ['Major consciousness expansion.', 'Complete mental clarity.', 'Perfect inner peace.', 'Ultimate awareness.'], stats: { cure: 'All Mental' } },
            Special: { names: ['Reality Reshaper', 'Mind Expander', 'Dream Crystal', 'Unity Resonator'], effects: ['Temporarily alters reality.', 'Expands consciousness.', 'Shapes shared dreams.', 'Links minds temporarily.'], stats: { /* Temp buff structure deferred */ } },
            Legendary: { names: ['Universal Truth', 'Perfect Enlightenment', 'Eternal Peace'], effects: ['Revives with perfect clarity.', 'Grants ultimate wisdom.', 'Achieves perfect harmony.'], stats: { revive: true } }
        },
        Misc: {
            names: ['Meditation Orb', 'Peace Crystal', 'Unity Token', 'Mind Map', 'Dream Recorder', 'Harmony Resonator', 'Truth Shard', 'Perfect Geometry'], prefixes: ['Certified', 'Balanced', 'Pure', 'Enlightened', 'Perfect', '']
        },
        RevivalItemName: "Universal Truth"
    },
    // --- DINOSAUR ---
    dinosaur: {
        Weapon: {
            Low: { names: ['Bone Club', 'Stone Spear', 'Raptor Claw', 'Flint Knife'], prefixes: ['Crude', 'Primitive', 'Rough', 'Basic'], suffixes: [''] },
            Medium: { names: ['Rex Tooth Blade', 'Thagomizer', 'Fossil Mace', 'Pterodactyl Talon'], prefixes: ['Sharp', 'Hunter\'s', 'Primal', 'Ancient'], suffixes: ['of the Hunt', 'of Extinction'] },
            High: { names: ['Megalodon Fang', 'Spinosaurus Blade', 'Ankylosaurus Tail', 'Carnotaurus Horn'], prefixes: ['Apex', 'Dominant', 'Savage', 'Prehistoric'], suffixes: ['of the Alpha', 'of the Lost World'] },
            Special: { names: ['Living Fossil Blade', 'Time-Lost Weapon', 'Primordial Staff', 'Extinction Event'], prefixes: ['Fossilized', 'Prehistoric', 'Primeval', 'Ancient'], suffixes: ['of the Ancients', 'of Prehistoria'] },
            Legendary: { names: ['World Ender', 'Primordial Force', 'Extinction Bringer'], prefixes: ['Legendary', 'Ultimate', 'Prehistoric'], suffixes: ['of Mass Extinction', 'of Ancient Power'] }
        },
        Armor: {
            Low: { names: ['Hide Armor', 'Scale Patches', 'Bone Plates', 'Leather Wraps'], prefixes: ['Crude', 'Basic', 'Rough', 'Simple'], suffixes: [''] },
            Medium: { names: ['Raptor Scale Mail', 'Triceratops Plate', 'Pterosaur Wing Suit', 'Pachycephalos Helm'], prefixes: ['Tough', 'Hunter\'s', 'Primal', 'Scaled'], suffixes: ['of Protection', 'of the Pack'] },
            High: { names: ['T-Rex Hide Armor', 'Ankylosaurus Shell', 'Stegosaurus Plate', 'Brontosaurus Scale Mail'], prefixes: ['Apex', 'Dominant', 'Ancient', 'Prehistoric'], suffixes: ['of the Alpha', 'of Survival'] },
            Special: { names: ['Living Fossil Armor', 'Time-Lost Shell', 'Primordial Plates', 'Extinction Guard'], prefixes: ['Fossilized', 'Prehistoric', 'Primeval', 'Ancient'], suffixes: ['of the Lost Age', 'of Preservation'] },
            Legendary: { names: ['Pangaea\'s Shell', 'Primordial Guard', 'Ancient One\'s Hide'], prefixes: ['Legendary', 'Ultimate', 'Prehistoric'], suffixes: ['of the First Age', 'of Ancient Earth'] }
        },
        Consumable: {
            Low: { names: ['Raw Meat', 'Prehistoric Berry', 'Bone Marrow', 'Ancient Herb'], effects: ['Basic sustenance.', 'Minor healing.', 'Provides strength.', 'Strange properties.'], stats: {} },
            Medium: { names: ['Raptor Meat', 'Fossil Extract', 'Prehistoric Mushroom', 'Ancient Plant Sap'], effects: ['Good healing.', 'Enhances speed.', 'Grants night vision.', 'Cures poison.'], stats: { cure: 'Poison' } },
            High: { names: ['T-Rex Heart', 'Primordial Elixir', 'Ancient Tree Sap', 'Megafauna Extract'], effects: ['Major healing.', 'Grants tremendous strength.', 'Enhanced regeneration.', 'Cures all ailments.'], stats: { cure: 'All Physical' } },
            Special: { names: ['Amber Extract', 'Time Crystal', 'Fossil Powder', 'Extinction Shard'], effects: ['Preserves life force.', 'Slows time locally.', 'Temporary invulnerability.', 'Grants ancient power.'], stats: { /* Temp buff structure deferred */ } },
            Legendary: { names: ['Primordial Essence', 'First Life Spark', 'Ancient One\'s Blood'], effects: ['Revives with prehistoric might.', 'Grants primal power.', 'Ultimate life force.'], stats: { revive: true } }
        },
        Misc: {
            names: ['Fossil', 'Amber Chunk', 'Dinosaur Egg', 'Ancient Tool', 'Prehistoric Map', 'Strange Crystal', 'Bone Fragment', 'Time Shard'], prefixes: ['Preserved', 'Ancient', 'Prehistoric', 'Primordial', 'Mysterious', '']
        },
        RevivalItemName: "First Life Spark"
    },
    // --- ARCTIC ---
    arctic: {
        Weapon: {
            Low: { names: ['Ice Pick', 'Seal Club', 'Snow Staff', 'Frost Blade'], prefixes: ['Frozen', 'Cold', 'Icy', 'Chilled'], suffixes: [''] },
            Medium: { names: ['Glacier Axe', 'Nordic Spear', 'Frost Bow', 'Ice Hammer'], prefixes: ['Arctic', 'Northern', 'Freezing', 'Winter\'s'], suffixes: ['of Cold', 'of Freezing'] },
            High: { names: ['Permafrost Blade', 'Avalanche Maker', 'Polar Hunter\'s Bow', 'Frozen Heart Mace'], prefixes: ['Glacial', 'Polar', 'Frigid', 'Absolute Zero'], suffixes: ['of the North', 'of Winter'] },
            Special: { names: ['Aurora Blade', 'Yeti\'s Fist', 'Ice Giant\'s Axe', 'Northern Lights Staff'], prefixes: ['Ancient', 'Mythical', 'Eternal', 'Polar'], suffixes: ['of the Frozen Gods', 'of Eternal Winter'] },
            Legendary: { names: ['Winter\'s End', 'Glacier\'s Heart', 'Frost Giant\'s Fury'], prefixes: ['Legendary', 'Ultimate', 'Eternal'], suffixes: ['of the Ice Age', 'of Absolute Zero'] }
        },
        Armor: {
            Low: { names: ['Fur Coat', 'Snow Boots', 'Ice Climber\'s Gear', 'Thermal Wrap'], prefixes: ['Padded', 'Insulated', 'Warm', 'Basic'], suffixes: [''] },
            Medium: { names: ['Arctic Suit', 'Polar Guard', 'Ice Climber\'s Shell', 'Frost Shield'], prefixes: ['Reinforced', 'Northern', 'Thermal', 'Winter\'s'], suffixes: ['of Warmth', 'of Protection'] },
            High: { names: ['Glacier Plate', 'Permafrost Mail', 'Polar Bear Hide', 'Ice Giant Hide'], prefixes: ['Glacial', 'Arctic', 'Frigid', 'Ancient'], suffixes: ['of the North', 'of Ice Walking'] },
            Special: { names: ['Aurora Armor', 'Yeti Hide Suit', 'Northern Lights Mail', 'Frost Giant\'s Plate'], prefixes: ['Mythical', 'Eternal', 'Polar', 'Ancient'], suffixes: ['of the Arctic Gods', 'of Perfect Warmth'] },
            Legendary: { names: ['Winter\'s Embrace', 'Glacier\'s Heart', 'Eternal Frost'], prefixes: ['Legendary', 'Ultimate', 'Eternal'], suffixes: ['of the Frozen World', 'of Arctic Mastery'] }
        },
        Consumable: {
            Low: { names: ['Seal Blubber', 'Snow Berry', 'Frost Herb', 'Ice Crystal'], effects: ['Basic warmth.', 'Minor healing.', 'Resist cold.', 'Temporary cold resistance.'], stats: {} },
            Medium: { names: ['Polar Bear Meat', 'Arctic Tea', 'Thermal Tonic', 'Frost Balm'], effects: ['Good healing and warmth.', 'Sustained heat.', 'Improved cold resistance.', 'Cures frostbite.'], stats: { cure: 'Frostbite' } },
            High: { names: ['Glacier Extract', 'Northern Elixir', 'Permafrost Crystal', 'Aurora Essence'], effects: ['Major healing.', 'Perfect cold immunity.', 'Control ice and snow.', 'Grants ice powers.'], stats: { cure: 'All Cold' } },
            Special: { names: ['Yeti\'s Heart', 'Northern Lights Shard', 'Eternal Ice', 'Winter\'s Breath'], effects: ['Temporary invulnerability to cold.', 'Control weather.', 'Freeze enemies.', 'Create ice structures.'], stats: { /* Temp buff structure deferred */ } },
            Legendary: { names: ['Heart of Winter', 'Eternal Frost Essence', 'Glacier\'s Soul'], effects: ['Revives with ice powers.', 'Grants mastery over winter.', 'Ultimate cold power.'], stats: { revive: true } }
        },
        Misc: {
            names: ['Ice Compass', 'Snow Goggles', 'Thermal Map', 'Frost Crystal', 'Ancient Ice Shard', 'Aurora Fragment', 'Polar Rune', 'Frozen Artifact'], prefixes: ['Arctic', 'Frozen', 'Ancient', 'Northern', 'Polar', '']
        },
        RevivalItemName: "Heart of Winter"
    },
    // --- STEAMPUNK ---
    steampunk: {
        Weapon: {
            Low: { names: ['Brass Knuckles', 'Steam Pistol', 'Gear Club', 'Clockwork Blade'], prefixes: ['Rusty', 'Leaky', 'Simple', 'Mechanical'], suffixes: [''] },
            Medium: { names: ['Pressure Rifle', 'Gear Sword', 'Steam Hammer', 'Clockwork Bow'], prefixes: ['Brass', 'Steam-Powered', 'Mechanical', 'Automated'], suffixes: ['of Innovation', 'of Progress'] },
            High: { names: ['Tesla Cannon', 'Aether Blade', 'Steam Artillery', 'Clockwork Repeater'], prefixes: ['Advanced', 'Precision', 'Augmented', 'Masterwork'], suffixes: ['of the Engineer', 'of Industry'] },
            Special: { names: ['Difference Engine', 'Analytical Blade', 'Steam Leviathan', 'Aetheric Disruptor'], prefixes: ['Prototype', 'Experimental', 'Revolutionary', 'Impossible'], suffixes: ['of Mad Science', 'of the Future Past'] },
            Legendary: { names: ['World Engine', 'Industrial Revolution', 'Steam Apocalypse'], prefixes: ['Legendary', 'Ultimate', 'Perfect'], suffixes: ['of the New Age', 'of Infinite Steam'] }
        },
        Armor: {
            Low: { names: ['Leather Duster', 'Brass Goggles', 'Work Boots', 'Safety Vest'], prefixes: ['Patched', 'Basic', 'Worker\'s', 'Simple'], suffixes: [''] },
            Medium: { names: ['Steam Suit', 'Gear Mail', 'Pressure Armor', 'Mechanic\'s Gear'], prefixes: ['Brass', 'Reinforced', 'Mechanical', 'Automated'], suffixes: ['of Protection', 'of Industry'] },
            High: { names: ['Clockwork Exosuit', 'Tesla Armor', 'Aether Shield', 'Steam Powered Plate'], prefixes: ['Advanced', 'Precision', 'Augmented', 'Masterwork'], suffixes: ['of the Engineer', 'of Progress'] },
            Special: { names: ['Analytical Armor', 'Difference Engine Suit', 'Steam Leviathan Shell', 'Aetheric Barrier'], prefixes: ['Prototype', 'Experimental', 'Revolutionary', 'Impossible'], suffixes: ['of Mad Science', 'of Innovation'] },
            Legendary: { names: ['Industrial Perfection', 'Steam Sovereign', 'Mechanical Marvel'], prefixes: ['Legendary', 'Ultimate', 'Perfect'], suffixes: ['of the New Age', 'of the Machine God'] }
        },
        Consumable: {
            Low: { names: ['Steam Tonic', 'Gear Oil', 'Brass Polish', 'Coal Chunk'], effects: ['Minor repairs.', 'Basic maintenance.', 'Improves function.', 'Provides energy.'], stats: {} },
            Medium: { names: ['Repair Kit', 'Steam Injector', 'Aether Vial', 'Clockwork Key'], effects: ['Moderate repairs.', 'Boosts steam pressure.', 'Enhances mechanisms.', 'Fixes malfunctions.'], stats: { cure: 'Malfunction' } },
            High: { names: ['Universal Solvent', 'Tesla Charge', 'Perfect Lubricant', 'Aetheric Essence'], effects: ['Major repairs.', 'Supercharges systems.', 'Perfect maintenance.', 'Enhances all functions.'], stats: { cure: 'All Mechanical' } },
            Special: { names: ['Perpetual Motion', 'Time Cog', 'Steam Heart', 'Aether Crystal'], effects: ['Never-ending energy.', 'Manipulates time flow.', 'Powers mechanisms.', 'Defies physics.'], stats: { /* Temp buff structure deferred */ } },
            Legendary: { names: ['Industrial Revolution', 'Perfect Engine', 'Mechanical Soul'], effects: ['Revives with steam power.', 'Grants mechanical perfection.', 'Ultimate enhancement.'], stats: { revive: true } }
        },
        Misc: {
            names: ['Brass Compass', 'Steam Gauge', 'Gear Collection', 'Blueprint', 'Aether Meter', 'Strange Cog', 'Tesla Coil', 'Mechanical Bird'], prefixes: ['Brass', 'Steam', 'Mechanical', 'Automated', 'Experimental', '']
        },
        RevivalItemName: "Perfect Engine"
    },
    // --- HAUNTED ---
    haunted: {
        Weapon: {
            Low: { names: ['Rusty Candlestick', 'Iron Poker', 'Silver Letter Opener', 'Broken Mirror Shard'], prefixes: ['Dusty', 'Tarnished', 'Eerie', 'Creaky'], suffixes: [''] },
            Medium: { names: ['Ghost Ward', 'Spirit Blade', 'Exorcist\'s Cross', 'Phantom Bane'], prefixes: ['Blessed', 'Sacred', 'Spectral', 'Haunted'], suffixes: ['of Banishing', 'of Protection'] },
            High: { names: ['Soul Reaper', 'Poltergeist Smasher', 'Wraith Blade', 'Demon Hunter'], prefixes: ['Sanctified', 'Ethereal', 'Otherworldly', 'Cursed'], suffixes: ['of Exorcism', 'of Spirit Slaying'] },
            Special: { names: ['Reaper\'s Scythe', 'Ghostfire Blade', 'Banshee\'s Wail', 'Necromancer\'s Staff'], prefixes: ['Ancient', 'Forbidden', 'Supernatural', 'Occult'], suffixes: ['of the Beyond', 'of Soul Harvest'] },
            Legendary: { names: ['Death\'s Hand', 'Spirit Apocalypse', 'Soul Collector'], prefixes: ['Legendary', 'Ultimate', 'Eternal'], suffixes: ['of the Afterlife', 'of Final Rest'] }
        },
        Armor: {
            Low: { names: ['Tattered Suit', 'Dusty Coat', 'Old Dress', 'Moth-Eaten Cloak'], prefixes: ['Worn', 'Faded', 'Musty', 'Ancient'], suffixes: [''] },
            Medium: { names: ['Spirit Ward', 'Ghost Shroud', 'Blessed Robes', 'Medium\'s Attire'], prefixes: ['Protective', 'Sacred', 'Spectral', 'Warded'], suffixes: ['of Safety', 'of Shielding'] },
            High: { names: ['Exorcist\'s Garb', 'Soul Shield', 'Phantom Plate', 'Wraith Mail'], prefixes: ['Sanctified', 'Ethereal', 'Otherworldly', 'Blessed'], suffixes: ['of Spirit Defense', 'of Ghost Ward'] },
            Special: { names: ['Reaper\'s Cloak', 'Ghostweave Armor', 'Necromancer\'s Robes', 'Banshee\'s Veil'], prefixes: ['Ancient', 'Forbidden', 'Supernatural', 'Occult'], suffixes: ['of the Beyond', 'of Soul Protection'] },
            Legendary: { names: ['Death\'s Embrace', 'Spirit Guardian', 'Soul Sanctuary'], prefixes: ['Legendary', 'Ultimate', 'Eternal'], suffixes: ['of the Afterlife', 'of Perfect Ward'] }
        },
        Consumable: {
            Low: { names: ['Holy Water', 'Blessed Candle', 'Spirit Salt', 'Ghost Ward'], effects: ['Minor protection.', 'Weak banishing.', 'Basic warding.', 'Reveals spirits.'], stats: {} },
            Medium: { names: ['Exorcism Kit', 'Medium\'s Incense', 'Soul Balm', 'Phantom Ward'], effects: ['Moderate protection.', 'Banishes weak spirits.', 'Heals spiritual damage.', 'Repels ghosts.'], stats: { cure: 'Possession' } },
            High: { names: ['Sacred Relic', 'Spirit Binding', 'Soul Essence', 'Ghostfire'], effects: ['Major protection.', 'Binds powerful spirits.', 'Restores soul energy.', 'Controls ghosts.'], stats: { cure: 'All Spiritual' } },
            Special: { names: ['Reaper\'s Tear', 'Soul Crystal', 'Phantom Heart', 'Spirit Mirror'], effects: ['See the dead.', 'Control spirits.', 'Phase through walls.', 'Commune with ghosts.'], stats: { /* Temp buff structure deferred */ } },
            Legendary: { names: ['Life Force', 'Soul of Souls', 'Spirit\'s Essence'], effects: ['Revives with spiritual power.', 'Commands all spirits.', 'Ultimate ghost power.'], stats: { revive: true } }
        },
        Misc: {
            names: ['Spirit Board', 'Crystal Ball', 'Haunted Mirror', 'Old Locket', 'Ghost Photo', 'Cursed Doll', 'Spirit Bell', 'Ancient Key'], prefixes: ['Haunted', 'Cursed', 'Blessed', 'Spectral', 'Ethereal', '']
        },
        RevivalItemName: "Life Force"
    },
    // --- CYBERPUNK ---
    cyberpunk: {
        Weapon: {
            Low: { names: ['Neural Taser', 'Data Knife', 'Street Pistol', 'Shock Glove'], prefixes: ['Glitched', 'Bootleg', 'Street', 'Junk'], suffixes: [''] },
            Medium: { names: ['Cyber Katana', 'Neural Disruptor', 'Smart Gun', 'Plasma Cutter'], prefixes: ['Chrome', 'Digital', 'Neon', 'Hacked'], suffixes: ['v2.0', '.exe'] },
            High: { names: ['Quantum Blade', 'Neural Cannon', 'AI Rifle', 'Matrix Shredder'], prefixes: ['Military', 'Corporate', 'Enhanced', 'Overclocked'], suffixes: ['Pro', 'Elite'] },
            Special: { names: ['Reality Hacker', 'Mind Breaker', 'Code Killer', 'Data Destroyer'], prefixes: ['Prototype', 'Bleeding-Edge', 'Illegal', 'Black ICE'], suffixes: ['Ultra', 'Zero-Day'] },
            Legendary: { names: ['System Crash', 'Digital Apocalypse', 'God Killer.exe'], prefixes: ['Legendary', 'Ultimate', 'Perfect'], suffixes: ['∞', 'Root'] }
        },
        Armor: {
            Low: { names: ['Street Clothes', 'Synth Leather', 'Data Vest', 'Neural Shield'], prefixes: ['Used', 'Basic', 'Knockoff', 'Patched'], suffixes: [''] },
            Medium: { names: ['Combat Suit', 'Cyber Armor', 'Smart Fabric', 'Neural Mesh'], prefixes: ['Chrome', 'Digital', 'Neon', 'Hacked'], suffixes: ['v2.0', '.sys'] },
            High: { names: ['Quantum Weave', 'Neural Shell', 'AI Armor', 'Matrix Shield'], prefixes: ['Military', 'Corporate', 'Enhanced', 'Overclocked'], suffixes: ['Pro', 'Elite'] },
            Special: { names: ['Reality Suit', 'Mind Shell', 'Code Armor', 'Data Fortress'], prefixes: ['Prototype', 'Bleeding-Edge', 'Illegal', 'Black ICE'], suffixes: ['Ultra', 'Zero-Day'] },
            Legendary: { names: ['System Shell', 'Digital Fortress', 'God Mode.sys'], prefixes: ['Legendary', 'Ultimate', 'Perfect'], suffixes: ['∞', 'Root'] }
        },
        Consumable: {
            Low: { names: ['Stim Pack', 'Neural Patch', 'Data Shard', 'Code Fragment'], effects: ['Minor boost.', 'Basic system repair.', 'Small data recovery.', 'Simple hack.'], stats: {} },
            Medium: { names: ['Combat Stims', 'System Repair', 'Memory Boost', 'ICE Breaker'], effects: ['Combat enhancement.', 'Repairs cyber systems.', 'Enhances processing.', 'Breaks security.'], stats: { cure: 'Malware' } },
            High: { names: ['Neural Overdrive', 'System Optimizer', 'Memory Expander', 'Deep Hack'], effects: ['Major enhancement.', 'Full system repair.', 'Maximum processing.', 'Complete override.'], stats: { cure: 'All Digital' } },
            Special: { names: ['Reality Hack', 'Mind Upload', 'Code Rewriter', 'Data Storm'], effects: ['Alters digital reality.', 'Temporary consciousness transfer.', 'Rewrites system rules.', 'Overwhelming data attack.'], stats: { /* Temp buff structure deferred */ } },
            Legendary: { names: ['System Core', 'Digital Soul', 'God Protocol'], effects: ['Revives with root access.', 'Grants system control.', 'Ultimate override.'], stats: { revive: true } }
        },
        Misc: {
            names: ['Data Chip', 'Neural Link', 'Holo Display', 'Smart Contact', 'Memory Crystal', 'System Key', 'AI Fragment', 'Reality Shard'], prefixes: ['Glitched', 'Encrypted', 'Quantum', 'Neural', 'Viral', '']
        },
        RevivalItemName: "System Core"
    },
    // --- WILD WEST ---
    wild_west: {
        Weapon: {
            Low: { names: ['Rusty Revolver', 'Old Rifle', 'Hunting Knife', 'Lasso'], prefixes: ['Worn', 'Dusty', 'Simple', 'Basic'], suffixes: [''] },
            Medium: { names: ['Six-Shooter', 'Winchester', 'Bowie Knife', 'Repeater'], prefixes: ['Reliable', 'Trusty', 'Sheriff\'s', 'Frontier'], suffixes: ['of the West', 'of Justice'] },
            High: { names: ['Sharpshooter', 'Double-Action', 'Tomahawk', 'Buffalo Gun'], prefixes: ['Legendary', 'Outlaw\'s', 'Marshal\'s', 'Gunslinger\'s'], suffixes: ['of the Law', 'of the Desperado'] },
            Special: { names: ['Peacemaker', 'Golden Gun', 'Lightning Draw', 'Judge\'s Gavel'], prefixes: ['Famous', 'Notorious', 'Mythical', 'Deadshot'], suffixes: ['of Legend', 'of the Quick Draw'] },
            Legendary: { names: ['Death\'s Draw', 'Last Word', 'Final Justice'], prefixes: ['Legendary', 'Ultimate', 'Perfect'], suffixes: ['of the True West', 'of High Noon'] }
        },
        Armor: {
            Low: { names: ['Leather Vest', 'Duster Coat', 'Work Boots', 'Bandana'], prefixes: ['Worn', 'Dusty', 'Simple', 'Basic'], suffixes: [''] },
            Medium: { names: ['Sheriff\'s Vest', 'Rancher\'s Coat', 'Cavalry Boots', 'Deputy Badge'], prefixes: ['Sturdy', 'Reliable', 'Frontier', 'Lawman\'s'], suffixes: ['of Protection', 'of the Badge'] },
            High: { names: ['Marshal\'s Coat', 'Gunfighter\'s Gear', 'Outlaw\'s Attire', 'Bounty Hunter\'s Vest'], prefixes: ['Reinforced', 'Famous', 'Notorious', 'Legend\'s'], suffixes: ['of Authority', 'of the Gunslinger'] },
            Special: { names: ['Legend\'s Duster', 'Quick Draw Gear', 'Deadshot Attire', 'Justice Bringer\'s Suit'], prefixes: ['Mythical', 'Infamous', 'Legendary', 'Hero\'s'], suffixes: ['of the Wild West', 'of High Plains'] },
            Legendary: { names: ['True West Attire', 'Last Stand Armor', 'Final Frontier'], prefixes: ['Legendary', 'Ultimate', 'Perfect'], suffixes: ['of the Old West', 'of the Frontier'] }
        },
        Consumable: {
            Low: { names: ['Trail Rations', 'Whiskey', 'Bandages', 'Snake Oil'], effects: ['Basic sustenance.', 'Minor healing.', 'Stops bleeding.', 'Questionable benefits.'], stats: {} },
            Medium: { names: ['Medicine Kit', 'Doc\'s Tonic', 'Healing Salve', 'Moonshine'], effects: ['Good healing.', 'Cures ailments.', 'Restores health.', 'Liquid courage.'], stats: { cure: 'Poison' } },
            High: { names: ['Miracle Cure', 'Doc\'s Special', 'Indian Medicine', 'Golden Elixir'], effects: ['Major healing.', 'Cures all ailments.', 'Restores vitality.', 'Grants strength.'], stats: { cure: 'All Physical' } },
            Special: { names: ['Legend\'s Brew', 'Quick Draw Tonic', 'Dead Eye Drops', 'Hero\'s Spirit'], effects: ['Slows time.', 'Perfect accuracy.', 'Enhanced reflexes.', 'Temporary invulnerability.'], stats: { /* Temp buff structure deferred */ } },
            Legendary: { names: ['Phoenix Oil', 'Frontier Spirit', 'Last Chance'], effects: ['Revives with frontier spirit.', 'Grants legendary prowess.', 'Ultimate healing.'], stats: { revive: true } }
        },
        Misc: {
            names: ['Sheriff Badge', 'Wanted Poster', 'Lucky Coin', 'Compass', 'Trail Map', 'Gold Nugget', 'Horse Shoe', 'Playing Cards'], prefixes: ['Lucky', 'Dusty', 'Authentic', 'Frontier', 'Legendary', '']
        },
        RevivalItemName: "Phoenix Oil"
    },
    // --- POST APOCALYPSE ---
    post_apoc: {
        Weapon: {
            Low: { names: ['Pipe Wrench', 'Rusty Chain', 'Scrap Blade', 'Nail Bat'], prefixes: ['Broken', 'Makeshift', 'Salvaged', 'Crude'], suffixes: [''] },
            Medium: { names: ['Wasteland Rifle', 'Scavenger\'s Gun', 'Survivor\'s Blade', 'Raider Weapon'], prefixes: ['Modified', 'Reinforced', 'Scavenged', 'Reliable'], suffixes: ['of Survival', 'of the Wastes'] },
            High: { names: ['Radiation Cannon', 'Mutant Slayer', 'Toxic Avenger', 'Doomsday Device'], prefixes: ['Advanced', 'Enhanced', 'Deadly', 'Contaminated'], suffixes: ['of Destruction', 'of the Apocalypse'] },
            Special: { names: ['Fallout Bringer', 'Wasteland Legend', 'Doom Harbinger', 'End Times'], prefixes: ['Prototype', 'Experimental', 'Forbidden', 'Ancient'], suffixes: ['of Armageddon', 'of World\'s End'] },
            Legendary: { names: ['World Ender', 'Apocalypse Dawn', 'Final Day'], prefixes: ['Legendary', 'Ultimate', 'Perfect'], suffixes: ['of Extinction', 'of the Last War'] }
        },
        Armor: {
            Low: { names: ['Scrap Vest', 'Leather Wraps', 'Tire Armor', 'Gas Mask'], prefixes: ['Patched', 'Makeshift', 'Salvaged', 'Crude'], suffixes: [''] },
            Medium: { names: ['Survivor\'s Gear', 'Raider Armor', 'Hazmat Suit', 'Wasteland Guard'], prefixes: ['Modified', 'Reinforced', 'Protected', 'Reliable'], suffixes: ['of Survival', 'of Radiation'] },
            High: { names: ['Mutant Hide', 'Contamination Suit', 'Fallout Armor', 'Doomsday Plate'], prefixes: ['Advanced', 'Enhanced', 'Contaminated', 'Deadly'], suffixes: ['of Protection', 'of the Wastes'] },
            Special: { names: ['Apocalypse Suit', 'Wasteland Legend', 'End Times Armor', 'Doom Guard'], prefixes: ['Prototype', 'Experimental', 'Forbidden', 'Ancient'], suffixes: ['of the Last Days', 'of World\'s End'] },
            Legendary: { names: ['Survivor\'s Legacy', 'World\'s Last Hope', 'Final Defense'], prefixes: ['Legendary', 'Ultimate', 'Perfect'], suffixes: ['of the New Dawn', 'of Rebirth'] }
        },
        Consumable: {
            Low: { names: ['Canned Food', 'Dirty Water', 'Scrap Bandage', 'Rad Pills'], effects: ['Basic sustenance.', 'Questionable hydration.', 'Minor healing.', 'Slight rad reduction.'], stats: {} },
            Medium: { names: ['Med Kit', 'Purified Water', 'Anti-Rad', 'Stim Pack'], effects: ['Good healing.', 'Safe hydration.', 'Reduces radiation.', 'Combat boost.'], stats: { cure: 'Radiation' } },
            High: { names: ['Survivor\'s Serum', 'Wasteland Cure', 'Mutation Reversal', 'Pure Water'], effects: ['Major healing.', 'Cures mutations.', 'Full rad removal.', 'Perfect hydration.'], stats: { cure: 'All Radiation' } },
            Special: { names: ['Apocalypse Antidote', 'Mutation Enhancer', 'Time Capsule', 'Last Hope'], effects: ['Grants immunity.', 'Controlled mutation.', 'Preserves life.', 'Emergency rescue.'], stats: { /* Temp buff structure deferred */ } },
            Legendary: { names: ['Phoenix Serum', 'Rebirth Elixir', 'New Dawn'], effects: ['Revives with immunity.', 'Grants perfect adaptation.', 'Ultimate survival.'], stats: { revive: true } }
        },
        Misc: {
            names: ['Geiger Counter', 'Survival Guide', 'Scrap Parts', 'Old Map', 'Emergency Radio', 'Bunker Key', 'Memory Drive', 'Strange Artifact'], prefixes: ['Salvaged', 'Broken', 'Modified', 'Ancient', 'Contaminated', '']
        },
        RevivalItemName: "Phoenix Serum"
    },
    // --- CUSTOM (Generic Fallbacks) ---
    custom: {
        Weapon: {
            Low: { names: ['Improvised Club', 'Basic Tool', 'Sharp Stick'], prefixes: ['Makeshift', 'Crude', 'Weak', ''], suffixes: [''] },
            Medium: { names: ['Standard Blade', 'Reliable Hammer', 'Sturdy Staff'], prefixes: ['Decent', 'Common', 'Balanced', ''], suffixes: ['+1'] },
            High: { names: ['Advanced Energy Projector', 'Heavy Breaching Tool', 'Reinforced Combat Rod'], prefixes: ['Superior', 'Powerful', 'Well-Crafted', ''], suffixes: ['Mk.III'] },
            Special: { names: ['Unique Artifact', 'Specialized Gadget', 'Modified Implement'], prefixes: ['Rare', 'Modified', 'Strange', 'Anomalous'], suffixes: ['Prototype'] },
            Legendary: { names: ['Ultimate Weapon', 'Reality Stabilizer', 'Singularity Edge'], prefixes: ['Legendary', 'Alpha', 'Omega'], suffixes: ['Infinite'] },
        },
        Armor: {
            Low: { names: ['Basic Cloth', 'Light Padding', 'Simple Covering'], prefixes: ['Worn', 'Thin', 'Basic', ''], suffixes: [''] },
            Medium: { names: ['Standard Protective Gear', 'Medium Plating', 'Decent Outfit'], prefixes: ['Reinforced', 'Sturdy', 'Common', ''], suffixes: ['v2.0'] },
            High: { names: ['Heavy Combat Suit', 'Strong Deflector', 'Advanced Weave'], prefixes: ['Superior', 'Durable', 'Protective', ''], suffixes: ['Integrated'] },
            Special: { names: ['Unique Exoskeleton', 'Specialized Field Emitter', 'Modified Clothing'], prefixes: ['Rare', 'Modified', 'Enhanced', 'Adaptive'], suffixes: ['Custom Fit'] },
            Legendary: { names: ['Ultimate Defense System', 'Temporal Shield', 'Aura of Power'], prefixes: ['Legendary', 'Perfected', 'Ascendant'], suffixes: ['Unbreakable'] },
        },
        Consumable: {
            Low: { names: ['Minor Restorative', 'Basic Sustenance', 'Simple Remedy', 'Component Pack'], effects: ['Minor healing.', 'Basic energy.', 'Slight relief.', 'Contains common parts.'], stats: {} },
            Medium: { names: ['Standard Restorative', 'Filling Meal', 'Common Remedy', 'Med-Patch'], effects: ['Moderate healing.', 'Good energy.', 'Effective relief.', 'Standard medical aid.'], stats: { cure: 'Bleeding' } },
            High: { names: ['Major Restorative', 'Hearty Feast', 'Potent Remedy', 'Stim-Injector'], effects: ['Significant healing.', 'Lasting energy.', 'Strong relief.', 'Temporary combat boost.'], stats: { cure: 'All Minor' } },
            Special: { names: ['Temporary Power-Up', 'Useful Gadget', 'Situational Aid', 'Energy Cell'], effects: ['Provides a short-term advantage.', 'Helps overcome an obstacle.', 'Useful in specific circumstances.', 'Powers devices.'], stats: { /* Temp buff structure deferred */ } },
            Legendary: { names: ['Universal Fix', 'Essence of Life', 'Miracle Cure'], effects: ['Completely restores target.', 'Revives the fallen.', 'Cures any affliction.'], stats: { revive: true } }
        },
        Misc: {
            names: ['Useful Tool', 'Container', 'Light Source', 'Fastener', 'Marker', 'Component', 'Data Chip', 'Key Card'], prefixes: ['Generic', 'Standard', 'Multi-use', 'Secure', 'Bio-locked', '']
       },
        RevivalItemName: "Spark of Life",
    },
    // Additional themes can be added here as the game expands
};

// --- Stat Ranges per Tier ---
const statRanges = {
    // Type: [Low_Min, Low_Max, Med_Min, Med_Max, High_Min, High_Max, Spec_Min, Spec_Max, Leg_Min, Leg_Max, God_Min, God_Max]
    WeaponATK: [3, 6,    7, 12,   13, 20,   21, 30,   35, 50,   60, 100],
    ArmorDEF:  [2, 4,    5, 8,    9, 15,    16, 25,   30, 45,   50, 80],
    HealAmount:[15, 30,  35, 60,  65, 100,  0, 0,      0, 0,     0, 0],
    // Other potential stats ranges deferred
};

/**
 * Generates a stat value within the defined range for a given tier and stat type.
 * @param {keyof Config.Tiers} tier - The item tier.
 * @param {'WeaponATK' | 'ArmorDEF' | 'HealAmount' | string} statType - The type of stat.
 * @returns {number} The generated stat value.
 */
function generateStatValue(tier, statType) {
    // (Unchanged)
    const ranges = statRanges[statType];
    if (!ranges) return 0;
    const tierNames = Object.values(Config.Tiers);
    const tierIndex = tierNames.indexOf(tier);
    if (tierIndex === -1 || (tierIndex * 2 + 1) >= ranges.length) {
         if (window.displayVisualError) displayVisualError(`Warning: Stat range not fully defined for tier '${tier}' (Index: ${tierIndex}) stat '${statType}'. Using 0.`);
         return 0;
    }
    const min = ranges[tierIndex * 2];
    const max = ranges[tierIndex * 2 + 1];
    if (typeof min !== 'number' || typeof max !== 'number') {
        if (window.displayVisualError) displayVisualError(`Warning: Min/Max not defined correctly for tier '${tier}' stat '${statType}'. Using 0.`);
        return 0;
    }
    return getRandomInt(min, max);
}


/**
 * Generates a themed item object.
 * @param {string} theme - The adventure theme key (e.g., 'fantasy', 'space').
 * @param {keyof Config.Tiers} tier - The desired item tier.
 * @param {'Weapon' | 'Armor' | 'Consumable' | 'Misc' | 'Revival'} type - The desired item type.
 * @returns {Item | null} The generated item object, or null if generation fails.
 */
export function generateThemedItem(theme, tier, type) {
    // (Unchanged, handles Revival type correctly)
    const currentTheme = theme || gameState.adventureTheme || 'custom';
    const themeData = themedItemData[currentTheme] || themedItemData.custom;

    if (type === 'Revival') {
        const revivalName = themeData.RevivalItemName || Config.REVIVAL_ITEM_DEFAULT_NAME;
        const revivalTier = Config.Tiers.SPECIAL;
        const revivalCost = Config.REVIVAL_ITEM_BASE_COST + getRandomInt(-20, 30);
         if (window.displayVisualError) displayVisualError(`Generating Revival Item: ${revivalName} (Theme: ${currentTheme}, Tier: ${revivalTier})`);
        return {
            id: generateId('item'),
            name: revivalName,
            type: 'Consumable', // Revival items are consumable
            tier: revivalTier,
            effect: `Revives a downed ally with ${Config.REVIVE_HP_PERCENT_ITEM * 100}% health.`,
            stats: { revive: true, healPercent: Config.REVIVE_HP_PERCENT_ITEM },
            cost: revivalCost,
            quantity: 1,
            equippedSlot: null,
        };
    }

    let categoryData = themeData[type];
    // B1: 'Quest' type isn't defined in any theme's data — Quest items are
    // narrative props rather than procedurally generated. Map missing type
    // to the closest available category so the legacy generator stops
    // erroring. Engine-emitted Quest items skip this path entirely.
    if (!categoryData) {
        const fallbackType = type === 'Quest' ? 'Misc'
            : type === 'Revival' ? 'Consumable'
            : null;
        if (fallbackType && themeData[fallbackType]) {
            categoryData = themeData[fallbackType];
            if (window.displayVisualError) displayVisualError(`Note: Item Type '${type}' not in theme '${currentTheme}'; falling back to '${fallbackType}'.`);
        } else {
            console.error(`Item Generation Error: Type '${type}' not defined for theme '${currentTheme}'.`);
            if (window.displayVisualError) displayVisualError(`ERROR: Item Type '${type}' not defined for theme '${currentTheme}'.`);
            return null;
        }
    }

    let specificTypeData = categoryData[tier];
    let actualTier = tier;

    if (!specificTypeData) {
        const tierOrder = Object.values(Config.Tiers);
        let fallbackTierIndex = tierOrder.indexOf(tier) - 1;
        while (fallbackTierIndex >= 0) {
             const fallbackTier = tierOrder[fallbackTierIndex];
             specificTypeData = categoryData[fallbackTier];
             if (specificTypeData) {
                 if (window.displayVisualError) displayVisualError(`Warning: Tier '${tier}' not found for ${type} in '${currentTheme}'. Falling back to '${fallbackTier}'.`);
                 actualTier = fallbackTier;
                 break;
             }
            fallbackTierIndex--;
        }
        if (!specificTypeData) {
            if (window.displayVisualError) displayVisualError(`ERROR: No data for ${type} tier '${tier}' or lower in theme '${currentTheme}'.`);
            return null;
        }
    }

    const names = specificTypeData.names || ['Generic Item'];
    const prefixes = specificTypeData.prefixes || [''];
    const suffixes = specificTypeData.suffixes || [''];
    const effects = specificTypeData.effects || [`A ${actualTier} ${type}.`];

    const prefix = getRandomElement(prefixes);
    const name = getRandomElement(names);
    const suffix = getRandomElement(suffixes);
    const finalName = `${prefix} ${name} ${suffix}`.replace(/\s+/g, ' ').trim();

    const item = {
        id: generateId('item'),
        name: finalName,
        type: type,
        tier: actualTier,
        effect: getRandomElement(effects),
        stats: { ...(specificTypeData.stats || {}) },
        cost: Config.DefaultItemCosts[actualTier] || 10,
        quantity: type === 'Consumable' ? 1 : undefined,
        equippedSlot: null,
    };

    switch (type) {
        case 'Weapon': 
            if (!item.stats) item.stats = {};
            item.stats.atk = (item.stats.atk || 0) + generateStatValue(actualTier, 'WeaponATK');
            
            // Add elemental damage and status effects for enhanced weapons
            if (specificTypeData.elements && specificTypeData.elements.length > 0) {
                const element = getRandomElement(specificTypeData.elements);
                if (element !== 'Physical') {
                    item.stats.element = element;
                    item.effect += ` Deals ${element} damage.`;
                }
                
                // Chance to apply status effects based on element and tier
                const statusChance = specificTypeData.statusChance || 0;
                if (Math.random() < statusChance) {
                    let statusEffect = null;
                    switch (element) {
                        case 'Fire': statusEffect = 'Burn'; break;
                        case 'Ice': statusEffect = 'Frost'; break;
                        case 'Lightning': statusEffect = 'Paralysis'; break;
                        case 'Poison': statusEffect = 'Poison'; break;
                        case 'Holy': statusEffect = 'Shield'; break;
                        case 'Dark': statusEffect = 'Weakness'; break;
                    }
                    
                    if (statusEffect) {
                        item.stats.onHitStatus = statusEffect;
                        item.effect += ` Has a chance to inflict ${statusEffect}.`;
                    }
                }
            }
            break;
        case 'Armor': 
            if (!item.stats) item.stats = {};
            item.stats.def = (item.stats.def || 0) + generateStatValue(actualTier, 'ArmorDEF');
            
            // Add elemental resistances for higher tier armor
            if (actualTier === Config.Tiers.HIGH || actualTier === Config.Tiers.SPECIAL || actualTier === Config.Tiers.LEGENDARY) {
                const elements = ['Fire', 'Ice', 'Lightning', 'Poison'];
                if (Math.random() < 0.3) { // 30% chance for resistance
                    const element = getRandomElement(elements);
                    const resistance = actualTier === Config.Tiers.LEGENDARY ? 0.5 : 0.25; // 50% or 25% resistance
                    if (!item.stats) item.stats = {};
                    if (!item.stats.resistances) item.stats.resistances = {};
                    item.stats.resistances[element] = resistance;
                    item.effect += ` Provides ${resistance * 100}% resistance to ${element} damage.`;
                }
            }
            break;
        case 'Consumable':
              const isHealingItem = /heal|potion|salve|elixir|draught|medikit|med-spray/i.test(item.name);
             if (!item.stats) item.stats = {};
             if (isHealingItem && item.stats.heal === undefined && item.stats.revive !== true) {
                 item.stats.heal = generateStatValue(actualTier, 'HealAmount');
                 if (item.effect.length < 50) { item.effect = `Restores ${item.stats.heal} HP. ${item.effect}`; }
             }
             // Temp buff structure implementation deferred.
            break;
        case 'Misc': delete item.cost; break; // Misc items usually have no cost
    }

    if (item.cost !== undefined) {
        item.cost = Math.max(1, getRandomInt(Math.floor(item.cost * 0.8), Math.ceil(item.cost * 1.2)));
    }

    if (window.displayVisualError) displayVisualError(`Generated Item: ${item.name} (Type: ${type}, Tier: ${actualTier})`);
    return item;
}

/**
 * Generates a list of items for the shop based on theme and turn number.
 * @param {string} theme - The adventure theme.
 * @param {number} turn - The current game turn (influences tier probability).
 * @returns {Item[]} An array of items available in the shop.
 */
export function generateShopItems(theme, turn) {
    // (Unchanged)
     if (window.displayVisualError) displayVisualError(`Generating shop items for theme '${theme}', turn ${turn}...`);
    const shopItems = [];
    const maxItems = 8;
    const attemptsBudget = maxItems * 3;
    let attempts = 0;

    const tierProbability = calculateTierProbability(turn);
    if (window.displayVisualError) displayVisualError(`Shop Tier Prob (Turn ${turn}): ${JSON.stringify(tierProbability, null, 1)}`);

    // --- Add Guaranteed Basics ---
    let basicHeal = null;
    for (let i = 0; i < 5; i++) {
        const potentialHeal = generateThemedItem(theme, Config.Tiers.LOW, 'Consumable');
        if (potentialHeal?.stats?.heal) { basicHeal = potentialHeal; break; }
    }
    if (basicHeal) { shopItems.push(basicHeal); if (window.displayVisualError) displayVisualError(`Added basic heal to shop: ${basicHeal.name}`); }
    else { if (window.displayVisualError) displayVisualError("Warning: Could not generate a basic healing item for the shop."); }

    const revivalItem = generateThemedItem(theme, Config.Tiers.SPECIAL, 'Revival');
    if (revivalItem) { shopItems.push(revivalItem); if (window.displayVisualError) displayVisualError(`Added revival item to shop: ${revivalItem.name}`); }
    else { if (window.displayVisualError) displayVisualError("Warning: Failed to generate revival item for the shop."); }

    // --- Add Random Assortment ---
    let addedCount = shopItems.length;
    while (addedCount < maxItems && attempts < attemptsBudget) {
        attempts++;
        const tier = getRandomTierBasedOnProbability(tierProbability);
        const typeRoll = Math.random();
        let type;
        if (typeRoll < 0.35) type = 'Weapon';
        else if (typeRoll < 0.70) type = 'Armor';
        else if (typeRoll < 0.95) type = 'Consumable';
        else type = 'Misc';
        const item = generateThemedItem(theme, tier, type);
        if (item && (item.cost || type === 'Misc') && !shopItems.some(existing => existing.name === item.name)) {
             shopItems.push(item);
             addedCount++;
        }
    }

    if (window.displayVisualError) displayVisualError(`Generated ${shopItems.length} shop items after ${attempts} attempts.`);
    return shopItems.filter(item => item != null).map(item => ({ ...item, id: generateId('shop') }));
}

/**
 * Calculates the probability distribution for item tiers based on the game turn.
 * @param {number} turn - The current game turn.
 * @returns {object} An object mapping tiers (string keys from Config.Tiers) to their probability (0-1).
 */
function calculateTierProbability(turn) {
    // (Unchanged)
    const baseProb = {
        [Config.Tiers.LOW]: 0.50, [Config.Tiers.MEDIUM]: 0.30, [Config.Tiers.HIGH]: 0.15,
        [Config.Tiers.SPECIAL]: 0.04, [Config.Tiers.LEGENDARY]: 0.01, [Config.Tiers.GOD]: 0.00,
    };
    const shiftPerXTURNS = 5; const shiftAmount = 0.05;
    const numberOfShifts = Math.floor(Math.max(0, turn - 1) / shiftPerXTURNS);
    let currentProb = { ...baseProb };
    for (let shift = 0; shift < numberOfShifts; shift++) {
        let massToShift = shiftAmount; let moved;
        moved = Math.min(massToShift, currentProb[Config.Tiers.LOW] * 0.5);
        if (moved > 0 && currentProb[Config.Tiers.LOW] > 0.01) { currentProb[Config.Tiers.LOW] -= moved; currentProb[Config.Tiers.MEDIUM] += moved; massToShift -= moved; }
        moved = Math.min(massToShift, currentProb[Config.Tiers.MEDIUM] * 0.4);
         if (moved > 0 && currentProb[Config.Tiers.MEDIUM] > 0.01) { currentProb[Config.Tiers.MEDIUM] -= moved; currentProb[Config.Tiers.HIGH] += moved; massToShift -= moved; }
        moved = Math.min(massToShift, currentProb[Config.Tiers.HIGH] * 0.3);
         if (moved > 0 && currentProb[Config.Tiers.HIGH] > 0.01) { currentProb[Config.Tiers.HIGH] -= moved; currentProb[Config.Tiers.SPECIAL] += moved; massToShift -= moved; }
         moved = Math.min(massToShift, currentProb[Config.Tiers.SPECIAL] * 0.2);
         if (moved > 0 && currentProb[Config.Tiers.SPECIAL] > 0.01) { currentProb[Config.Tiers.SPECIAL] -= moved; currentProb[Config.Tiers.LEGENDARY] += moved; }
    }
    let totalProb = Object.values(currentProb).reduce((sum, p) => sum + p, 0);
    if (totalProb > 0) { for (const tier in currentProb) { currentProb[tier] /= totalProb; } } else { currentProb[Config.Tiers.LOW] = 1.0; }
    for (const tier in currentProb) { if (currentProb[tier] < 0) currentProb[tier] = 0; }
     totalProb = Object.values(currentProb).reduce((sum, p) => sum + p, 0);
     if (totalProb > 0) { for (const tier in currentProb) { currentProb[tier] /= totalProb; } } else { currentProb[Config.Tiers.LOW] = 1.0; }
    return currentProb;
}

/**
 * Selects a random tier based on a probability distribution object. Helper function.
 * @param {object} probabilities - Object mapping tiers (string keys from Config.Tiers) to probabilities.
 * @returns {keyof Config.Tiers} The selected tier name.
 */
function getRandomTierBasedOnProbability(probabilities) {
    // (Unchanged)
    const rand = Math.random(); let cumulative = 0;
    const tierOrder = Object.values(Config.Tiers);
    for (const tier of tierOrder) {
         const prob = probabilities[tier] || 0;
         cumulative += prob;
         if (rand < cumulative) { return tier; }
    }
    if (window.displayVisualError) displayVisualError("Warning: Failed to select random tier, defaulting to Low.");
    return Config.Tiers.LOW;
}

/**
 * Generates initial items for a player at the start of the game.
 * @param {string} theme - The adventure theme.
 * @returns {Item[]} An array of starting items (weapon, armor, consumable).
 */
export function generateStartingItems(theme) {
     // (Unchanged)
     if (window.displayVisualError) displayVisualError(`Generating starting items for theme '${theme}'...`);
    const items = [];
    const weapon = generateThemedItem(theme, Config.Tiers.LOW, 'Weapon');
    if (weapon) items.push(weapon);
    const armor = generateThemedItem(theme, Config.Tiers.LOW, 'Armor');
    if (armor) items.push(armor);
    let consumable = null; let retries = 0;
    while (retries < 5 && (!consumable || !consumable.stats?.heal)) {
        consumable = generateThemedItem(theme, Config.Tiers.LOW, 'Consumable'); retries++;
    }
    if (consumable) { items.push(consumable); }
    else { if (window.displayVisualError) displayVisualError("Warning: Could not generate a starting healing consumable."); }
    if (window.displayVisualError) displayVisualError(`Generated ${items.length} starting items.`);
    return items.filter(item => item !== null);
}

/**
 * Generates potential item loot drops based on theme, enemy tier, and chance.
 * @param {string} theme - Adventure theme.
 * @param {number} chance - Base chance (0-1) to get any loot from this source.
 * @param {keyof Config.Tiers} maxTier - The maximum tier of loot possible from this source (e.g., enemy's lootTier).
 * @returns {Item | null} A generated loot item or null.
 */
export function generateLootDrop(theme, chance, maxTier) {
    // (Unchanged)
    if (Math.random() > chance) return null;
    if (window.displayVisualError) displayVisualError(`Loot Drop Check: Passed chance roll (${chance}). Max Tier: ${maxTier}.`);
    const tierProb = calculateTierProbability(gameState.turn);
    const possibleTiers = Object.values(Config.Tiers);
    let maxTierIndex = possibleTiers.indexOf(maxTier);
    if (maxTierIndex === -1) {
         if (window.displayVisualError) displayVisualError(`Warning: Invalid maxTier '${maxTier}' for loot drop. Defaulting Low.`);
         maxTier = Config.Tiers.LOW; maxTierIndex = possibleTiers.indexOf(maxTier);
    }
    let filteredProbs = {}; let validProbSum = 0;
    for (let i = 0; i <= maxTierIndex; i++) {
        const currentTier = possibleTiers[i]; const prob = tierProb[currentTier] || 0;
        if (prob > 0) { filteredProbs[currentTier] = prob; validProbSum += prob; }
    }
     if (validProbSum > 0) { for (const tier in filteredProbs) { filteredProbs[tier] /= validProbSum; } }
     else { if (window.displayVisualError) displayVisualError(`Warning: No valid loot tiers found up to ${maxTier}. Defaulting to ${maxTier}.`); filteredProbs[maxTier] = 1.0; }
    if (window.displayVisualError) displayVisualError(`Loot Filtered Tier Prob: ${JSON.stringify(filteredProbs, null, 1)}`);
    const droppedTier = getRandomTierBasedOnProbability(filteredProbs);
    const typeRoll = Math.random(); let droppedType;
     if (typeRoll < 0.25) droppedType = 'Weapon'; else if (typeRoll < 0.50) droppedType = 'Armor'; else if (typeRoll < 0.85) droppedType = 'Consumable'; else droppedType = 'Misc';
    if (window.displayVisualError) displayVisualError(`Generating loot drop: Tier ${droppedTier}, Type ${droppedType}`);
    return generateThemedItem(theme, droppedTier, droppedType);
}