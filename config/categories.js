/**
 * Trivia category keyword definitions and article categorisation helper.
 *
 * Each top-level key is a main category; nested keys are sub-categories
 * whose values are arrays of keyword strings used for matching.
 */
const categories = {
  entertainment: {
    'Bollywood Movies': ['bollywood movies', 'film', 'cinema', 'director', 'actor', 'actress', 'screenplay'],
    'Bollywood Actors': ['bollywood actors', 'celebrity', 'star', 'actor', 'actress'],
    'Bollywood Songs': ['bollywood songs', 'music', 'singer', 'lyrics', 'album'],
    'Indian TV Shows': ['tv show', 'indian television', 'soap opera', 'reality show'],
  },
  politics: {
    'National': ['government', 'ministry', 'policy', 'cabinet', 'parliament', 'national law'],
    'North Indian': ['north india politics', 'state government', 'chief minister', 'legislature'],
    'South Indian': ['south india politics', 'andhra pradesh', 'karnataka', 'tamil nadu'],
  },
  history: {
    'Ancient India': ['ancient india', 'vedic period', 'maurya empire', 'gupta dynasty', 'harappan'],
    'Medieval India': ['medieval india', 'mughal empire', 'sultanate', 'rajput', 'maratha'],
    'Modern India': ['modern india', 'british india', 'post-independence', 'partition', 'indian history'],
    'Freedom Movement': ['independence', 'freedom fighters', 'british rule', 'indian freedom movement'],
  },
  geography: {
    'States and Capitals': ['state capital', 'indian states', 'capital city', 'map of india'],
    'Rivers and Mountains': ['rivers of india', 'mountains', 'himalayas', 'ganges', 'narmada'],
    'National Parks': ['national park', 'wildlife sanctuary', 'forest reserve', 'nature park'],
    'Libraries and Statues': ['indian library', 'statue', 'monument', 'historical site'],
  },
  generalKnowledge: {
    'Economy': ['indian economy', 'gdp', 'inflation', 'stock market', 'trade', 'finance'],
    'Festivals': ['festival', 'celebration', 'diwali', 'holi', 'eid', 'indian tradition'],
    'Literature': ['literature', 'books', 'author', 'poet', 'novel', 'indian writer'],
    'Indian Literature': ['indian literature', 'indian author', 'indian poet', 'hindi literature', 'indian novel'],
    'Science and Technology in India': ['science', 'technology', 'innovation', 'research', 'engineering'],
  },
  mythology: {
    'Hindu': ['hindu mythology', 'god', 'goddess', 'epic', 'mahabharata', 'ramayana'],
    'Other Mythologies': ['buddhism', 'jainism', 'sikhism', 'christianity', 'islam', 'mythology'],
  },
  sports: {
    'Cricket': ['cricket', 'bat', 'ball', 'wicket', 'batsman', 'bowler', 'tournament'],
  },
  'current affairs': {
    'Economic Affairs': ['economy', 'budget', 'policy', 'investment', 'indian market'],
    'Infrastructure': ['infrastructure', 'development', 'roads', 'transportation', 'urban planning'],
    'International Relations': ['foreign policy', 'diplomacy', 'alliance', 'india-un relations'],
    'Health and Environment': ['health', 'environment', 'climate change', 'pollution', 'conservation'],
  },
};

/**
 * Classify an article into a "mainCategory/subCategory" string
 * by matching its title + snippet against the keyword lists above.
 * Returns "others" when no category matches.
 */
function categorizeArticle(article) {
  const content = `${article.title} ${article.snippet}`.toLowerCase();

  for (let mainCategory in categories) {
    for (let subCategory in categories[mainCategory]) {
      const keywords = categories[mainCategory][subCategory];
      if (
        Array.isArray(keywords) &&
        keywords.filter((keyword) => content.includes(keyword)).length >= 2
      ) {
        return `${mainCategory}/${subCategory}`;
      }
    }
  }
  return "others";
}

module.exports = { categories, categorizeArticle };
