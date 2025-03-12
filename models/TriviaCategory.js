const mongoose = require("mongoose");

// Define the schema for each question
const QuestionSchema = new mongoose.Schema({
  question: { type: String, required: true },
  options: [
    {
      type: String,
      required: true, // Ensuring each option is required
      validate: {
        validator: (v) => v.trim().length > 0,
        message: "Option cannot be empty",
      },
    },
  ],
  correctAnswer: { 
    type: String, 
    required: true,
  },
});

// Define the main schema for the trivia category and questions
const TriviaCategorySchema = new mongoose.Schema({
  category: { 
    type: String, 
    required: true,
    unique: true, // Ensures unique categories
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

// Index category and domain for faster lookups
TriviaCategorySchema.index({ category: 1, domain: 1 }, { unique: true });

const TriviaCategory = mongoose.model("TriviaCategory", TriviaCategorySchema);

module.exports = TriviaCategory;
