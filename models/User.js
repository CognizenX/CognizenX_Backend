const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    // Password reset fields
    resetPasswordToken: { type: String, required: false, index: true },
    resetPasswordExpires: { type: Date, required: false },
});

// Encrypt password before saving
UserSchema.pre("save", async function (next) {
    if (!this.isModified("password")) return next();
    next();
});

// Instance helper: set a password reset token and expiry, returns the raw token
UserSchema.methods.generatePasswordReset = function (ttlMs = 1000 * 60 * 60) {
    const crypto = require("crypto");
    const rawToken = crypto.randomBytes(32).toString("hex");
    const hashed = crypto.createHash("sha256").update(rawToken).digest("hex");
    this.resetPasswordToken = hashed;
    this.resetPasswordExpires = new Date(Date.now() + ttlMs);
    return rawToken;
};

// Instance helper: clear password reset fields
UserSchema.methods.clearPasswordReset = function () {
    this.resetPasswordToken = undefined;
    this.resetPasswordExpires = undefined;
};

module.exports = mongoose.model("User", UserSchema);
