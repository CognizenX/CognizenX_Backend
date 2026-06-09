/**
 * Unit tests for religion keyword classification used by the migration script.
 * These do not require MongoDB.
 */

const RELIGION_KEYWORDS = {
  hindu: ["hindu", "ramayana", "mahabharata", "krishna", "shiva"],
  islam: ["islam", "muslim", "quran", "allah", "muhammad"],
  christianity: ["christian", "christianity", "jesus", "bible", "church"],
  sikhism: ["sikh", "sikhism", "guru granth sahib", "gurdwara"],
  buddhism: ["buddha", "buddhist", "buddhism", "nirvana"],
  jainism: ["jain", "jainism", "mahavira", "ahimsa"],
};

const CANONICAL = ["Hindu", "Islam", "Christianity", "Sikhism", "Buddhism", "Jainism"];

function classifyReligionFromText(text) {
  const normalized = String(text || "").trim().toLowerCase();
  if (!normalized) return null;

  let bestCategory = null;
  let bestScore = 0;

  for (const [candidate, keywords] of Object.entries(RELIGION_KEYWORDS)) {
    let score = 0;
    for (const keyword of keywords) {
      if (normalized.includes(keyword)) {
        score += 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestCategory = candidate;
    }
  }

  if (!bestCategory) return null;
  const idx = Object.keys(RELIGION_KEYWORDS).indexOf(bestCategory);
  return CANONICAL[idx];
}

describe("religion keyword classification", () => {
  it("classifies Hindu questions", () => {
    expect(
      classifyReligionFromText("In the Mahabharata, who is Krishna?")
    ).toBe("Hindu");
  });

  it("classifies Islam questions", () => {
    expect(
      classifyReligionFromText("Which book is central to Islam and Muslims?")
    ).toBe("Islam");
  });

  it("classifies Christianity questions", () => {
    expect(
      classifyReligionFromText("Who is Jesus in Christian belief?")
    ).toBe("Christianity");
  });

  it("returns null for unclassified text", () => {
    expect(classifyReligionFromText("What is the capital of France?")).toBeNull();
  });
});
