require("dotenv").config();
require("./instrument");

const app = require("./app");

// Start server for local development
if (require.main === module) {
  const PORT = process.env.PORT || 6000;
  app.listen(PORT, () => {
    console.log(`🚀 Backend server running on http://localhost:${PORT}`);
    console.log(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

// Export the Express app for Vercel's serverless environment.
module.exports = app;
