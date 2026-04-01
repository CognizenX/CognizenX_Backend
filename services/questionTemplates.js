// Question templates for better context and relevance
const questionTemplates = {
  politics: {
    'National': {
      topics: [
        "Indian Constitution and Fundamental Rights",
        "Parliament and Government Structure", 
        "Election Commission and Voting",
        "Prime Ministers and Presidents",
        "Political Parties and Symbols",
        "State Governments and Chief Ministers",
        "Constitutional Amendments",
        "Supreme Court and Judiciary"
      ],
      examples: [
        "Which article of the Indian Constitution guarantees the Right to Education?",
        "Who was the first woman Prime Minister of India?",
        "What is the maximum strength of the Lok Sabha?"
      ]
    },
    'North Indian': {
      topics: [
        "North Indian State Politics",
        "Delhi Government and Assembly",
        "Uttar Pradesh Politics",
        "Punjab State Government",
        "Haryana Legislative Assembly"
      ]
    }
  },
  
  geography: {
    'States and Capitals': {
      topics: [
        "Indian States and Union Territories",
        "State Capitals and Major Cities",
        "Geographical Features of States",
        "State Borders and Neighboring States"
      ]
    },
    'Rivers and Mountains': {
      topics: [
        "Major Rivers of India (Ganga, Yamuna, Brahmaputra)",
        "Himalayan Mountain Range",
        "Western and Eastern Ghats",
        "River Systems and Tributaries"
      ]
    }
  },
  
  entertainment: {
    'Bollywood Movies': {
      topics: [
        "Classic Bollywood Movies (1950s-1990s)",
        "Famous Bollywood Actors and Actresses",
        "Bollywood Directors and Producers",
        "Bollywood Awards and Recognition"
      ]
    },
    'Bollywood Songs': {
      topics: [
        "Bollywood Music and Songs",
        "Famous Playback Singers",
        "Bollywood Music Composers",
        "Iconic Bollywood Soundtracks"
      ]
    },
  },

  sports: {
    'Cricket': {
      topics: [
        "International Cricket Players (all countries)",
        "ICC World Cup tournaments",
        "Ashes Series (England vs Australia)",
        "T20 World Cup",
        "IPL and other T20 leagues",
        "Test cricket records and achievements",
        "ODI cricket history",
        "Cricket records from all nations"
      ],
      examples: [
        "Who holds the record for highest individual score in Test cricket?",
        "Which country has won the most ICC World Cups?",
        "Who is known as the 'Don' in cricket history?",
        "Which bowler has taken the most wickets in Test cricket?"
      ]
    },
  },
  
  history: {
    'Ancient India': {
      topics: [
        "Indus Valley Civilization",
        "Vedic Period and Literature",
        "Maurya Empire and Ashoka",
        "Gupta Dynasty and Golden Age",
        "Ancient Indian Universities"
      ]
    },
    'Modern India': {
      topics: [
        "Indian Independence Movement",
        "Freedom Fighters and Leaders",
        "Partition of India",
        "Post-Independence Development",
        "Indian Democracy and Constitution"
      ]
    }
  }
};

// Get relevant topics for a category and subdomain
const getRelevantTopics = (category, subDomain) => {
  const categoryData = questionTemplates[category];
  if (!categoryData) return [];
  
  const subDomainData = categoryData[subDomain];
  if (!subDomainData) return [];
  
  return subDomainData.topics || [];
};

// Get example questions for a category and subdomain
const getExampleQuestions = (category, subDomain) => {
  const categoryData = questionTemplates[category];
  if (!categoryData) return [];
  
  const subDomainData = categoryData[subDomain];
  if (!subDomainData) return [];
  
  return subDomainData.examples || [];
};

module.exports = {
  questionTemplates,
  getRelevantTopics,
  getExampleQuestions
};
