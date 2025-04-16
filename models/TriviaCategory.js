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
  subDomain: { 
    type: String, 
    required: false,
    trim: true,
  },
  createdAt: { 
    type: Date, 
    default: Date.now,
  },
});

// Define the schema for trivia categories and associated questions
const TriviaCategorySchema = new mongoose.Schema({
  category: { 
    type: String, 
    required: true,
    trim: true,
  },
  domain: { 
    type: String, 
    required: true,
    trim: true,
  },
  questions: [QuestionSchema], // Array of questions under each category
  createdAt: { 
    type: Date, 
    default: Date.now, 
  },
});

// Ensure fast lookups by indexing category, domain, and subdomain
TriviaCategorySchema.index({ category: 1, domain: 1 }, { unique: true });

const TriviaCategory = mongoose.model("TriviaCategory", TriviaCategorySchema);

module.exports = TriviaCategory;