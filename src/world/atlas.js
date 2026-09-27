// The handcrafted geography of Sosaria. Everything here is data: lat/lon in degrees,
// heights in world units above sea level (planet radius 100). Worker-safe.

export const WORLD_SEED = 7331;

// Continent blobs: [lat, lon, radiusDeg, weight]. Summed with a Gaussian falloff; > 0.5 is land.
export const CONTINENTS = [
  // Aldmere: the great northern continent (Valdren, Elvenwood, Ironpeak, Faewild)
  [38, -34, 13, 1.0], [30, -46, 10, 0.95], [48, -14, 9, 0.95], [24, -24, 8, 0.9],
  [53, -44, 10, 0.95], [56, -25, 8, 0.9], [37, -56, 7, 0.85], [22, -12, 6, 0.9],
  [42, -4, 6, 0.85], [60, -36, 9, 0.9], [20, -40, 6, 0.85],
  [26.2, -29.5, 2.6, -1.15], [23.6, -29.2, 3.0, -1.3], [20.4, -28.8, 3.0, -1.3], // Saltmere Bay, open to the south
  // Frostreach: the polar north, joined to Aldmere by tundra
  [90, 0, 24, 1.0], [72, 60, 9, 0.85], [71, -120, 8, 0.8], [70, 150, 6, 0.75], [66, -60, 6, 0.8],
  // Thornsteppe: the southern steppe continent of the beastfolk
  [-28, 18, 15, 1.0], [-40, 33, 9, 0.95], [-16, 5, 7, 0.9], [-45, 7, 8, 0.85], [-22, 38, 7, 0.85],
  // Emberreach: volcanic highlands of the dragon cults
  [22, 80, 11, 1.0], [12, 68, 7, 0.9], [31, 93, 7, 0.9], [14, 90, 5, 0.8],
  // Gloamfen: the cursed isles
  [19, -177, 6.5, 0.95], [26, 172, 4.5, 0.9], [12, -168, 3.8, 0.85], [16, 164, 2.6, 0.8],
  // Varrowmark: wild highlands of a fallen empire
  [47, 128, 9, 1.0], [40, 140, 6, 0.9], [54, 117, 5.5, 0.9],
  // Verdant Reach: jungle isle
  [-16, -111, 7.5, 1.0], [-22, -102, 5, 0.9],
  // Southern ice
  [-90, 0, 15, 1.0], [-76, 80, 5, 0.8],
  // Wyvernmoor: windswept highland moors of griffins and wyverns
  [48, -100, 7.5, 1.0], [41, -92, 4.5, 0.9], [54, -109, 4.5, 0.9],
  // Thornwood: dark forested isles in the southern sea
  [-37, 133, 6, 1.0], [-30, 143, 3.6, 0.9], [-43, 126, 3.2, 0.85],
  // Tidewrack Isles: a pirate archipelago
  [-40, -148, 3.2, 0.95], [-34, -140, 2.2, 0.9], [-45, -139, 2.0, 0.9], [-36, -156, 1.8, 0.85],
  // Small isles
  [2, -41, 2.1, 0.95], [-20, -78, 1.4, 0.9], [8, -58, 0.7, 0.8], [-5, 120, 2.2, 0.85],
  [5, 30, 1.8, 0.85], [-8, 150, 2.0, 0.85],
];

// Mountain ranges: polyline of [lat, lon], half-width in degrees, peak height.
export const RANGES = [
  { name: 'Ironpeak Mountains', pts: [[58, -64], [58.5, -52], [57, -42], [56, -33], [55.5, -24], [53.5, -17]], width: 3.4, height: 6.4 },
  { name: 'Frostfang Range', pts: [[72, -46], [75, -20], [76.5, 5], [75, 30], [72.5, 52]], width: 4.4, height: 6.4 },
  { name: 'Emberspire', pts: [[31, 71], [28, 77], [21.5, 90], [16, 95]], width: 3.0, height: 4.8 },
  { name: 'Varrow Highlands', pts: [[54, 119], [49.5, 133], [43, 144]], width: 3.0, height: 4.2 },
  { name: 'Southmarch Hills', pts: [[21, -52], [19.5, -45]], width: 2.2, height: 2.0 },
  { name: 'Tuskback Ridge', pts: [[-20, 34], [-27, 42]], width: 2.4, height: 2.6 },
  { name: 'Verdant Spine', pts: [[-19, -117], [-15, -110]], width: 2.0, height: 2.8 },
  { name: 'Pale Spires', pts: [[-72, -40], [-78, 40], [-75, 100]], width: 5, height: 5.0 },
];

// Isolated landmark peaks: [lat, lon, radiusDeg, height]
export const PEAKS = [
  [76, 5, 2.2, 3.2],     // Skarn's Roost (frost dragon)
  [21, -172.5, 1.3, 2.4], // Barrow Tor
  [57.5, -38, 1.5, 1.8],  // Khaz Durak's crown
];

export const VOLCANO = { name: 'Mount Cindermaw', lat: 24, lon: 83, radius: 5.4, height: 7.6, crater: 1.3 };

// Realms. Colors are sRGB 0..1. `trees` gives species weights for scattering.
export const REGIONS = [
  { id: 'wild', name: 'The Wilds', center: null, r: 0,
    grass: [0.40, 0.56, 0.22], dry: [0.62, 0.60, 0.30], forest: 0.46, hills: 0.7,
    trees: { oak: 0.45, pine: 0.35, birch: 0.2 } },
  { id: 'valdren', name: 'Kingdom of Valdren', center: [34, -38], r: 11,
    grass: [0.42, 0.62, 0.20], dry: [0.70, 0.64, 0.30], forest: 0.34, hills: 0.55, farm: 1,
    trees: { oak: 0.6, birch: 0.25, pine: 0.15 } },
  { id: 'elvenwood', name: 'Silverbough Wood', center: [47, -12], r: 7,
    grass: [0.26, 0.52, 0.30], dry: [0.44, 0.56, 0.30], forest: 0.9, hills: 0.9, magic: 0.12,
    trees: { elder: 0.4, birch: 0.35, oak: 0.25 } },
  { id: 'ironpeak', name: 'The Ironpeak Holds', center: [56, -38], r: 10,
    grass: [0.36, 0.46, 0.24], dry: [0.50, 0.50, 0.36], forest: 0.44, hills: 1.1,
    trees: { pine: 0.85, birch: 0.15 } },
  { id: 'faewild', name: 'The Faewild', center: [22.5, -11.5], r: 5.5,
    grass: [0.36, 0.66, 0.40], dry: [0.52, 0.66, 0.44], forest: 0.6, hills: 0.6, magic: 0.55,
    trees: { mushroom: 0.35, faetree: 0.45, birch: 0.2 } },
  { id: 'thornsteppe', name: 'The Thornsteppe', center: [-27, 16], r: 15,
    grass: [0.66, 0.60, 0.30], dry: [0.76, 0.64, 0.38], forest: 0.14, hills: 0.45,
    trees: { acacia: 0.85, oak: 0.15 } },
  { id: 'redmesa', name: 'The Red Mesas', center: [-40, 34], r: 7,
    grass: [0.72, 0.48, 0.30], dry: [0.78, 0.50, 0.32], forest: 0.04, hills: 0.3, mesa: 1,
    trees: { acacia: 1 } },
  { id: 'emberreach', name: 'Emberreach', center: [22, 80], r: 11,
    grass: [0.36, 0.30, 0.24], dry: [0.44, 0.36, 0.28], forest: 0.14, hills: 0.8, volcanic: 1,
    trees: { charred: 0.7, pine: 0.3 } },
  { id: 'gloamfen', name: 'The Gloamfen', center: [19, -178], r: 10,
    grass: [0.30, 0.34, 0.22], dry: [0.36, 0.36, 0.26], forest: 0.52, hills: 0.25, marsh: 1, cursed: 1,
    trees: { dead: 0.6, willow: 0.4 } },
  { id: 'frostreach', name: 'Frostreach', center: [80, 0], r: 20,
    grass: [0.62, 0.66, 0.60], dry: [0.70, 0.72, 0.68], forest: 0.2, hills: 1.0, cold: 1,
    trees: { snowpine: 1 } },
  { id: 'varrowmark', name: 'Varrowmark', center: [46, 129], r: 10,
    grass: [0.34, 0.50, 0.24], dry: [0.56, 0.54, 0.32], forest: 0.52, hills: 1.0, magic: 0.1,
    trees: { oak: 0.35, pine: 0.35, dead: 0.1, elder: 0.2 } },
  { id: 'sundered', name: 'The Sundered Vale', center: [46, 132], r: 3.2,
    grass: [0.30, 0.52, 0.46], dry: [0.40, 0.56, 0.50], forest: 0.2, hills: 0.5, magic: 1,
    trees: { elder: 0.6, dead: 0.4 } },
  { id: 'verdant', name: 'The Verdant Reach', center: [-17, -109], r: 9,
    grass: [0.22, 0.52, 0.16], dry: [0.34, 0.56, 0.20], forest: 0.92, hills: 0.7,
    trees: { jungle: 0.8, oak: 0.2 } },
  { id: 'wyvernmoor', name: 'Wyvernmoor', center: [47, -100], r: 9,
    grass: [0.46, 0.46, 0.26], dry: [0.52, 0.38, 0.38], forest: 0.26, hills: 1.25,
    trees: { pine: 0.6, birch: 0.4 } },
  { id: 'thornwood', name: 'The Thornwood', center: [-36, 134], r: 8,
    grass: [0.22, 0.38, 0.18], dry: [0.30, 0.40, 0.22], forest: 0.88, hills: 0.8, cursed: 0.25,
    trees: { pine: 0.35, oak: 0.35, dead: 0.3 } },
  { id: 'tidewrack', name: 'The Tidewrack Isles', center: [-39, -146], r: 7,
    grass: [0.40, 0.62, 0.26], dry: [0.62, 0.62, 0.34], forest: 0.5, hills: 0.7,
    trees: { palm: 0.7, jungle: 0.3 } },
  { id: 'southice', name: 'The Pale Waste', center: [-88, 0], r: 16,
    grass: [0.70, 0.74, 0.76], dry: [0.74, 0.78, 0.80], forest: 0.0, hills: 0.8, cold: 1,
    trees: { snowpine: 1 } },
];

// Settlement kinds: pad radius (flattened ground), farm radius, rough building budget.
export const KINDS = {
  capital: { r: 4.4, farm: 9, walls: 3.9 },
  city: { r: 3.2, farm: 7, walls: 2.9 },
  port: { r: 2.8, farm: 5 },
  town: { r: 2.4, farm: 5.5 },
  village: { r: 1.7, farm: 4.2 },
  hamlet: { r: 1.1, farm: 2.8 },
  castle: { r: 1.5, farm: 3.2 },
  hold: { r: 2.2, farm: 0 },
  mine: { r: 1.2, farm: 0 },
  enclave: { r: 2.6, farm: 0 },
  glade: { r: 1.6, farm: 0 },
  circle: { r: 0.9, farm: 0 },
  camp: { r: 1.8, farm: 0 },
  temple: { r: 3.0, farm: 2.5 },
  necropolis: { r: 2.4, farm: 0 },
  barrow: { r: 1.2, farm: 0 },
  monastery: { r: 1.2, farm: 1.6 },
  fort: { r: 1.3, farm: 1.5 },
  ruin: { r: 2.4, farm: 0 },
  stilts: { r: 1.6, farm: 0 },
  lighthouse: { r: 1.0, farm: 1.2 },
};

// culture decides architecture and inhabitants.
export const SETTLEMENTS = [
  // --- Valdren (humans) ---
  { id: 'highmoor', name: 'Highmoor', lat: 33, lon: -36.2, kind: 'capital', culture: 'human', realm: 'valdren', castle: true,
    blurb: 'Royal seat of Valdren. Blue banners fly over the Sapphire Keep.' },
  { id: 'saltmere', name: 'Saltmere', lat: 27.9, lon: -27.2, kind: 'port', culture: 'human', realm: 'valdren', coastal: true,
    blurb: 'A salt-crusted harbor where the Aln meets the bay.' },
  { id: 'brightwater', name: 'Brightwater', lat: 29, lon: -44.3, kind: 'town', culture: 'human', realm: 'valdren', mill: true,
    blurb: 'Millers and ferrymen on the River Wend.' },
  { id: 'oakhollow', name: 'Oakhollow', lat: 37.6, lon: -27.5, kind: 'village', culture: 'human', realm: 'valdren',
    blurb: 'Orchards and windmills at the edge of the old oaks.' },
  { id: 'millbrook', name: 'Millbrook', lat: 32.5, lon: -51, kind: 'village', culture: 'human', realm: 'valdren',
    blurb: 'Wheat country. The windmills never stop.' },
  { id: 'ravensford', name: 'Ravensford', lat: 43.8, lon: -38.8, kind: 'castle', culture: 'human', realm: 'valdren', castle: true,
    blurb: 'A border keep guarding the ford below the Ironpeaks.' },
  { id: 'thornbury', name: 'Thornbury', lat: 39.8, lon: -48.5, kind: 'hamlet', culture: 'human', realm: 'valdren',
    blurb: 'A handful of farms and a smithy famous for horseshoes.' },
  { id: 'westwatch', name: 'Westwatch', lat: 36.8, lon: -60.6, kind: 'castle', culture: 'human', realm: 'valdren', castle: true, coastal: true,
    blurb: 'Cliff fortress watching the western sea.' },
  { id: 'kingsinn', name: "King's Rest", lat: 37.5, lon: -41.5, kind: 'hamlet', culture: 'human', realm: 'valdren', inn: true,
    blurb: 'A crossroads inn where every rumor in Valdren passes.' },
  { id: 'southreach', name: 'Southreach', lat: 21.4, lon: -38.5, kind: 'village', culture: 'human', realm: 'valdren', coastal: true,
    blurb: 'Fishers and farmers on the southern shore.' },
  { id: 'rimeguard', name: 'Rimeguard', lat: 64.5, lon: -36, kind: 'fort', culture: 'human', realm: 'frostreach',
    blurb: 'The last hearth before the frozen north.' },
  { id: 'stormwatch', name: 'Stormwatch', lat: 2.3, lon: -40.8, kind: 'lighthouse', culture: 'human', realm: 'wild', coastal: true,
    blurb: 'A lonely lighthouse and a fishing hamlet on a storm-lashed isle.' },
  // --- Elves ---
  { id: 'silverbough', name: 'Silverbough', lat: 48.9, lon: -10.3, kind: 'enclave', culture: 'elf', realm: 'elvenwood',
    blurb: 'White spires among silver trees. The runes here never sleep.' },
  { id: 'moonwell', name: 'Moonwell Glade', lat: 44.3, lon: -5.8, kind: 'glade', culture: 'elf', realm: 'elvenwood',
    blurb: 'A pool that holds the moon even at noon.' },
  // --- Dwarves ---
  { id: 'khazdurak', name: 'Khaz Durak', lat: 55.2, lon: -39.5, kind: 'hold', culture: 'dwarf', realm: 'ironpeak',
    blurb: 'The great rune-door of the Ironpeak dwarves.' },
  { id: 'deepdelve', name: 'Deepdelve', lat: 53.4, lon: -28.5, kind: 'mine', culture: 'dwarf', realm: 'ironpeak',
    blurb: 'Silver seams and cart-rails into the mountain.' },
  { id: 'stonebridge', name: 'Stonebridge', lat: 54.2, lon: -52, kind: 'fort', culture: 'dwarf', realm: 'ironpeak',
    blurb: 'A dwarven toll-fort on the western pass.' },
  // --- Faeborne ---
  { id: 'thistledown', name: 'Thistledown', lat: 23.6, lon: -13.8, kind: 'glade', culture: 'fae', realm: 'faewild',
    blurb: 'Mushroom houses and lantern-flowers. Keep to the path.' },
  { id: 'wyrdring', name: 'The Wyrdring', lat: 20.8, lon: -8.6, kind: 'circle', culture: 'fae', realm: 'faewild',
    blurb: 'Where the Thornmother once danced, the stones still hum.' },
  // --- Beastfolk ---
  { id: 'fanghold', name: 'Fanghold', lat: -25, lon: 12.5, kind: 'camp', culture: 'beast', realm: 'thornsteppe',
    blurb: 'War-camp of the wolf-clans, ringed with sharpened stakes.' },
  { id: 'hidewater', name: 'Hidewater', lat: -31.2, lon: 23.6, kind: 'camp', culture: 'beast', realm: 'thornsteppe',
    blurb: 'Tents of the boar-folk around the only oasis for a hundred leagues.' },
  { id: 'grakka', name: "Grakka's Totem", lat: -18.5, lon: 2.2, kind: 'circle', culture: 'beast', realm: 'thornsteppe',
    blurb: 'A totem of skulls where the clans swear their oaths.' },
  { id: 'ridgeback', name: 'Ridgeback Kraal', lat: -39.2, lon: 30.6, kind: 'camp', culture: 'beast', realm: 'redmesa',
    blurb: 'Herders of the great makka beasts, among the red mesas.' },
  { id: 'tuskport', name: 'Tuskport', lat: -12.2, lon: 8.4, kind: 'port', culture: 'beast', realm: 'thornsteppe', coastal: true,
    blurb: 'Beastfolk raiders turned traders. Mostly.' },
  // --- Draconic ---
  { id: 'cinderhold', name: 'Cinderhold', lat: 16.8, lon: 70.4, kind: 'temple', culture: 'draconic', realm: 'emberreach',
    blurb: 'Obsidian ziggurats of the dragon-priests.' },
  { id: 'ashfall', name: 'Ashfall', lat: 29, lon: 88.5, kind: 'village', culture: 'draconic', realm: 'emberreach',
    blurb: 'Kobold smiths who forge with lava from the mountain.' },
  { id: 'scalegate', name: 'Scalegate', lat: 10.8, lon: 64.8, kind: 'fort', culture: 'draconic', realm: 'emberreach', coastal: true,
    blurb: 'Fortress of the Scaled Guard.' },
  // --- Undead ---
  { id: 'duskmere', name: 'Duskmere', lat: 18.3, lon: -176.2, kind: 'necropolis', culture: 'undead', realm: 'gloamfen',
    blurb: 'A drowned cathedral town where the dead keep their old routines.' },
  { id: 'palebarrow', name: 'The Pale Barrow', lat: 26.2, lon: 171.6, kind: 'barrow', culture: 'undead', realm: 'gloamfen',
    blurb: 'Tomb of the Pale Lady. Green fire burns without fuel.' },
  // --- The outer wilds ---
  { id: 'gryphonperch', name: "Gryphon's Perch", lat: 47.6, lon: -97.4, kind: 'hamlet', culture: 'human', realm: 'wyvernmoor',
    blurb: 'Rangers who trade griffin feathers and tall tales.' },
  { id: 'moorhold', name: 'Moorhold', lat: 43.2, lon: -93.4, kind: 'ruin', culture: 'ruin', realm: 'wyvernmoor',
    blurb: 'A broken castle the wyverns took for a nest.' },
  { id: 'witchlight', name: 'Witchlight Hollow', lat: -36.2, lon: 131.6, kind: 'glade', culture: 'fae', realm: 'thornwood',
    blurb: 'A hag keeps lanterns burning in the thorns. Nobody asks for whom.' },
  { id: 'blackfin', name: 'Blackfin Cove', lat: -39.2, lon: -146.8, kind: 'port', culture: 'human', realm: 'tidewrack', coastal: true,
    blurb: 'Pirates, smugglers, and very good rum.' },
  // --- Varrowmark ---
  { id: 'oldvarrow', name: 'Old Varrow', lat: 44.6, lon: 123.6, kind: 'ruin', culture: 'ruin', realm: 'varrowmark',
    blurb: 'Capital of an empire nobody remembers. Something still lives there.' },
  { id: 'hollowmere', name: 'Hollowmere Abbey', lat: 39.4, lon: 140.2, kind: 'monastery', culture: 'human', realm: 'varrowmark',
    blurb: 'Monks copying runes they are forbidden to read.' },
  // --- Verdant Reach ---
  { id: 'ssethra', name: 'Ssethra', lat: -12.8, lon: -107.6, kind: 'stilts', culture: 'beast', realm: 'verdant', coastal: true,
    blurb: 'Lizardfolk stilt-houses above a jungle river mouth.' },
];

// Lakes: water surface level in world units.
export const LAKES = [
  { id: 'veil', name: 'Veil Lake', lat: 47.3, lon: -14.2, r: 1.6, level: 1.35, depth: 0.6 },
  { id: 'crystal', name: 'Crystal Spring', lat: 37.4, lon: -39.8, r: 0.55, level: 1.55, depth: 0.3 },
  { id: 'mirror', name: 'Mirror Tarn', lat: 56.2, lon: -31.5, r: 0.7, level: 3.1, depth: 0.4 },
  { id: 'hidewater', name: 'Hidewater Oasis', lat: -31.9, lon: 24.9, r: 0.9, level: 0.95, depth: 0.35 },
  { id: 'moonpool', name: 'The Moonwell', lat: 44.1, lon: -6.4, r: 0.22, level: 1.1, depth: 0.25 },
  { id: 'sundered', name: 'Riftmere', lat: 46.3, lon: 132.2, r: 1.1, level: 1.3, depth: 0.5 },
  { id: 'duskpool', name: 'Blackwater', lat: 20.4, lon: -178.6, r: 1.1, level: 0.12, depth: 0.25 },
];

// Rivers: waypoints from source to mouth. `into` names a lake or river they end in (else the sea).
// `falls` lists waypoint indices after which the bed drops sharply (waterfalls).
export const RIVERS = [
  { id: 'aln', name: 'River Aln', width: [0.16, 0.55], pts: [[53.2, -37.2], [49.8, -38.6], [46.6, -38.4], [43.8, -39.0], [40.5, -37.8], [37.2, -35.2], [34.2, -34.7], [31.5, -32.3], [28.9, -29.3], [27.2, -28.4]] },
  { id: 'wend', name: 'River Wend', width: [0.12, 0.42], pts: [[47.5, -52.5], [44, -50.6], [40.6, -48.2], [36.2, -46.8], [32.2, -45.0], [29.2, -43.6], [25.2, -44.2], [21.6, -45.8], [19.2, -47.2]] },
  { id: 'silverrun', name: 'The Silverrun', width: [0.12, 0.4], pts: [[53.2, -17.4], [51.2, -15.8], [49.2, -15.2], [47.9, -14.6]], into: 'veil' },
  { id: 'silverfall', name: 'Veil Falls', width: [0.26, 0.4], pts: [[46.1, -13.6], [45.6, -13.2], [44.4, -11.9], [42.4, -9.4], [40.2, -6.4], [38.4, -3.0], [36.8, 0.6]], falls: [1], fallDrop: 1.05 },
  { id: 'redrun', name: 'The Redrun', width: [0.1, 0.34], pts: [[-40.5, 27.5], [-37.4, 25.4], [-33.4, 25.2]], into: 'hidewater' },
  { id: 'redrun2', name: 'The Redrun', width: [0.16, 0.36], pts: [[-30.6, 24.2], [-27.4, 19.4], [-23.2, 14.6], [-18.6, 11.4], [-14.4, 9.6], [-11.2, 8.9]] },
  { id: 'rift', name: 'Riftwater', width: [0.12, 0.3], pts: [[45.5, 131.4], [44.2, 129.8], [42.6, 127.6], [41.2, 125.4], [40.3, 123.2]], falls: [2], fallDrop: 0.8 },
  { id: 'jungle', name: 'Green Serpent', width: [0.14, 0.4], pts: [[-21.4, -116], [-18.6, -113.2], [-16.2, -110.2], [-14.2, -108.6], [-12.2, -107.2]] },
  { id: 'lava', name: 'Cindermaw Flow', width: [0.12, 0.24], lava: true, pts: [[23.4, 83.8], [22.0, 85.4], [20.3, 87.0], [18.4, 88.8], [16.6, 90.6], [15.6, 92.8], [15.1, 94.9]] },
];

// Named landmarks: model decides what is built. Some carve or glow terrain.
export const LANDMARKS = [
  { id: 'runeblade', name: 'The Runeblade of Aurelion', lat: 51.2, lon: 119.5, model: 'runeblade', blurb: 'A god\'s sword, driven into the hill at the end of the Sundering.' },
  { id: 'floatisle', name: 'The Drifting Spire', lat: 46.3, lon: 132.2, model: 'floatisle', blurb: 'An island of rock and ruin that forgot how to fall.' },
  { id: 'titan', name: "Titan's Rest", lat: -33.5, lon: 40.5, model: 'titan', blurb: 'A fallen colossus of bronze, half swallowed by the steppe.' },
  { id: 'gate', name: 'Gate of Ages', lat: 59.6, lon: -11.5, model: 'portal', blurb: 'A rune-ring on the sea cliffs. On some nights it opens.' },
  { id: 'hollowstones', name: 'Hollowstones', lat: 40.6, lon: -22.5, model: 'stones', blurb: 'Nine stones that hum when the moon is full.' },
  { id: 'whisperstones', name: 'Whispering Stones', lat: 26.2, lon: -53.6, model: 'stones', blurb: 'Farmers leave bread here. It is always gone by morning.' },
  { id: 'sunshrine', name: 'Shrine of the Sun-Father', lat: 30.6, lon: -20.2, model: 'sunshrine', blurb: 'A golden disc on a hill, lit before any other place at dawn.' },
  { id: 'ashbrazier', name: "The Ash God's Brazier", lat: 26.6, lon: 76.2, model: 'brazier', blurb: 'A bowl of fire as wide as a village.' },
  { id: 'icetemple', name: 'The Rimehall', lat: 79.5, lon: 22, model: 'icetemple', blurb: 'A temple of ice built by giants for a winter god.' },
  { id: 'drowned', name: "Temple of the Deep Mother", lat: -20.3, lon: -77.6, model: 'drowned', blurb: 'Half the temple is underwater. The other half is waiting.' },
  { id: 'pyramid', name: 'Pyramid of Coatl', lat: -19.2, lon: -114.4, model: 'pyramid', blurb: 'A stepped pyramid swallowed by the jungle.' },
  { id: 'wreck', name: 'The Maw Reef', lat: 8.1, lon: -58.1, model: 'wreck', blurb: 'Ships that sail too close are never seen again.' },
  { id: 'obelisk1', name: 'Runestone of Ard', lat: 49.5, lon: -60, model: 'obelisk', blurb: 'An old warding stone, its runes still bright.' },
  { id: 'obelisk2', name: 'Runestone of Vel', lat: 41.5, lon: -1.5, model: 'obelisk', blurb: 'An old warding stone on the eastern coast.' },
  { id: 'obelisk3', name: 'Runestone of Mor', lat: -34.5, lon: 2, model: 'obelisk', blurb: 'Beastfolk will not camp within sight of it.' },
  { id: 'obelisk4', name: 'Runestone of Hesk', lat: 35.5, lon: 97, model: 'obelisk', blurb: 'Half-melted by dragonfire, still glowing.' },
  { id: 'obelisk5', name: 'Runestone of Uln', lat: 57.5, lon: 128.5, model: 'obelisk', blurb: 'Marks the northern edge of the old empire.' },
  { id: 'ruintower1', name: 'Broken Tower', lat: 41.6, lon: -56, model: 'ruintower', blurb: 'A wizard lived here once. The locals disagree on which one.' },
  { id: 'ruintower2', name: 'Varrow Watch', lat: 50.4, lon: 126.2, model: 'ruintower', blurb: 'A ruined imperial watchtower.' },
  { id: 'ruintower3', name: 'The Leaning Keep', lat: 49.6, lon: -27.5, model: 'ruinkeep', blurb: 'Abandoned after the dwarven wars.' },
  { id: 'battlefield', name: 'Field of Crows', lat: 47.2, lon: -46, model: 'battlefield', blurb: 'Broken siege engines from a war of kings.' },
  { id: 'dragonstatue', name: 'The Wyrm Colossus', lat: 21.2, lon: 77.4, model: 'dragonstatue', blurb: 'A dragon carved from the mountain by its worshippers.' },
  { id: 'druidring', name: 'Circle of Thorns', lat: -33.6, lon: 139.4, model: 'stones', blurb: 'Druids of the Thornwood meet here at the dark of the moon.' },
  { id: 'hermit', name: "Hermit's Spire", lat: 51.5, lon: -106.5, model: 'ruintower', blurb: 'A wizard who wants to be left alone.' },
  { id: 'aqueduct', name: 'Highmoor Aqueduct', lat: 35.2, lon: -38.1, model: 'none', blurb: 'Forty arches carrying spring water to the capital.' },
];

// Aqueduct from Crystal Spring to Highmoor.
export const AQUEDUCT = { from: [37.25, -39.55], to: [33.55, -36.9], startH: 1.62, endH: 1.2 };

// Ley lines: glowing arcane currents between old sites (terrain emissive).
export const LEYLINES = [
  [[20.8, -8.6], [24, -8.5], [30.6, -20.2], [36, -21.4], [40.6, -22.5], [44.3, -5.8], [52, -9.5], [59.6, -11.5]],
  [[40.6, -22.5], [44, -32], [49.5, -45], [49.5, -60]],
  [[46.3, 132.2], [48.8, 125.4], [51.2, 119.5]],
  [[46.3, 132.2], [42.8, 136.5], [39.4, 140.2]],
  [[-18.5, 2.2], [-25.6, 7.2], [-34.5, 2]],
  [[-18.5, 2.2], [-26, 24], [-33.5, 40.5]],
];

// Road network as settlement/landmark id pairs.
export const ROADS = [
  ['highmoor', 'saltmere'], ['highmoor', 'kingsinn'], ['highmoor', 'oakhollow'], ['highmoor', 'brightwater'],
  ['kingsinn', 'ravensford'], ['kingsinn', 'thornbury'], ['thornbury', 'westwatch'], ['thornbury', 'millbrook'],
  ['brightwater', 'millbrook'], ['brightwater', 'southreach'], ['southreach', 'saltmere'],
  ['ravensford', 'khazdurak'], ['khazdurak', 'stonebridge'], ['ravensford', 'deepdelve'],
  ['oakhollow', 'silverbough'], ['oakhollow', 'hollowstones'], ['silverbough', 'moonwell'],
  ['saltmere', 'thistledown'], ['thistledown', 'wyrdring'], ['oakhollow', 'sunshrine'],
  ['stonebridge', 'rimeguard'],
  ['tuskport', 'fanghold'], ['fanghold', 'hidewater'], ['fanghold', 'grakka'], ['hidewater', 'ridgeback'],
  ['cinderhold', 'scalegate'], ['cinderhold', 'ashfall'], ['cinderhold', 'dragonstatue'],
  ['oldvarrow', 'hollowmere'],
];

// Sea lanes for ships: waypoint lists; `loop` routes circle forever.
export const SEA_LANES = [
  { id: 'southern', kind: 'merchant', pts: [[27.3, -28.2], [25.2, -30.2], [23.2, -29.5], [15, -33], [5.6, -38.4], [0.5, -34], [-5.4, -18], [-8.6, -2], [-10.8, 7.4]] },
  { id: 'eastern', kind: 'merchant', pts: [[27.3, -28.2], [25.2, -30.2], [22.6, -29], [19, -20], [15.5, -2], [12, 20], [8, 45], [9, 60], [14.2, 69.6]] },
  { id: 'western', kind: 'warship', pts: [[27.3, -28.2], [25.2, -30.2], [22.6, -31], [18, -40], [22, -54], [33, -64.4], [36.8, -63.2]] },
  { id: 'ghost', kind: 'ghost', loop: true, pts: [[14, -180], [22.4, -166], [30.4, 176], [22, 166], [10, 172]] },
  { id: 'abbey', kind: 'merchant', pts: [[14.2, 69.6], [8, 76], [8, 100], [20, 118], [32, 136], [37.6, 141.6]] },
  { id: 'storm', kind: 'fisher', loop: true, pts: [[4.2, -42.4], [3.6, -38], [0, -38.6], [0.2, -43.2]] },
  { id: 'pirate', kind: 'pirate', loop: true, pts: [[-37.4, -146.6], [-33, -150], [-30.5, -144], [-37, -134.5], [-44, -133], [-47.5, -144], [-42, -152.5]] },
  { id: 'reach', kind: 'canoe', loop: true, pts: [[-11.8, -106], [-10.4, -110], [-12.6, -113.6], [-11.2, -104]] },
];

// Dragons: routes and lairs.
export const DRAGONS = [
  { id: 'vermithrax', name: 'Vermithrax the Ember King', color: [0.62, 0.1, 0.06], belly: [0.9, 0.55, 0.2], wing: [0.5, 0.08, 0.05], size: 1.35,
    behavior: 'circle', center: [24, 83], radius: 9, alt: 11, perch: [24.3, 82.5] },
  { id: 'skarn', name: 'Skarn Frostwing', color: [0.62, 0.78, 0.92], belly: [0.92, 0.96, 1.0], wing: [0.42, 0.6, 0.82], size: 1.1,
    behavior: 'circle', center: [75, 5], radius: 13, alt: 12, perch: [76, 5] },
  { id: 'aurum', name: 'Old Aurum', color: [0.78, 0.58, 0.2], belly: [0.95, 0.82, 0.48], wing: [0.62, 0.38, 0.14], size: 1.6,
    behavior: 'voyage', tilt: 38, node: -30, alt: 16 },
  { id: 'nyxmaw', name: 'Nyxmaw', color: [0.14, 0.1, 0.2], belly: [0.34, 0.22, 0.42], wing: [0.18, 0.1, 0.26], size: 1.0,
    behavior: 'circle', center: [20, -176], radius: 6, alt: 8, perch: [21, -172.5], nocturnal: true },
  { id: 'verdigris', name: 'Verdigris', color: [0.16, 0.46, 0.3], belly: [0.62, 0.78, 0.42], wing: [0.2, 0.36, 0.24], size: 0.75,
    behavior: 'circle', center: [49, 125], radius: 7, alt: 8, perch: [51.2, 119.5] },
];
