// Occupations: where people work, when, and what their work does. `pose` is a presentation key
// resolved by the view; the simulation never depends on animation.

const H = h => Math.round(h * 60);

export const OCCUPATIONS = {
  farmer: { name: 'farmer', place: 'field', hours: [H(6), H(17)], recipes: ['harvest', 'sow', 'tend'], subsists: true, pose: ['farm', 'hoe'] },
  miller: { name: 'miller', place: 'mill', hours: [H(6), H(18)], recipes: ['mill'], pose: ['carry', 'sack'] },
  baker: { name: 'baker', place: 'bakery', hours: [H(3.5), H(12)], recipes: ['bake'], pose: ['hammer', 'none'] },
  woodcutter: { name: 'woodcutter', place: 'woodland', hours: [H(7), H(16)], recipes: ['fell'], subsists: true, pose: ['chop', 'axe'] },
  fisher: { name: 'fisher', place: 'dock', hours: [H(5), H(13)], recipes: ['fish'], subsists: true, pose: ['fish', 'rod'] },
  smith: { name: 'smith', place: 'smithy', hours: [H(7), H(17)], recipes: ['forge'], pose: ['hammer', 'hammer'] },
  builder: { name: 'mason', place: 'project', hours: [H(7), H(17)], recipes: [], pose: ['hammer', 'hammer'] },
  storekeeper: { name: 'storekeeper', place: 'granary', hours: [H(7), H(18)], recipes: [], pose: ['carry', 'sack'] },
  guard: { name: 'guard', place: 'guard', hours: [H(6), H(18)], recipes: [], watch: true, pose: ['guard', 'spear'] },
  merchant: { name: 'merchant', place: 'market', hours: [H(8), H(18)], recipes: [], carrier: true, pose: ['talk', 'none'] },
  priest: { name: 'priest', place: 'temple', hours: [H(6), H(20)], recipes: [], pose: ['pray', 'staff'] },
  innkeeper: { name: 'innkeeper', place: 'tavern', hours: [H(10), H(23)], recipes: [], pose: ['talk', 'none'] },
  steward: { name: 'steward', place: 'hall', hours: [H(8), H(17)], recipes: [], pose: ['talk', 'none'] },
  laborer: { name: 'laborer', place: 'any', hours: [H(7), H(17)], recipes: [], subsists: true, pose: ['carry', 'sack'] },
  hunter: { name: 'hunter', place: 'woodland', hours: [H(5), H(15)], recipes: [], subsists: true, pose: ['idle', 'bow'] },
  miner: { name: 'miner', place: 'work', hours: [H(7), H(17)], recipes: [], subsists: true, pose: ['mine', 'pick'] },
  reveler: { name: 'reveler', place: 'gather', hours: [H(16), H(23.5)], recipes: [], subsists: true, pose: ['dance', 'none'] },
  bard: { name: 'bard', place: 'tavern', hours: [H(16), H(23)], recipes: [], pose: ['dance', 'lute'] },
  noble: { name: 'courtier', place: 'hall', hours: [H(9), H(17)], recipes: [], pose: ['talk', 'none'] },
  elder: { name: 'elder', place: 'seat', hours: [H(9), H(17)], recipes: [], pose: ['sit', 'none'] },
  child: { name: 'child', place: 'plaza', hours: [H(8), H(17)], recipes: [], pose: ['play', 'none'] },
};

// Species traits that change needs; culture and faction are separate fields on each person.
export const SPECIES = {
  human: { name: 'human', eats: true, nocturnal: false },
  elf: { name: 'elf', eats: true, nocturnal: false },
  dwarf: { name: 'dwarf', eats: true, nocturnal: false },
  fae: { name: 'faeborne', eats: true, nocturnal: false },
  beast: { name: 'beastfolk', eats: true, nocturnal: false },
  draconic: { name: 'dragonkin', eats: true, nocturnal: false },
  undead: { name: 'restless dead', eats: false, nocturnal: true },
};

export const TRAITS = {
  diligent: 'Works a longer day and returns to unfinished work first.',
  brave: 'Runs toward emergencies and takes the hardest response roles.',
  sociable: 'Seeks company in the evening more often than others.',
};

export const NAMES = {
  human: { first: ['Aldric', 'Brenna', 'Cedric', 'Dagny', 'Edda', 'Falk', 'Gwen', 'Hale', 'Isolde', 'Jory', 'Kestra', 'Lorne', 'Maud', 'Niall', 'Osric', 'Perrin', 'Quill', 'Rowan', 'Sabine', 'Tamsin', 'Ulric', 'Vera', 'Wystan', 'Yara'], last: ['Ashdown', 'Barrow', 'Cobb', 'Dunmore', 'Fletcher', 'Greaves', 'Hollis', 'Marsh', 'Oakes', 'Thatcher', 'Wren', 'Smith', 'Miller', 'Tanner'] },
  elf: { first: ['Aerith', 'Caelir', 'Elowen', 'Faelar', 'Ilyra', 'Lorien', 'Maelis', 'Nimue', 'Sylvar', 'Thalion', 'Vaela'], last: ['of the Silver Bough', 'Moonweaver', 'Starwhisper', 'Dawnsong'] },
  dwarf: { first: ['Bori', 'Dagna', 'Durin', 'Grima', 'Hilda', 'Korrin', 'Morga', 'Thrain', 'Ulfa', 'Brokk'], last: ['Ironhand', 'Deepdelver', 'Stonebeard', 'Anvilborn', 'Coppervein'] },
  fae: { first: ['Bramble', 'Dewdrop', 'Fennel', 'Hollyhock', 'Moth', 'Nettle', 'Pip', 'Sorrel', 'Thistle', 'Wisp'], last: ['of the Ring', 'Lanternfoot', 'Mooncap'] },
  beast: { first: ['Grakka', 'Horn', 'Kurr', 'Maw', 'Rakk', 'Snarl', 'Tusk', 'Ursa', 'Vorra', 'Yrl'], last: ['Bloodfang', 'Longstride', 'Ashpelt', 'Thornhide', 'Swiftclaw'] },
  undead: { first: ['Old Bertram', 'Lady Mirel', 'Sexton Voss', 'Brother Ash', 'Widow Cray', 'Sir Hollen'], last: ['(departed)', 'the Restless', 'of the Mere'] },
  draconic: { first: ['Kesh', 'Ssarva', 'Tokk', 'Vrisk', 'Yzza', 'Zarn', 'Ixi', 'Rhask'], last: ['Scaleborn', 'Emberclaw', 'of the Brazier', 'Cinderkin'] },
};

export function validateOccupations(recipes, occupations = OCCUPATIONS) {
  const errors = [];
  for (const [id, o] of Object.entries(occupations)) {
    for (const r of o.recipes) if (!recipes[r]) errors.push(`occupations.${id}.recipes references unknown recipe ${r}`);
    if (!Array.isArray(o.hours) || o.hours.length !== 2 || o.hours.some(h => !Number.isSafeInteger(h) || h < 0 || h > 1440)) errors.push(`occupations.${id}.hours must be two minute offsets`);
    if (!o.place) errors.push(`occupations.${id}.place is missing`);
  }
  return errors;
}
