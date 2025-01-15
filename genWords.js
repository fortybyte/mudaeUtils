// precompute.js
const fs = require("fs");

// 1. Read a text file "words.txt" (one word per line)
const rawWords = fs.readFileSync("words3.txt", "utf-8");
const words = rawWords
	.split("\n")
	.map(w => w.trim().toLowerCase())
	.filter(Boolean);
const blacklist = ["counterchallenging", "decompartmentalism","creditworthiness","depersonalisation","kirkcudbrightshire","northamptonshire","palaeontologists","establishmentarians","harpsichordists","contrapositions","creditworthiness","contrabassoons","groundbreaking","paleoanthropology","aberdeenshire","uncharacteristically","jurisprudentially","establishmentarians","avariciousness","depersonalisation","aberdeenshire","ambassadorships","maximisation","kirkcudbrightshire","circumnavigators","brightlingsea","establishmentarians","disincarcerating","unselfconsciousness","heliocentricity","macroinstructions","disillusionment","cambridgeshire","brokenheartedly","handicraftsman","misidentifications","oceanographically","misrepresentations","neurotransmitter","incomprehensibility","compartmentalisation","kaleidoscopically","buckinghamshire","macroinstructions","recapitalisation","diacetylmorphine","antivivisection","contrabassoons","contrabassoons","particularisation","photoluminescence","unresponsiveness","hypochondriacs","electroencephalograph","diacetylmorphine","indeterminateness","denationalisation","unpatriotically","bureaucratisation","newfoundlanders","forisfamiliating","decalcification","counterchecked","establishmentarian","forisfamiliating","archaeopteryxes","interrelationships","contemporaneously","moretonhampstead","physiotherapeutic","czechoslovakians","incontrovertibility","disembarrassing","counterchallenged","decriminalisation","compartmentalising","counteroffers","polysyllabically","counterrevolution",];


// 2. Generate all 3-letter combos
const letters = "abcdefghijklmnopqrstuvwxyz";
const comboMap = {};
const usedWords = new Set(); // Tracks used words

function findWord(combo) {
	// Filter words that meet the criteria and haven't been used or blacklisted
	const filteredWords = words.filter(word =>
		word.includes(combo) &&
		word.length > 3 &&
		!blacklist.includes(word) &&
		!usedWords.has(word)
	);

	let foundWord;
	if (filteredWords.length > 0) {
		// If there are eligible unused words, use the first one and mark it as used
		foundWord = filteredWords[0];
		usedWords.add(foundWord);
	} else {
		// If no unused matches are available, find the longest word not blacklisted
		const longestWord = words
			.filter(word => word.includes(combo) && word.length > 3 && !blacklist.includes(word))
			.reduce((longest, current) => current.length > longest.length ? current : longest, "");
		foundWord = longestWord || null; // Default to undefined if no word found
	}

	return foundWord;
}
for (let i = 0; i < letters.length; i++) {
	for (let j = 0; j < letters.length; j++) {
		for (let k = 0; k < letters.length; k++) {
			const combo = letters[i] + letters[j] + letters[k];
			const foundWord = findWord(combo);


			// If no match found, store null (or store the combo itself, or whatever you like)
			comboMap[combo] = foundWord || combo;
		}
	}
}

// 3. Write out map.json
fs.writeFileSync("map.json", JSON.stringify(comboMap, null, 2));
console.log("Done! Created 'map.json' with all 3-letter combos.");
