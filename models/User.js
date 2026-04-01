const mongoose = require("mongoose");
const USER_CONSTRAINTS = require("../config/userConstraints");

const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },

    // Background Fields
    // NOTE: These fields are required at the API layer (Joi signup validation),
    // but are optional in the DB schema for backward compatibility with legacy users.
    // `age` is kept for legacy users; new flows should use `dob`.
    dob: {
        type: Date,
        required: false,
    },
    age: {
        type: Number,
        required: false,
        min: USER_CONSTRAINTS.AGE_MIN,
        max: USER_CONSTRAINTS.AGE_MAX,
    },
    gender: {
        type: String,
        required: false,
        enum: USER_CONSTRAINTS.GENDER_VALUES,
    },
    countryOfOrigin: {
        type: String,
        required: false,
        trim: true,
        maxlength: USER_CONSTRAINTS.COUNTRY_MAX_LEN,
    },
    yearsOfEducation: {
        type: Number,
        required: false,
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
