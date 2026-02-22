const Joi = require("joi");

const validate = (schema, property = "body") => (req, res, next) => {
  const { error, value } = schema.validate(req[property], {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    error.isJoi = true;
    return next(error);
  }

  req[property] = value;
  return next();
};

const signupSchema = Joi.object({
  name: Joi.string().min(2).max(50).pattern(/^[a-zA-Z\s]+$/).required(),
  email: Joi.string().email().max(100).required(),
  password: Joi.string().min(6).max(128).required(),
});

const loginSchema = Joi.object({
  email: Joi.string().email().max(100).required(),
  password: Joi.string().required(),
});

module.exports = {
  validate,
  signupSchema,
  loginSchema,
};
