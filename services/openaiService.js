const OpenAI = require('openai');
const { getRelevantTopics, getExampleQuestions } = require('../services/questionTemplates');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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
    const prompt = `Generate ${count} high-quality, relevant trivia questions about ${subDomain || category}.
    
    CRITICAL REQUIREMENTS:
    1. Questions MUST be specifically about ${subDomain || category} - not generic knowledge
    2. All questions should be factually accurate and educational
    3. Questions should vary in difficulty (easy, medium, hard)
    4. Options should be plausible and related to the topic
    5. Avoid overly obscure or trivial facts
    6. Focus on interesting, memorable information
    
    ${relevantTopics.length > 0 ? `SPECIFIC TOPICS TO COVER: ${relevantTopics.join(', ')}` : ''}
    
    ${exampleQuestions.length > 0 ? `EXAMPLE QUESTIONS FOR REFERENCE: ${exampleQuestions.join(' | ')}` : ''}
    
    CONTEXT-SPECIFIC EXAMPLES:
    - If category is "politics" and subDomain is "National": Focus on Indian national politics, government, constitution
    - If category is "geography" and subDomain is "North Indian": Focus on North Indian states, cities, geography
    - If category is "entertainment" and subDomain is "Bollywood": Focus on Indian cinema, actors, movies, music
    
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

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { 
          role: 'system', 
          content: 'You are an expert trivia question generator specializing in creating relevant, accurate, and engaging questions for cognitive health applications. Focus on meaningful content that helps with memory and learning.' 
        },
        { 
          role: 'user', 
          content: prompt 
        }
      ],
      temperature: 0.3, // Lower temperature for more consistent, focused questions
      max_tokens: 1200, // Reduced to ~120 tokens per question (10 questions) - safer for quota limits
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
    
    // Provide more specific error messages
    if (error.message?.includes('API key')) {
      throw new Error('OpenAI API key is invalid or missing. Please check your configuration.');
    } else if (error.message?.includes('rate limit')) {
      throw new Error('OpenAI API rate limit exceeded. Please try again later.');
    } else if (error.message?.includes('insufficient_quota')) {
      throw new Error('OpenAI API quota exceeded. Please check your account billing.');
    } else {
      throw new Error(`Failed to generate questions: ${error.message}`);
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
    
    const prompt = `Provide a concise 3-line explanation for the following trivia question: "${question}". 
User's answer: "${userAnswer}".
Correct answer: "${correctAnswer}".
Explain why the correct answer is correct and provide brief context. Keep it simple and educational.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { 
          role: 'system', 
          content: 'You are an expert educator who explains trivia questions clearly and concisely. Focus on why the correct answer is right, not just what it is.' 
        },
        { 
          role: 'user', 
          content: prompt 
        }
      ],
      temperature: 0.3,
      max_tokens: 100, // Reduced from 150 to be safer with limited quota
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
    
    // Provide more specific error messages
    if (error.message?.includes('API key') || error.status === 401) {
      throw new Error('OpenAI API key is invalid or missing. Please check your configuration.');
    } else if (error.message?.includes('rate limit') || error.status === 429) {
      throw new Error('OpenAI API rate limit exceeded. Please try again later.');
    } else if (error.message?.includes('insufficient_quota') || error.message?.includes('quota')) {
      throw new Error('OpenAI API quota exceeded. Please check your account billing.');
    } else {
      throw new Error(`Failed to generate explanation: ${error.message}`);
    }
  }
};

module.exports = { generateQuestions, generateExplanation };
