const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    sessionToken: { type: String, required: false }, 
});

// Encrypt password before saving
UserSchema.pre("save", async function (next) {
    if (!this.isModified("password")) return next();
    next();
});

module.exports = mongoose.model("User", UserSchema);
