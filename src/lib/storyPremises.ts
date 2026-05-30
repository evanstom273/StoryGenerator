const universePremises: Record<string, string[]> = {
  "brooklyn nine-nine": [
    "Jamie arrives at the Nine-Nine for the first day just as a series of unusual thefts begins across Brooklyn.",
    "A small clerical mistake at the precinct unravels into a case that could embarrass the entire squad.",
    "An anonymous tip pulls the Nine-Nine into a bizarre investigation that no one believes is connected at first.",
  ],
  "harry potter": [
    "A string of unstable magical artifacts begins appearing across wizarding Britain, drawing your character into a dangerous investigation.",
    "A routine ministry assignment reveals evidence that someone is quietly rebuilding influence through forbidden magic.",
    "A missing witch case points toward a deeper conspiracy that refuses to stay contained inside ministry channels.",
  ],
  "star wars": [
    "A rumor about Imperial loyalists resurfaces at the edge of New Republic space, forcing your character into a fragile local crisis.",
    "A missing courier route reveals faction pressure building in a system that was supposed to be secure.",
    "A mission that looks like simple reconnaissance turns into the first sign of a coordinated post-war threat.",
  ],
};

const fallbackPremises = [
  "A quiet day in the universe turns sharply when a local problem reveals much larger consequences.",
  "An ordinary assignment draws your character toward a conflict that is already pulling key figures into orbit.",
  "A new development in the world forces your character to act before the situation can spiral.",
];

export function generateStoryPremise(universeName: string, playerCharacterName: string) {
  const normalizedUniverse = universeName.trim().toLowerCase();
  const choices = universePremises[normalizedUniverse] ?? fallbackPremises;
  const selected = choices[Math.floor(Math.random() * choices.length)];

  return selected.replace("your character", playerCharacterName);
}

export function suggestStoryTitle(universeName: string, playerCharacterName: string) {
  return `${universeName}: ${playerCharacterName}`;
}

