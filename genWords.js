// precompute.js
const fs = require("fs");

// 1. Read a text file "words.txt" (one word per line)
const rawWords = fs.readFileSync("words3.txt", "utf-8");
const words = rawWords
	.split("\n")
	.map(w => w.trim().toLowerCase())
	.filter(Boolean);

// 2. Generate all 3-letter combos
const letters = "abcdefghijklmnopqrstuvwxyz";
const comboMap = {};

for (let i = 0; i < letters.length; i++) {
	for (let j = 0; j < letters.length; j++) {
		for (let k = 0; k < letters.length; k++) {
			const combo = letters[i] + letters[j] + letters[k];

			// Example: find the *first* word containing that combo
			const foundWord = words.find(word => word.includes(combo) && word.length > 3);

			// If no match found, store null (or store the combo itself, or whatever you like)
			comboMap[combo] = foundWord || null;
		}
	}
}

// 3. Write out map.json
fs.writeFileSync("map.json", JSON.stringify(comboMap, null, 2));
console.log("Done! Created 'map.json' with all 3-letter combos.");
