const express = require("express");
const Joi = require("joi");

const authMiddleware = require("../middleware/auth");
const { validate } = require("../middleware/validate");
const Report = require("../models/Report");

const router = express.Router();

const createReportSchema = Joi.object({
  type: Joi.string().valid("answer_review").default("answer_review"),
  notes: Joi.string().trim().min(5).max(2000).required(),
  questionId: Joi.string().trim().allow("").default(""),
  category: Joi.string().trim().allow("").default(""),
  subDomain: Joi.string().trim().allow("").default(""),
  questionText: Joi.string().trim().min(1).max(5000).required(),
  questionOptions: Joi.array().items(Joi.string().trim().max(500)).default([]),
  suggestedAnswer: Joi.string().trim().allow("").default(""),
  userAnswer: Joi.string().trim().allow("").default(""),
  explanationText: Joi.string().trim().allow("").max(10000).default(""),
  isMarkedCorrect: Joi.boolean().default(false),
  questionIndex: Joi.number().integer().min(0).default(0),
  totalQuestions: Joi.number().integer().min(1).default(1),
});

router.post("/reports", authMiddleware, validate(createReportSchema), async (req, res, next) => {
  try {
    const report = await Report.create({
      userId: req.user._id,
      ...req.body,
      status: "open",
    });

    return res.status(201).json({
      status: "success",
      reportId: report._id,
    });
  } catch (error) {
    console.error("Error creating report:", error);
    error.statusMessage = "Failed to save report.";
    return next(error);
  }
});

module.exports = router;
