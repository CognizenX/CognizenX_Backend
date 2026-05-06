const OpenAI = require('openai');
const { getRelevantTopics, getExampleQuestions } = require('../services/questionTemplates');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function makeHttpError(status, message, code) {
  const err = new Error(message);
  err.status = status;
  err.statusCode = status;
  err.statusMessage = message;
  if (code) err.code = code;
  return err;
}

const generateQuestions = async (category, subDomain, count = 10) => {
  try {
    // Check if OpenAI API key is configured and valid
    if (!process.env.OPENAI_API_KEY || 
        process.env.OPENAI_API_KEY === 'sk-your-openai-api-key-here' ||
        process.env.OPENAI_API_KEY.trim().length < 20) {
      throw new Error('OpenAI API key is not configured. Please set OPENAI_API_KEY in your .env file.');
    }
    
    // Normalize category and subDomain to lowercase for template matching
    const normalizedCategory = category?.toLowerCase();
    const normalizedSubDomain = subDomain?.toLowerCase();
    
    // Get relevant topics and examples for better context
    const relevantTopics = getRelevantTopics(normalizedCategory, normalizedSubDomain);
    const exampleQuestions = getExampleQuestions(normalizedCategory, normalizedSubDomain);
    
    // Enhanced prompt for more relevant and meaningful questions
    // IMPORTANT: This application is focused on Indian content. All questions should be about India unless explicitly stated otherwise.
    // EXCEPTION: Cricket and sports categories should be universal/international, not limited to India only.
    
    const subdomainScope = {
      // India-only
      'bollywood movies': 'india',
      'bollywood actors': 'india',
      'bollywood songs': 'india',
      'indian tv shows': 'india',
      'national': 'india',
      'north indian': 'india',
      'south indian': 'india',
      'ancient india': 'india',
      'medieval india': 'india',
      'modern india': 'india',
      'freedom movement': 'india',

      // Global
      'western art': 'global',
      'world cuisines': 'global',
      'global traditions': 'global',

      // Mixed / global-friendly
      'cricket': 'global',
      'performing arts': 'mixed',
      'festivals rituals': 'mixed',
    };
    const scopeKey = String(subDomain || '').trim().toLowerCase();
    const scope = subdomainScope[scopeKey] || 'india';
    const isUniversalCategory = scope === 'global' || scope === 'mixed';
    const isArtCategory = normalizedCategory === 'art';
    
    // Debug logging
    if (isUniversalCategory) {
      console.log(`[PROMPT] Universal category detected: category="${category}", subDomain="${subDomain}", normalizedCategory="${normalizedCategory}", normalizedSubDomain="${normalizedSubDomain}"`);
    }
    
    // Add variety instruction to encourage different questions each time
    const varietyInstruction = `IMPORTANT: Generate DIVERSE and VARIED questions. Avoid repeating common or obvious questions. Think creatively about different aspects, time periods, players, tournaments, and records. Each question should be unique and cover different facets of ${subDomain || category}.`;
    
    const scopeInstruction = {
      india: `1. ALL questions MUST be strictly about India.
- Do NOT include global or foreign content.
- Focus only on Indian people, places, history, culture, or events.`,
      global: `1. Questions MUST be GLOBAL and NOT India-focused.
- Do NOT bias toward India.
- Focus on internationally recognized people, movements, or facts.`,
      mixed: `1. Questions can include both Indian and global content.
- Maintain a BALANCE (not all India, not all global).`,
    };

    const extraRules = {
      'western art': `- ONLY include Western artists, movements, or works (e.g., Leonardo da Vinci, Van Gogh, Picasso, Renaissance, Impressionism).
- Do NOT include Indian artists or Indo-Western fusion.`,
    };
    const extraRuleText = extraRules[scopeKey] || '';

    const artRegionFocus = isArtCategory && normalizedSubDomain
      ? `REGION FOCUS: Because subDomain is "${subDomain}", every question must be about ${subDomain} art specifically. Do NOT include other regions or general South Asian topics.`
      : '';
    const artStrictness = isArtCategory
      ? 'ABSOLUTE RULE (HARD CONSTRAINT): If the question is NOT about VISUAL ART, DO NOT generate it. South Asian does NOT mean general culture. ONLY include painters, artworks, sculptures, architecture, art movements, techniques, styles, museums.'
      : '';
    const domainLock = {
      art: `DOMAIN LOCK: ART ONLY
    - Every question MUST be about VISUAL ART ONLY.
    - Allowed topics: artists, paintings, sculptures, art movements, techniques, styles, museums, architecture, materials.
    - NOT allowed: sports, politics, geography, literature, religion, general history unless directly related to art.
    - If a question is not clearly about ART, it is INVALID.`,
      sports: `DOMAIN LOCK: SPORTS ONLY
    - Every question MUST be about sports, players, tournaments, or records.
    - NOT allowed: art, politics, literature, geography unless directly related to sports.`,
        };

    const prompt = `Generate ${count} high-quality, relevant trivia questions.
    
    Category: ${category}
    Subcategory: ${subDomain || 'General'}
    
    ${varietyInstruction}
    
    CRITICAL REQUIREMENTS:
    ${scopeInstruction[scope] || scopeInstruction.india}

    2. STRICT SUBCATEGORY FOCUS
    - Only generate questions about "${subDomain || category}"
    - Do NOT drift into other subcategories

    3. TOPIC ENFORCEMENT (MANDATORY)
    - Every question MUST clearly match at least ONE of the following topics.
    - If it does not match, DO NOT generate it.
    ${relevantTopics.length > 0 ? relevantTopics.map(t => `- ${t}`).join('\n') : '- Use the category and subcategory context to choose appropriate topics.'}

    4. ACCURACY
    - No hallucinations
    - Use widely known facts only

    5. CLARITY
    - Simple language for elderly users

    ${domainLock[normalizedCategory] || ''}
    ${artStrictness}
    ${artRegionFocus}
    ${extraRuleText}

    NEGATIVE CONSTRAINTS:
    - Do NOT include questions about:
      * Sports (unless category is sports)
      * Geography (unless category is geography)
      * Literature (unless category is literature)
      * Politics (unless category is politics)
    - If a question includes unrelated domain knowledge, it is INVALID.

    FINAL CHECK BEFORE OUTPUT:
    For EACH question:
    - Check: Is this strictly about "${subDomain || category}"?
    - Check: Does it match one of the allowed topics?
    - Check: Is it in the correct domain (${category})?
    If ANY answer is NO -> DO NOT include the question.

    ${exampleQuestions.length > 0 ? `EXAMPLE QUESTIONS FOR REFERENCE: ${exampleQuestions.join(' | ')}` : ''}
    
    QUESTION QUALITY GUIDELINES:
    - Questions should test understanding, not just memorization
    - Include historical context when relevant
    - Mix current events with historical facts
    - Ensure cultural sensitivity and accuracy
    
    FORMAT: Return ONLY valid JSON array with this exact structure:
    [
      {
        "question": "Specific question about ${subDomain || category}",
        "options": ["Correct answer", "Plausible wrong answer 1", "Plausible wrong answer 2", "Plausible wrong answer 3"],
        "correct_answer": "Correct answer"
      }
    ]
    
    IMPORTANT: 
    - No explanations, no markdown, no comments
    - Only return the JSON array
    - Ensure all questions are genuinely about ${subDomain || category}
    - Make questions engaging and educational for dementia patients`;

    // Add timestamp-based variation to prompt to encourage different questions each time
    const timestamp = Date.now();
    const variationHint = `Generate questions that are different from previous sessions. Consider different time periods, players, tournaments, records, and aspects of ${subDomain || category}.`;
    
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: scope === 'global'
            ? 'You are an expert trivia question generator specializing in creating relevant, accurate, and engaging questions for cognitive health applications. Generate GLOBAL questions with no India bias. Focus on internationally recognized people, movements, events, and facts. IMPORTANT: Generate DIVERSE questions each time - vary regions, topics, and time periods.'
            : scope === 'mixed'
              ? 'You are an expert trivia question generator specializing in creating relevant, accurate, and engaging questions for cognitive health applications. Questions may include both Indian and global content; keep a balanced mix. IMPORTANT: Generate DIVERSE questions each time - vary regions, topics, and time periods.'
              : 'You are an expert trivia question generator specializing in creating relevant, accurate, and engaging questions for cognitive health applications. This application is specifically focused on Indian trivia content. ALL questions must be about India - Indian history, Indian politics, Indian geography, Indian culture, Indian entertainment, etc. Do NOT generate questions about US, UK, or any other country unless explicitly requested. IMPORTANT: Generate DIVERSE questions each time - vary topics, time periods, and aspects. Focus on meaningful content that helps with memory and learning.'
        },
        { 
          role: 'user', 
          content: `${prompt}\n\n${variationHint}`
        }
      ],
      temperature: 0.9, // Higher temperature (0.9) for maximum variety and creativity - prevents repetitive questions
      max_tokens: 2000, // Increased to allow for more diverse and detailed question generation
      top_p: 0.95, // Nucleus sampling for more diverse outputs
    });

    const content = completion.choices[0]?.message?.content?.trim();
    
    if (!content) {
      throw new Error('No content received from OpenAI');
    }
    
    // Clean the response to ensure it's valid JSON
    let cleanedContent = content;
    if (cleanedContent.startsWith("```json")) {
      cleanedContent = cleanedContent.replace(/```json|```/g, "").trim();
    } else if (cleanedContent.startsWith("```")) {
      cleanedContent = cleanedContent.replace(/```/g, "").trim();
    }
    
    // Try to parse the JSON, with better error handling
    let questions;
    try {
      questions = JSON.parse(cleanedContent);
    } catch (parseError) {
      console.error('JSON Parse Error:', parseError);
      console.error('Raw content:', content);
      console.error('Cleaned content:', cleanedContent);
      
      // Try to extract JSON from the response if it contains other text
      const jsonMatch = cleanedContent.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        try {
          questions = JSON.parse(jsonMatch[0]);
        } catch (secondParseError) {
          throw new Error(`Failed to parse OpenAI response: ${secondParseError.message}`);
        }
      } else {
        throw new Error('OpenAI response does not contain valid JSON array');
      }
    }
    
    // Ensure we have an array
    if (!Array.isArray(questions)) {
      throw new Error('OpenAI response is not an array of questions');
    }
    
    // Validate question quality - more lenient validation
    const validatedQuestions = questions.filter(q => {
      if (!q.question || !q.options || !q.correct_answer) {
        return false;
      }
      
      // Check if options is an array and has at least 2 options
      if (!Array.isArray(q.options) || q.options.length < 2) {
        return false;
      }
      
      // Check if correct answer is in options
      if (!q.options.includes(q.correct_answer)) {
        return false;
      }
      
      // Check minimum question length
      if (q.question.trim().length < 10) {
        return false;
      }
      
      return true;
    });

    const artKeywords = [
      'art', 'artist', 'artists', 'painting', 'paintings', 'painter', 'sculpture',
      'sculptor', 'museum', 'gallery', 'canvas', 'fresco', 'mural', 'portrait',
      'landscape', 'abstract', 'impressionism', 'renaissance', 'baroque',
      'modernism', 'surrealism', 'cubism', 'calligraphy', 'miniature',
      'architecture', 'temple', 'monument', 'design', 'style', 'movement',
      'atelier', 'printmaking', 'engraving', 'etching', 'iconography', 'school of art'
    ];
    const sportsKeywords = [
      'cricket', 'cricketer', 'football', 'soccer', 'tennis', 'hockey', 'basketball',
      'olympics', 'world cup', 'tournament', 'match', 'league', 'score',
      'goal', 'wicket', 'bat', 'bowler', 'batsman', 'player', 'athlete'
    ];

    function containsAny(text, keywords) {
      return keywords.some(k => text.includes(k));
    }

    const domainFilteredQuestions = validatedQuestions.filter(q => {
      const text = String(q.question || '').toLowerCase();

      if (normalizedCategory === 'art') {
        if (!containsAny(text, artKeywords)) return false;
        if (containsAny(text, sportsKeywords)) return false;
      }

      if (normalizedCategory === 'sports') {
        if (!containsAny(text, sportsKeywords)) return false;
      }

      return true;
    });

    if (normalizedCategory === 'art') {
      const minKeep = Math.max(3, Math.floor(count * 0.6));
      if (domainFilteredQuestions.length < minKeep) {
        throw new Error('Too many invalid art questions generated - retry');
      }
    }
    
    if (domainFilteredQuestions.length === 0) {
      throw new Error('No valid questions generated. Please try again.');
    }
    
    console.log(`Generated ${domainFilteredQuestions.length} valid questions for ${category}/${subDomain}`);
    return domainFilteredQuestions;
    
  } catch (error) {
    console.error('OpenAI API Error:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      category,
      subDomain,
      count
    });
    
    // Provide more specific error messages + proper HTTP codes
    if (error.message?.includes('API key') || error.status === 401) {
      throw makeHttpError(401, 'OpenAI API key is invalid or missing. Please check your configuration.', 'OPENAI_AUTH');
    } else if (error.message?.includes('rate limit') || error.status === 429) {
      throw makeHttpError(429, 'OpenAI API rate limit exceeded. Please try again later.', 'OPENAI_RATE_LIMIT');
    } else if (error.message?.includes('insufficient_quota') || error.message?.includes('quota')) {
      throw makeHttpError(429, 'OpenAI API quota exceeded. Please check your account billing.', 'OPENAI_QUOTA');
    } else {
      throw makeHttpError(500, `Failed to generate questions. ${error.message || ''}`.trim(), 'OPENAI_ERROR');
    }
  }
};

const generateExplanation = async (question, userAnswer, correctAnswer) => {
  try {
    // Check if OpenAI API key is configured and valid
    if (!process.env.OPENAI_API_KEY || 
        process.env.OPENAI_API_KEY === 'sk-your-openai-api-key-here' ||
        process.env.OPENAI_API_KEY.trim().length < 20) {
      throw new Error('OpenAI API key is not configured. Please set OPENAI_API_KEY in your .env file.');
    }
    
    const prompt = `Question: "${question}"
User answered: "${userAnswer}"
Correct answer: "${correctAnswer}"

Provide a SHORT, concise explanation (1-2 sentences maximum, under 50 words). Explain why the correct answer is right. Be brief and clear.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { 
          role: 'system', 
          content: 'You are an expert educator who explains trivia questions in the shortest possible way. Maximum 1-2 sentences, under 50 words. Be concise and clear. Focus only on why the correct answer is right.' 
        },
        { 
          role: 'user', 
          content: prompt 
        }
      ],
      temperature: 0.3,
      max_tokens: 60, // Reduced to 60 for shorter explanations (was 100)
    });

    const content = completion.choices[0]?.message?.content?.trim();
    if (!content) {
      throw new Error('No explanation generated');
    }

    return content;
  } catch (error) {
    console.error('OpenAI API Error:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      question: question?.substring(0, 50) + '...'
    });
    
    // Provide more specific error messages + proper HTTP codes
    if (error.message?.includes('API key') || error.status === 401) {
      throw makeHttpError(401, 'OpenAI API key is invalid or missing. Please check your configuration.', 'OPENAI_AUTH');
    } else if (error.message?.includes('rate limit') || error.status === 429) {
      throw makeHttpError(429, 'OpenAI API rate limit exceeded. Please try again later.', 'OPENAI_RATE_LIMIT');
    } else if (error.message?.includes('insufficient_quota') || error.message?.includes('quota')) {
      throw makeHttpError(429, 'OpenAI API quota exceeded. Please check your account billing.', 'OPENAI_QUOTA');
    } else {
      throw makeHttpError(500, `Failed to generate explanation. ${error.message || ''}`.trim(), 'OPENAI_ERROR');
    }
  }
};

module.exports = { generateQuestions, generateExplanation };
