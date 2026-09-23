/**
 * Require authenticated user with role === "admin".
 * Must run after authMiddleware (expects req.user).
 */
const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      status: "error",
      message: "Unauthorized: Authentication required",
    });
  }

  if (req.user.role !== "admin") {
    return res.status(403).json({
      status: "error",
      message: "Forbidden: Admin access required",
    });
  }

  return next();
};

module.exports = requireAdmin;
