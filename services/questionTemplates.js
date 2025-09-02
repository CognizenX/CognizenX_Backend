// Question templates for better context and relevance
const questionTemplates = {
  politics: {
    national: {
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
    northIndian: {
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
    statesAndCapitals: {
      topics: [
        "Indian States and Union Territories",
        "State Capitals and Major Cities",
        "Geographical Features of States",
        "State Borders and Neighboring States"
      ]
    },
    northIndian: {
      topics: [
        "North Indian States (UP, Punjab, Haryana, Delhi)",
        "Himalayan States (Himachal, Uttarakhand, J&K)",
        "North Indian Rivers (Ganga, Yamuna, Beas)",
        "North Indian Plains and Agriculture"
      ]
    }
  },
  
  entertainment: {
    bollywood: {
      topics: [
        "Classic Bollywood Movies (1950s-1990s)",
        "Famous Bollywood Actors and Actresses",
        "Bollywood Music and Songs",
        "Bollywood Directors and Producers",
        "Bollywood Awards and Recognition"
      ]
    }
  },
  
  history: {
    ancientIndia: {
      topics: [
        "Indus Valley Civilization",
        "Vedic Period and Literature",
        "Maurya Empire and Ashoka",
        "Gupta Dynasty and Golden Age",
        "Ancient Indian Universities"
      ]
    },
    modernIndia: {
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
