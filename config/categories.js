/**
 * Trivia category keyword definitions and article categorisation helper.
 *
 * Each top-level key is a main category; nested keys are sub-categories
 * whose values are arrays of keyword strings used for matching.
 */
const categories = {
  entertainment: {
    bollywood: {
      movies: ['bollywood movies', 'film', 'cinema', 'director', 'actor', 'actress', 'screenplay'],
      actors: ['bollywood actors', 'celebrity', 'star', 'actor', 'actress'],
      songs: ['bollywood songs', 'music', 'singer', 'lyrics', 'album']
    },
    tollywood: ['tollywood', 'south indian film', 'telugu movie', 'tamil cinema'],
    indianMusic: ['indian music', 'singer', 'composer', 'album', 'classical music', 'pop', 'instrumental'],
    indianTVShows: ['tv show', 'indian television', 'soap opera', 'reality show'],
    sports: {
      cricket: ['cricket', 'bat', 'ball', 'wicket', 'batsman', 'bowler', 'tournament'],
      otherSports: ['football', 'soccer', 'tennis', 'badminton', 'hockey', 'sports event']
    }
  },
  politics: {
    national: ['government', 'ministry', 'policy', 'cabinet', 'parliament', 'national law'],
    northIndian: ['north india politics', 'state government', 'chief minister', 'legislature'],
    southIndian: ['south india politics', 'andhra pradesh', 'karnataka', 'tamil nadu'],
    freedomMovement: ['independence', 'freedom fighters', 'british rule', 'indian freedom movement']
  },
  history: {
    ancientIndia: ['ancient india', 'vedic period', 'maurya empire', 'gupta dynasty', 'harappan'],
    medievalIndia: ['medieval india', 'mughal empire', 'sultanate', 'rajput', 'maratha'],
    modernIndia: ['modern india', 'british india', 'post-independence', 'partition', 'indian history']
  },
  geography: {
    statesAndCapitals: ['state capital', 'indian states', 'capital city', 'map of india'],
    riversAndMountains: ['rivers of india', 'mountains', 'himalayas', 'ganges', 'narmada'],
    nationalParks: ['national park', 'wildlife sanctuary', 'forest reserve', 'nature park'],
    librariesAndStatues: ['indian library', 'statue', 'monument', 'historical site']
  },
  generalKnowledge: {
    economy: ['indian economy', 'gdp', 'inflation', 'stock market', 'trade', 'finance'],
    festivals: ['festival', 'celebration', 'diwali', 'holi', 'eid', 'indian tradition'],
    literature: ['literature', 'books', 'author', 'poet', 'novel', 'indian writer'],
    scienceAndTechnology: ['science', 'technology', 'innovation', 'research', 'engineering']
  },
  mythology: {
    hindu: ['hindu mythology', 'god', 'goddess', 'epic', 'mahabharata', 'ramayana'],
    otherReligions: ['buddhism', 'jainism', 'sikhism', 'christianity', 'islam', 'mythology']
  },
  currentAffairs: {
    economicAffairs: ['economy', 'budget', 'policy', 'investment', 'indian market'],
    infrastructure: ['infrastructure', 'development', 'roads', 'transportation', 'urban planning'],
    internationalRelations: ['foreign policy', 'diplomacy', 'alliance', 'india-un relations'],
    healthAndEnvironment: ['health', 'environment', 'climate change', 'pollution', 'conservation']
  }
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
