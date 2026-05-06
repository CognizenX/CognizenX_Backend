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
    
    // Check if this is a sports/cricket category that should be universal
    // Cricket can be under entertainment.sports.cricket or just "cricket" or "sports"
    const isSportsCategory = normalizedCategory === 'sports' || 
                            normalizedCategory === 'entertainment' && (normalizedSubDomain === 'cricket' || normalizedSubDomain === 'sports' || normalizedSubDomain === 'othersports') ||
                            normalizedSubDomain === 'cricket' || 
                            normalizedSubDomain === 'sports' ||
                            normalizedSubDomain === 'othersports';
    
    const isUniversalCategory = isSportsCategory;
    
    // Debug logging
    if (isUniversalCategory) {
      console.log(`[PROMPT] Universal category detected: category="${category}", subDomain="${subDomain}", normalizedCategory="${normalizedCategory}", normalizedSubDomain="${normalizedSubDomain}"`);
    }
    
    // Add variety instruction to encourage different questions each time
    const varietyInstruction = `IMPORTANT: Generate DIVERSE and VARIED questions. Avoid repeating common or obvious questions. Think creatively about different aspects, time periods, players, tournaments, and records. Each question should be unique and cover different facets of ${subDomain || category}.`;
    
    const prompt = `Generate ${count} high-quality, relevant trivia questions about ${subDomain || category}.
    
    ${varietyInstruction}
    
    CRITICAL REQUIREMENTS:
    ${isUniversalCategory 
      ? `1. Questions MUST be about UNIVERSAL/INTERNATIONAL ${subDomain || category} - This is CRITICAL. Include questions about cricket from ALL countries (India, Australia, England, West Indies, Pakistan, South Africa, New Zealand, Sri Lanka, Bangladesh, Afghanistan, etc.), international tournaments (ICC World Cup, Ashes, IPL, T20 World Cup, Champions Trophy, etc.), and global cricket history, records, and players from ALL nations. Do NOT limit to Indian cricket only - this should be truly international cricket trivia.`
      : `1. ALL QUESTIONS MUST BE ABOUT INDIA - This is an Indian trivia application. Do NOT generate questions about US, UK, or any other country unless explicitly specified.`
    }
    ${isUniversalCategory
      ? `2. Questions MUST be specifically about ${subDomain || category} from a global/international perspective - include players, teams, tournaments, and records from all cricket-playing nations. VARY the countries, players, and tournaments you ask about - don't repeat the same topics.`
      : `2. Questions MUST be specifically about ${subDomain || category} in the context of India - not generic knowledge. VARY the topics, time periods, and aspects you cover.`
    }
    3. All questions should be factually accurate and educational
    4. Questions should vary in difficulty (easy, medium, hard) - mix different difficulty levels
    5. Options should be plausible and related to the topic
    6. Avoid overly obscure or trivial facts
    7. Focus on interesting, memorable information${isUniversalCategory ? ' about international cricket' : ' about India'}
    8. DIVERSITY: Cover different aspects, time periods, players, events, and records. Avoid generating similar questions to what might have been asked before.
    
    ${relevantTopics.length > 0 ? `SPECIFIC TOPICS TO COVER: ${relevantTopics.join(', ')}` : ''}
    
    ${exampleQuestions.length > 0 ? `EXAMPLE QUESTIONS FOR REFERENCE: ${exampleQuestions.join(' | ')}` : ''}
    
    CONTEXT-SPECIFIC EXAMPLES:
    ${isUniversalCategory
      ? `- If category is "entertainment" or "sports" and subDomain is "cricket": This is UNIVERSAL/INTERNATIONAL cricket trivia. Generate questions about:
        * Players from ALL countries: Sachin Tendulkar (India), Don Bradman (Australia), Brian Lara (West Indies), Wasim Akram (Pakistan), Jacques Kallis (South Africa), etc.
        * International tournaments: ICC World Cup, Ashes Series, T20 World Cup, Champions Trophy, IPL, Big Bash League, etc.
        * Records and achievements from all cricket-playing nations
        * Historical moments from global cricket history
        * DO NOT focus only on Indian cricket - this must be truly international cricket trivia covering all major cricket nations and tournaments.`
      : `- If category is "politics" and subDomain is "national" or "National": Focus EXCLUSIVELY on Indian national politics, Indian government, Indian constitution, Indian Parliament, Indian Prime Ministers, Indian political parties. DO NOT include US politics, US government, or any non-Indian content.
    - If category is "geography" and subDomain is "North Indian": Focus on North Indian states, cities, geography within India
    - If category is "entertainment" and subDomain is "Bollywood": Focus on Indian cinema, actors, movies, music`
    }
    
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
          content: isUniversalCategory
            ? 'You are an expert trivia question generator specializing in creating relevant, accurate, and engaging questions for cognitive health applications. For cricket and sports categories, you MUST generate UNIVERSAL/INTERNATIONAL questions covering ALL cricket-playing nations (India, Australia, England, West Indies, Pakistan, South Africa, New Zealand, Sri Lanka, Bangladesh, Afghanistan, etc.), international tournaments (ICC World Cup, Ashes, IPL, T20 World Cup, Champions Trophy, etc.), and global cricket history, records, and players from ALL nations. Do NOT limit to Indian cricket only - this must be truly international cricket trivia. IMPORTANT: Generate DIVERSE questions each time - vary countries, players, tournaments, and time periods. For all other categories, focus on Indian content. Focus on meaningful content that helps with memory and learning.'
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
    
    if (validatedQuestions.length === 0) {
      throw new Error('No valid questions generated. Please try again.');
    }
    
    console.log(`Generated ${validatedQuestions.length} valid questions for ${category}/${subDomain}`);
    return validatedQuestions;
    
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
