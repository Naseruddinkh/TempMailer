const crypto = require("crypto");

const adjectives = [
  "swift",
  "silent",
  "bright",
  "cool",
  "happy",
  "quick",
  "blue",
  "cyber",
  "pixel",
  "digital",
  "cosmic",
  "shadow",
  "hyper",
  "neon",
  "solar",
  "astral",
  "quantum",
  "brave",
  "mystic",
  "vibrant"
];

const nouns = [
  "fox",
  "wolf",
  "hawk",
  "tiger",
  "panda",
  "eagle",
  "lion",
  "byte",
  "cloud",
  "bird",
  "falcon",
  "phoenix",
  "viper",
  "spark",
  "node",
  "pulse",
  "orbit",
  "shadow",
  "nexus",
  "comet"
];

const firstNames = [
  "Alex",
  "Jordan",
  "Sam",
  "Taylor",
  "Morgan",
  "Riley",
  "Casey",
  "Avery",
  "Dakota",
  "Reese"
];

const lastNames = [
  "Smith",
  "Johnson",
  "Williams",
  "Brown",
  "Jones",
  "Garcia",
  "Miller",
  "Davis",
  "Rodriguez",
  "Martinez"
];

function randomItem(array) {
  return array[crypto.randomInt(0, array.length)];
}

function randomNumber(min, max) {
  return crypto.randomInt(min, max + 1);
}

function generateUsername() {
  const style = randomNumber(1, 4);

  switch (style) {
    case 1:
      // Example: swiftfox42
      return `${randomItem(adjectives)}${randomItem(nouns)}${randomNumber(
        10,
        9999
      )}`;

    case 2:
      // Example: AlexMiller84
      return `${randomItem(firstNames)}${randomItem(lastNames)}${randomNumber(
        10,
        999
      )}`;

    case 3:
      // Example: cyberwolf731
      return `${randomItem(adjectives)}${randomItem(nouns)}${randomNumber(
        100,
        999
      )}`;

    case 4:
      // Example: JordanPhoenix27
      return `${randomItem(firstNames)}${randomItem(nouns)}${randomNumber(
        10,
        999
      )}`;

    default:
      return `${randomItem(adjectives)}${randomItem(nouns)}${randomNumber(
        10,
        9999
      )}`;
  }
}

function createMailbox(domain) {
  const cleanDomain = domain.replace(/^@/, "");

  const username = generateUsername();

  return {
    id: `mb_${crypto.randomBytes(12).toString("hex")}`,
    email: `${username}@${cleanDomain}`,
    domain: `@${cleanDomain}`,
    createdAt: new Date().toISOString()
  };
}

module.exports = {
  createMailbox
};