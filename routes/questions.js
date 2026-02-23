const express = require("express");
const TriviaCategory = require("../models/TriviaCategory");
const {
  formatQuestion,
  formatQuestions,
  deduplicateAgainst,
  normaliseForResponse,
} = require("../utils/questionFormatter");
const { generateQuestions } = require("../services/openaiService");

const router = express.Router();

// POST /api/add-questions - Add questions manually
router.post("/add-questions", async (req, res, next) => {
  console.log(req.body);

  const { category, domain, questions } = req.body;

  try {
    let triviaCategory = await TriviaCategory.findOne({ category, domain });

    if (!triviaCategory) {
      triviaCategory = new TriviaCategory({
        category,
        domain,
        questions: [],
      });
    }

    const formatted = questions.map(q => formatQuestion(q, { subDomain: q.subDomain }));
    const { unique, addedCount, duplicateCount } = deduplicateAgainst(
      formatted,
      triviaCategory.questions,
      '/api/add-questions'
    );
    triviaCategory.questions.push(...unique);
    
    console.log(`Added ${addedCount} new questions, skipped ${duplicateCount} duplicates`);

    await triviaCategory.save();

    res.json({
      status: "success",
      message: "Questions added successfully!",
      data: triviaCategory,
    });
  } catch (error) {
    console.error("Error saving questions:", error);
    next(error);
  }
});

// GET /api/questions - Fetch questions by category and subDomain
router.get("/questions", async (req, res, next) => {
  const { category, subDomain } = req.query;

  if (!category || !subDomain) {
    return res.status(400).json({
      status: "error",
      message: "Category and subDomain are required parameters.",
    });
  }
  try {
    const triviaCategory = await TriviaCategory.findOne({ category, domain: subDomain });

    if (!triviaCategory || !triviaCategory.questions.length) {
      return res.status(404).json({
        status: "error",
        message: "No questions found for the specified category and subDomain.",
      });
    }

    res.json({
      status: "success",
      questions: triviaCategory.questions.map(normaliseForResponse),
    });
  } catch (error) {
    console.log(error);
    next(error);
  }
});

// GET /api/random-questions - Get random questions (AI-generated or from bank)
router.get("/random-questions", async (req, res, next) => {
  const { categories, subDomain, useSaved = 'false' } = req.query;

  if (!categories) {
    return res.status(400).json({ message: 'Categories are required.' });
  }

  const categoryList = categories.split(',');
  const shouldUseSaved = useSaved === 'true' || useSaved === true;

  try {
    let newQuestions = [];
    let savedQuestions = [];
    
    // For each category, generate new questions and get saved ones
    for (const category of categoryList) {
      // Determine the domain/subDomain to use
      const domainToUse = subDomain || category;
      
      // First, try to get saved questions from the bank
      const query = subDomain 
        ? { category, domain: subDomain }
        : { category };
      
      let triviaCategory = await TriviaCategory.findOne(query);
      
      // If no questions exist for this category/subDomain, try to find any questions for the category
      if (!triviaCategory || triviaCategory.questions.length === 0) {
        const anyCategoryQuestions = await TriviaCategory.findOne({ category });
        if (anyCategoryQuestions && anyCategoryQuestions.questions.length > 0) {
          triviaCategory = anyCategoryQuestions;
        }
      }
      
      // Collect saved questions
      if (triviaCategory && triviaCategory.questions.length > 0) {
        let categorySavedQuestions = [];
        if (subDomain) {
          categorySavedQuestions = triviaCategory.questions.filter(q => {
            const questionSubDomain = q.subDomain || triviaCategory.domain;
            return questionSubDomain === subDomain || triviaCategory.domain === subDomain;
          });
        } else {
          categorySavedQuestions = triviaCategory.questions;
        }
        savedQuestions.push(...categorySavedQuestions);
      }
      
      // Try to generate NEW questions for this quiz session (10 new questions needed)
      if (!shouldUseSaved) {
        console.log(`[QUESTION GENERATION] Starting generation for category: "${category}", domain: "${domainToUse}"`);
        
        try {
          // Generate 10 new questions for this category/subDomain
          console.log(`[QUESTION GENERATION] Calling OpenAI API for ${category}/${domainToUse}...`);
          const generatedQuestions = await generateQuestions(category, domainToUse, 10);
          console.log(`[QUESTION GENERATION] OpenAI returned ${generatedQuestions.length} questions for ${category}/${domainToUse}`);
          
          // Format the generated questions
          const formattedQuestions = formatQuestions(generatedQuestions, {
            category,
            subDomain: domainToUse,
            aiGenerated: true,
          });
          
          // Add generated questions to the response
          newQuestions.push(...formattedQuestions);
          
          // Save generated questions to database for future reference
          let triviaCategoryForSave = await TriviaCategory.findOne({ category, domain: domainToUse });
          if (!triviaCategoryForSave) {
            triviaCategoryForSave = new TriviaCategory({ 
              category, 
              domain: domainToUse, 
              questions: [] 
            });
          }
          
          // Add new questions to the database (avoid duplicates by checking question text)
          const { unique, addedCount, duplicateCount } = deduplicateAgainst(
            formattedQuestions,
            triviaCategoryForSave.questions,
            '/api/random-questions'
          );
          triviaCategoryForSave.questions.push(...unique);
          
          await triviaCategoryForSave.save();
          console.log(`Generated and saved ${addedCount} new questions for ${category}/${domainToUse} (${duplicateCount} duplicates skipped)`);
        } catch (genError) {
          console.error(`[QUESTION GENERATION] FAILED for ${category}/${domainToUse}:`, genError.message);
          console.error(`[QUESTION GENERATION] Error details:`, {
            category,
            domainToUse,
            errorType: genError.constructor?.name,
            errorMessage: genError.message,
            hasApiKey: !!process.env.OPENAI_API_KEY
          });
          // If generation fails, we'll use saved questions as fallback
          if (genError.message?.includes('API key')) {
            console.warn(`[QUESTION GENERATION] OpenAI API key issue for ${category}/${domainToUse} - will use saved questions only`);
          } else {
            console.warn(`[QUESTION GENERATION] Generation failed for ${category}/${domainToUse} - will use saved questions as fallback`);
          }
        }
      }
    }
    
    // Use 10 new AI-generated questions, or fallback to saved questions if generation fails
    let finalQuestions = [];
    
    if (newQuestions.length >= 10) {
      // We have enough new questions - use all 10
      finalQuestions = newQuestions.sort(() => Math.random() - 0.5).slice(0, 10);
    } else if (newQuestions.length > 0) {
      // We have some new questions but not enough - use what we have (shouldn't happen normally)
      console.log(`Warning: Only generated ${newQuestions.length} questions, expected 10`);
      finalQuestions = newQuestions.sort(() => Math.random() - 0.5);
      // Try to fill remaining slots from saved questions if available
      if (savedQuestions.length > 0 && finalQuestions.length < 10) {
        const neededFromSaved = 10 - finalQuestions.length;
        const shuffledSaved = savedQuestions.sort(() => Math.random() - 0.5).slice(0, neededFromSaved);
        finalQuestions = [...finalQuestions, ...shuffledSaved];
      }
    } else if (savedQuestions.length > 0) {
      // Can't generate new questions - use all 10 from bank as fallback
      console.log(`Using all ${Math.min(savedQuestions.length, 10)} questions from bank (generation failed)`);
      finalQuestions = savedQuestions.sort(() => Math.random() - 0.5).slice(0, 10);
    }
    
    if (finalQuestions.length === 0) {
      return res.status(200).json({
        questions: [],
        totalAvailable: 0,
        generated: 0,
        message: subDomain 
          ? `No questions available for ${categoryList.join(', ')} / ${subDomain}. Please check OpenAI API configuration.`
          : 'No questions available for the selected categories. Please check OpenAI API configuration.'
      });
    }
    
    // Final shuffle for randomness (finalQuestions is already limited to 10)
    const shuffledFinal = finalQuestions.sort(() => Math.random() - 0.5);
    
    // Ensure backward compatibility for existing questions
    const compatibleQuestions = shuffledFinal.map(normaliseForResponse);
    
    res.json({ 
      questions: compatibleQuestions,
      totalAvailable: finalQuestions.length,
      generated: compatibleQuestions.filter(q => q.aiGenerated).length
    });
  } catch (error) {
    console.error('Error fetching random questions:', error);
    next(error);
  }
});

module.exports = router;
