const errorHandler = (err, req, res, next) => {
  console.error("Unhandled error:", err);

  // Mongoose duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    return res.status(409).json({
      message: `${field} already exists`,
      field: field,
    });
  }

  // Joi validation error
  if (err.isJoi) {
    return res.status(400).json({
      message: "Validation error",
      details: err.details.map((detail) => ({
        field: detail.path.join("."),
        message: detail.message,
      })),
    });
  }

  // MongoDB connection errors
  if (err.name === "MongoNetworkError" || err.name === "MongoTimeoutError") {
    return res.status(503).json({
      message: "Database temporarily unavailable",
    });
  }

  // Mongoose schema validation errors
  if (err.name === "ValidationError") {
    return res.status(400).json({
      message: "Validation error",
      details: Object.values(err.errors || {}).map((e) => ({
        field: e.path,
        message: e.message,
      })),
    });
  }

  // Explicit HTTP errors (e.g., OpenAI rate limits)
  const explicitStatus = err.statusCode || err.status;
  if (explicitStatus && Number.isInteger(explicitStatus)) {
    return res.status(explicitStatus).json({
      message: err.statusMessage || err.message || "Request failed",
      ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
      ...(err.code && { code: err.code }),
    });
  }

  // Default 500 error with optional custom message
  res.status(500).json({
    message: err.statusMessage || "Internal server error",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
};

module.exports = errorHandler;
