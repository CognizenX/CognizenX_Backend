const mongoose = require("mongoose");
const USER_CONSTRAINTS = require("../config/userConstraints");

const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    password: { type: String, required: true },

    // Background Fields
    age: { type: Number,
        required: true,
        min: USER_CONSTRAINTS.AGE_MIN,
        max: USER_CONSTRAINTS.AGE_MAX,
     },
     gender: {
        type: String,
        required: true,
        enum: USER_CONSTRAINTS.GENDER_VALUES,
     },
     countryOfOrigin: {
        type: String,
        required: true,
        trim: true,
        maxlength: USER_CONSTRAINTS.COUNTRY_MAX_LEN,
     },
     yearsOfEducation: {
        type: Number,
        required: true,
        min: USER_CONSTRAINTS.EDU_YEARS_MIN,
        max: USER_CONSTRAINTS.EDU_YEARS_MAX,
     },

    // Session token fields
    sessionToken: { type: String, required: false },
    tokenExpiresAt: { type: Date, default: null },
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
