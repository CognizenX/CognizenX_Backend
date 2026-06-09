const mongoose = require("mongoose");

// Define the schema for each question
const QuestionSchema = new mongoose.Schema({
  question: { type: String, required: true },
  options: [
    {
      type: String,
      required: true,
      validate: {
        validator: (v) => v.trim().length > 0,
        message: "Option cannot be empty",
      },
    },
  ],
  correct_answer: { 
    type: String, 
    required: false,
  },
  // Backward compatibility: support both field names
  correctAnswer: { 
    type: String, 
    required: false,
  },
  subDomain: { 
    type: String, 
    required: false,
    trim: true,
  },
  createdAt: { 
    type: Date, 
    default: Date.now,
  },
  // New optional fields for enhanced functionality
  aiGenerated: { 
    type: Boolean, 
    default: false,
    required: false,
  },
  difficulty: { 
    type: String, 
    enum: ['easy', 'medium', 'hard'],
    default: 'medium',
    required: false,
  },
  validated: { 
    type: Boolean, 
    default: true,
    required: false,
  },
  // Cache explanations to avoid regenerating them
  explanation: {
    type: String,
    required: false,
    trim: true,
  },
  explanationGeneratedAt: {
    type: Date,
    required: false,
  },
  embedding: {
    type: [Number],
    required: false,
  },
});

// Define the schema for trivia categories and associated questions
const TriviaCategorySchema = new mongoose.Schema({
  category: {
    type: String,
    required: true,
    trim: true,
  },
  subDomain: {
    type: String,
    required: true,
    trim: true,
  },
  questions: [QuestionSchema], // Array of questions under each category
  // Count of distinct questions that have been answered at least once by any user.
  // Used to compute the seen ratio and trigger the question scheduler.
  seen: {
    type: Number,
    default: 0,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Ensure fast lookups by indexing category and subDomain
TriviaCategorySchema.index({ category: 1, subDomain: 1 }, { unique: true });

const TriviaCategory = mongoose.model("TriviaCategory", TriviaCategorySchema);

module.exports = TriviaCategory;