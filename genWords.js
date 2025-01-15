// precompute.js
const fs = require("fs");

// 1. Read a text file "words.txt" (one word per line)
const rawWords = fs.readFileSync("words3.txt", "utf-8");
const words = rawWords
	.split("\n")
	.map(w => w.trim().toLowerCase())
	.filter(Boolean);
const blacklist = ["counterchallenging", "decompartmentalism","creditworthiness","depersonalisation","kirkcudbrightshire","northamptonshire","palaeontologists","establishmentarians","harpsichordists","contrapositions","creditworthiness","contrabassoons","groundbreaking","paleoanthropology","aberdeenshire","uncharacteristically","jurisprudentially","establishmentarians","avariciousness","depersonalisation","aberdeenshire","ambassadorships","maximisation","kirkcudbrightshire","circumnavigators","brightlingsea","establishmentarians","disincarcerating","unselfconsciousness","heliocentricity","macroinstructions","disillusionment","cambridgeshire","brokenheartedly","handicraftsman","misidentifications","oceanographically","misrepresentations","neurotransmitter","incomprehensibility","compartmentalisation","kaleidoscopically","buckinghamshire","macroinstructions","recapitalisation","diacetylmorphine","antivivisection","contrabassoons","contrabassoons","particularisation","photoluminescence","unresponsiveness","hypochondriacs","electroencephalograph","diacetylmorphine","indeterminateness","denationalisation","unpatriotically","bureaucratisation","newfoundlanders","forisfamiliating","decalcification","counterchecked","establishmentarian","forisfamiliating","archaeopteryxes","interrelationships","contemporaneously","moretonhampstead","physiotherapeutic","czechoslovakians","incontrovertibility","disembarrassing","counterchallenged","decriminalisation","compartmentalising"];


// 2. Generate all 3-letter combos
const letters = "abcdefghijklmnopqrstuvwxyz";
const comboMap = {};

for (let i = 0; i < letters.length; i++) {
	for (let j = 0; j < letters.length; j++) {
		for (let k = 0; k < letters.length; k++) {
			const combo = letters[i] + letters[j] + letters[k];

			const filteredWords = words.filter(word =>
				word.includes(combo) &&
				word.length > 3 &&
				!blacklist.includes(word)
			);
			const foundWord = filteredWords.length > 0
				? filteredWords.reduce((longest, current) => current.length > longest.length ? current : longest)
				: undefined;


			// If no match found, store null (or store the combo itself, or whatever you like)
			comboMap[combo] = foundWord || null;
		}
	}
}

// 3. Write out map.json
fs.writeFileSync("map.json", JSON.stringify(comboMap, null, 2));
console.log("Done! Created 'map.json' with all 3-letter combos.");
