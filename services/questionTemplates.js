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
  art: {
    'Western Art': {
      topics: [
        "Renaissance and Baroque art",
        "Impressionism and Post-Impressionism",
        "Famous Western artists",
        "Art museums and galleries"
      ]
    },
    'Eastern Art': {
      topics: [
        "East Asian painting and calligraphy",
        "Traditional ceramics and crafts",
        "Religious and temple art",
        "Iconic Eastern art forms"
      ]
    },
    'South Asian': {
      topics: [
        "Indian classical art",
        "Folk and tribal art",
        "South Asian art traditions",
        "Notable South Asian artists"
      ]
    },
    'Architecture Sculpture': {
      topics: [
        "Historic architecture styles",
        "Famous monuments and sculptures",
        "Temple and palace architecture",
        "Materials and techniques in sculpture"
      ]
    }
  },
  culture: {
    'Global Traditions': {
      topics: [
        "World cultural traditions",
        "Customs and social practices",
        "Heritage and folklore",
        "Cultural symbols and meanings"
      ]
    },
    'South Asian': {
      topics: [
        "South Asian customs and values",
        "Indian cultural heritage",
        "Regional cultures in South Asia",
        "Languages and scripts"
      ]
    },
    'Festivals Rituals': {
      topics: [
        "Major world festivals",
        "Indian and South Asian festivals",
        "Rituals and ceremonies",
        "Seasonal celebrations"
      ]
    },
    'Performing Arts': {
      topics: [
        "Classical dance forms",
        "Traditional music styles",
        "Theatre and performance",
        "Folk dances and music"
      ]
    }
  },
  cuisine: {
    'World Cuisines': {
      topics: [
        "Global cuisine styles",
        "Signature dishes by region",
        "Culinary traditions",
        "Famous foods worldwide"
      ]
    },
    'South Asian': {
      topics: [
        "Indian regional cuisines",
        "South Asian cooking styles",
        "Popular South Asian dishes",
        "Staple foods and grains"
      ]
    },
    'Street Foods': {
      topics: [
        "Popular street foods",
        "Snack culture",
        "Markets and food stalls",
        "Regional street food favorites"
      ]
    },
    'Spices Ingredients': {
      topics: [
        "Common spices and herbs",
        "Spice blends and masalas",
        "Cooking ingredients",
        "Flavor profiles"
      ]
    }
  },
  
  religion: {
    Islam: {
      topics: [
        'Five Pillars of Islam',
        'Quran and Hadith',
        'Prophet Muhammad and early Islam',
        'Indian Muslim heritage and culture',
        'Mosques and Islamic architecture in India',
        'Ramadan, Eid, and Islamic festivals',
        'Sufi traditions in India',
      ],
      examples: [
        'Which holy book is central to Islam?',
        'What is the name of the Islamic month of fasting?',
        'Which city is home to the Jama Masjid in Delhi?',
      ],
    },
    Christianity: {
      topics: [
        'Bible and Gospels',
        'Life and teachings of Jesus',
        'Christianity in India',
        'Churches and Christian festivals in India',
        'Apostles and early church history',
        'Christmas and Easter traditions',
      ],
      examples: [
        'Which book is sacred to Christians?',
        'On which day do Christians celebrate the resurrection of Jesus?',
        'In which Indian state is the Basilica of Bom Jesus located?',
      ],
    },
    Sikhism: {
      topics: [
        'Guru Granth Sahib',
        'Ten Sikh Gurus',
        'Golden Temple and gurdwaras',
        'Khalsa and Five Ks',
        'Sikh festivals such as Vaisakhi and Gurpurab',
        'Sikh history in Punjab and India',
      ],
      examples: [
        'Which scripture is central to Sikhism?',
        'Where is the Golden Temple located?',
        'Who founded the Khalsa?',
      ],
    },
    Buddhism: {
      topics: [
        'Life and teachings of Buddha',
        'Four Noble Truths and Eightfold Path',
        'Buddhist sites in India',
        'Ashoka and spread of Buddhism',
        'Monasteries, stupas, and sangha',
        'Bodh Gaya and Sarnath',
      ],
      examples: [
        'Under which tree did Siddhartha Gautama attain enlightenment?',
        'What are the Four Noble Truths associated with?',
        'Which Indian emperor helped spread Buddhism?',
      ],
    },
    Jainism: {
      topics: [
        'Tirthankaras and Mahavira',
        'Ahimsa and Jain philosophy',
        'Jain temples and pilgrimage sites in India',
        'Digambara and Svetambara traditions',
        'Jain festivals and rituals',
      ],
      examples: [
        'Who is considered the 24th Tirthankara in Jainism?',
        'Which principle of non-violence is central to Jainism?',
        'Where is the famous Jain temple complex at Palitana located?',
      ],
    },
    Hindu: {
      topics: [
        'Vedas and Upanishads',
        'Ramayana and Mahabharata',
        'Major Hindu deities and festivals',
        'Temples and pilgrimage sites in India',
      ],
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

function findSubDomainData(categoryData, subDomain) {
  if (!categoryData || !subDomain) return null;
  if (categoryData[subDomain]) return categoryData[subDomain];

  const key = String(subDomain).trim().toLowerCase();
  const match = Object.keys(categoryData).find(
    (entry) => entry.toLowerCase() === key
  );
  return match ? categoryData[match] : null;
}

// Get relevant topics for a category and subdomain
const getRelevantTopics = (category, subDomain) => {
  const categoryData = questionTemplates[category];
  if (!categoryData) return [];

  const subDomainData = findSubDomainData(categoryData, subDomain);
  if (!subDomainData) return [];

  return subDomainData.topics || [];
};

// Get example questions for a category and subdomain
const getExampleQuestions = (category, subDomain) => {
  const categoryData = questionTemplates[category];
  if (!categoryData) return [];

  const subDomainData = findSubDomainData(categoryData, subDomain);
  if (!subDomainData) return [];

  return subDomainData.examples || [];
};

module.exports = {
  questionTemplates,
  getRelevantTopics,
  getExampleQuestions
};
