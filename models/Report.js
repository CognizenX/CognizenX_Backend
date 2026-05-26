const mongoose = require("mongoose");

const ReportSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: {
      type: String,
      enum: ["answer_review"],
      default: "answer_review",
      required: true,
    },
    status: {
      type: String,
      enum: ["open", "reviewed", "resolved"],
      default: "open",
      index: true,
    },
    notes: { type: String, required: true, trim: true, maxlength: 2000 },
    questionId: { type: String, trim: true, default: "" },
    category: { type: String, trim: true, default: "" },
    subDomain: { type: String, trim: true, default: "" },
    questionText: { type: String, required: true, trim: true },
    questionOptions: [{ type: String }],
    suggestedAnswer: { type: String, trim: true, default: "" },
    userAnswer: { type: String, trim: true, default: "" },
    explanationText: { type: String, trim: true, default: "" },
    isMarkedCorrect: { type: Boolean, default: false },
    questionIndex: { type: Number, min: 0, default: 0 },
    totalQuestions: { type: Number, min: 1, default: 1 },
  },
  {
    collection: "reports",
    timestamps: true,
  }
);

ReportSchema.index({ createdAt: -1 });

const Report = mongoose.model("Report", ReportSchema);

module.exports = Report;
