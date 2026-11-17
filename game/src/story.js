// Story content for Bahía Dorada: the cast, the opening cinematic, the seven chained missions
// (data only — objectives, spawns, timers, dialogue and rewards) and the ending credits.

export const CAST = {
  sol:    { name: 'Sol',        color: '#ff4f7b' },
  ramon:  { name: 'Tío Ramón',  color: '#ffc93c' },
  lupe:   { name: 'Lupe',       color: '#2ec4b6' },
  flaco:  { name: 'Flaco',      color: '#ffd166' },
  varela: { name: 'Cruz Varela', color: '#ff5a5a' },
  radio:  { name: 'Police Radio', color: '#7fb3ff' },
};

export const INTRO_CRAWL = [
  'BAHÍA DORADA — the golden bay. Sun, salt, and money that never sleeps.',
  'Eight years ago, Marisol "Sol" Ortega drove the getaway car on a docks job that went wrong.',
  'Someone talked. Her crew was waiting at Muelle 9 — so were the police. Sol took the fall.',
  'The man who sold them out now runs the harbor: Cruz Varela, boss of Los Tiburones.',
  'Today Sol is out, with $350, a borrowed jacket and one name on her mind.',
  'Her uncle Ramón still pours coffee in Barrio Rosa. Time to go home.',
];

export const CREDITS = [
  'BAHÍA DORADA',
  'Varela is finished. Los Tiburones scatter like gulls.',
  'The harbor is quiet — for now. The city is yours to explore.',
  'Keep hunting Golden Shells, buy every property, and stay out of the Comisaría.',
  'Thanks for playing.',
];

// Mission step types are interpreted by missions.js.
export const MISSIONS = [
  {
    id: 'homecoming', title: 'Vuelta a Casa', giver: 'cafe', giverName: 'Tío Ramón', reward: 500,
    summary: 'Sol comes home to Barrio Rosa and her uncle Ramón.',
    steps: [
      { type: 'dialog', lines: [['sol', 'Ramón. Still burning the coffee?'], ['ramon', 'Mija! Eight years and you walk in like it was yesterday.'], ['ramon', 'Varela owns the docks now. Half the cops, too. Be careful.'], ['sol', 'I need wheels, cash and a way back in.'], ['ramon', 'Then you work for me. Start small. Stay alive.']] },
    ],
  },
  {
    id: 'wheels', title: 'Ruedas Nuevas', giver: 'cafe', giverName: 'Tío Ramón', reward: 1200,
    summary: 'Steal a Rayo GT from a Las Lomas driveway and bring it to Lupe\'s garage.',
    steps: [
      { type: 'dialog', lines: [['ramon', 'A dentist in Las Lomas parks a Rayo GT on his lawn like a trophy.'], ['ramon', 'Lupe at Garaje Solera has a buyer. Bring it in clean.']] },
      { type: 'spawnVehicle', tag: 'rayo', vtype: 'sports', at: { block: [1, 3], dx: 30, dy: 0 }, a: Math.PI / 2, color: '#ff9f1c' },
      { type: 'enterVehicle', tag: 'rayo', text: 'Steal the orange Rayo GT in Las Lomas' },
      { type: 'wanted', level: 1, toast: 'The car alarm is screaming!' },
      { type: 'deliver', tag: 'rayo', at: 'garage', r: 46, time: 120, text: 'Deliver the Rayo GT to Garaje Solera' },
      { type: 'dialog', lines: [['sol', 'Lupe. Long time.'], ['lupe', 'Look at you, still drive like the devil. Not a scratch? Nice.'], ['lupe', 'Come back when you need a respray — I owe you one.']] },
    ],
  },
  {
    id: 'debt', title: 'El Flaco Paga', giver: 'cafe', giverName: 'Tío Ramón', reward: 1500,
    summary: 'Chase down Flaco Mendoza\'s taxi and collect what he owes.',
    steps: [
      { type: 'dialog', lines: [['ramon', 'Flaco Mendoza owes me six months. He drives a taxi round Centro.'], ['ramon', 'He sees you, he runs. Stop that cab and bring back my money.']] },
      { type: 'chase', tag: 'flaco', vtype: 'taxi', near: 'cafe', time: 150, disable: 0.45, onDisable: 'dropCash', text: 'Stop Flaco\'s taxi — ram it until it breaks down' },
      { type: 'pickupItem', at: '@flaco', item: 'Cash Bag', text: 'Grab Flaco\'s cash bag' },
      { type: 'goto', at: 'cafe', r: 34, text: 'Bring the money back to Café La Ramona' },
      { type: 'dialog', lines: [['ramon', 'Ha! All of it? You should do this for a living.'], ['ramon', 'Lupe has something bigger for you. Find her at the garage.']] },
    ],
  },
  {
    id: 'delivery', title: 'Entrega Caliente', giver: 'garage', giverName: 'Lupe', reward: 2000,
    summary: 'Collect a package at Playa Coral, shake the police and deliver it to Club Marea.',
    steps: [
      { type: 'dialog', lines: [['lupe', 'A friend left a package under the lifeguard tower at Playa Coral.'], ['lupe', 'Varela pays cops to watch that beach. Expect company.']] },
      { type: 'goto', at: 'beach', r: 40, text: 'Pick up the package at Playa Coral' },
      { type: 'wanted', level: 2, toast: 'Ambush! The police were waiting.' },
      { type: 'dialog', lines: [['radio', 'All units: suspect leaving Playa Coral, armed and dangerous.']] },
      { type: 'loseWanted', text: 'Lose the police' },
      { type: 'goto', at: 'club', r: 40, text: 'Deliver the package to Club Marea' },
      { type: 'dialog', lines: [['lupe', 'Package says Varela moves something big through Bodega Tiburón tonight.'], ['sol', 'Then I\'ll be watching.']] },
    ],
  },
  {
    id: 'stakeout', title: 'Ojos en la Bodega', giver: 'garage', giverName: 'Lupe', reward: 2500,
    summary: 'Watch the Tiburones warehouse without being seen, then tail their van.',
    steps: [
      { type: 'dialog', lines: [['lupe', 'Park on Calle Ancla, near Bodega Tiburón. Watch. Don\'t get close to the guards.'], ['lupe', 'When the van leaves, follow it — at a distance.']] },
      { type: 'goto', at: 'stakeout', r: 60, text: 'Go to the stakeout spot on Calle Ancla' },
      { type: 'stakeout', at: 'warehouse', r: 260, time: 30, text: 'Stay in the zone and watch the warehouse — keep away from the guards' },
      { type: 'follow', tag: 'van', vtype: 'van', from: 'warehouse', to: 'pierEnd', text: 'Tail the Tiburones van — don\'t lose it, don\'t get too close' },
      { type: 'dialog', lines: [['sol', 'Muelle 9. Same pier as eight years ago.'], ['lupe', 'Then that\'s where we hit them. Talk to Ramón.']] },
    ],
  },
  {
    id: 'raid', title: 'Asalto al Muelle', giver: 'cafe', giverName: 'Tío Ramón', reward: 5000,
    summary: 'Raid the Tiburones container yard, steal Varela\'s ledger and escape.',
    steps: [
      { type: 'dialog', lines: [['ramon', 'Take this. I hoped I\'d never hand it to you.'], ['ramon', 'Varela keeps a ledger: every cop, every payoff. Take it and he\'s nothing.']] },
      { type: 'giveWeapon', weapon: 'smg', ammo: 180, toast: 'Received Ráfaga SMG + 180 rounds' },
      { type: 'goto', at: 'pierEnd', r: 260, text: 'Raid the Tiburones yard at the docks' },
      { type: 'eliminate', tag: 'yard', at: 'pierEnd', count: 8, spread: 200, text: 'Take out the Tiburones crew' },
      { type: 'pickupItem', at: 'pierEnd', item: 'Varela\'s Ledger', text: 'Grab Varela\'s ledger' },
      { type: 'wanted', level: 3, toast: 'Varela called in his cops!' },
      { type: 'loseWanted', text: 'Escape the police' },
      { type: 'goto', at: 'cafe', r: 34, text: 'Return to Café La Ramona' },
      { type: 'dialog', lines: [['ramon', 'Names, dates, amounts... Dios mío.'], ['ramon', 'He\'ll run. Tonight. Be ready.']] },
    ],
  },
  {
    id: 'finale', title: 'La Caída de Varela', giver: 'cafe', giverName: 'Tío Ramón', reward: 15000,
    summary: 'Varela flees his villa. Run him down and end it at Muelle 9.',
    steps: [
      { type: 'dialog', lines: [['ramon', 'Varela is leaving his villa in Las Lomas. Black Toro, bodyguards.'], ['sol', 'Eight years, Ramón. He doesn\'t leave this city.']] },
      { type: 'chase', tag: 'varela', vtype: 'muscle', color: '#111111', near: 'villa', time: 200, disable: 0.35, onDisable: 'bossExit', text: 'Run Varela\'s black Toro off the road' },
      { type: 'eliminate', tag: 'boss', at: '@varela', count: 3, boss: true, spread: 40, text: 'Take down Cruz Varela and his bodyguards' },
      { type: 'dialog', lines: [['varela', 'You think this city changes? Somebody else takes my place tomorrow.'], ['sol', 'Maybe. But not you.']] },
      { type: 'goto', at: 'pierEnd', r: 50, text: 'Meet Ramón\'s boat at the end of Muelle 9' },
      { type: 'dialog', lines: [['ramon', 'Get in, mija. Let the city sleep tonight.'], ['sol', 'Bahía Dorada never sleeps, Tío.']] },
    ],
  },
];
