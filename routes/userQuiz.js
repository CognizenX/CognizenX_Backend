const express = require('express');
const authMiddleware = require('../middleware/auth');
const { selectQuizQuestions } = require('../services/questionSelection');
const { normaliseTaxonomyInput } = require('../utils/taxonomy');

const router = express.Router();

// GET /api/user-quiz - Personalized quiz for authenticated users
router.get('/user-quiz', authMiddleware, async (req, res, next) => {
  const { categories } = req.query;
  const { subDomain } = normaliseTaxonomyInput(req.query);

  if (!categories) {
    return res.status(400).json({ message: 'Categories are required.' });
  }

  const categoryList = categories
    .split(',')
    .map((entry) => normaliseTaxonomyInput({ category: entry }).category)
    .filter(Boolean);

  if (categoryList.length === 0) {
    return res.status(400).json({ message: 'At least one valid category is required.' });
  }

  try {
    const result = await selectQuizQuestions({
      userId: req.user._id,
      categories: categoryList,
      subDomain,
      limit: 10,
    });

    if (result.questions.length === 0) {
      return res.status(200).json({
        questions: [],
        totalAvailable: result.totalAvailable,
        generated: 0,
        source: 'personalized',
        mix: result.mix,
        pools: result.pools,
        message: subDomain
          ? `No questions available for ${categoryList.join(', ')} / ${subDomain}.`
          : 'No questions available for the selected categories.',
      });
    }

    return res.json({
      questions: result.questions,
      totalAvailable: result.totalAvailable,
      generated: 0,
      source: 'personalized',
      mix: result.mix,
      pools: result.pools,
    });
  } catch (error) {
    console.error('Error fetching personalized quiz:', error);
    return next(error);
  }
});

module.exports = router;
