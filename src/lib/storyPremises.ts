const universePremises: Record<string, string[]> = {
	"coastal city": [
		"Your character arrives on their first day as a string of unusual thefts begins across the harbour district.",
		"A small clerical mistake at the guild hall unravels into a scandal that could embarrass the whole council.",
		"An anonymous tip pulls the city watch into a bizarre investigation that no one believes is connected at first.",
	],
	"wizard academy": [
		"A string of unstable magical artifacts begins appearing across the academy, drawing your character into a dangerous investigation.",
		"A routine assignment reveals evidence that someone is quietly rebuilding influence through forbidden magic.",
		"A missing student case points toward a deeper conspiracy that refuses to stay contained on campus.",
	],
	"frontier colony": [
		"A rumour about raiders resurfaces at the edge of settled space, forcing your character into a fragile local crisis.",
		"A missing courier route reveals faction pressure building in a system that was supposed to be secure.",
		"A mission that looks like simple reconnaissance turns into the first sign of a coordinated threat.",
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
