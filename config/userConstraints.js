// CognizenX_Backend/config/userConstraints.js

const USER_CONSTRAINTS = {
  AGE_MIN: 0,
  AGE_MAX: 120,

  EDU_YEARS_MIN: 0,
  EDU_YEARS_MAX: 30,

  COUNTRY_MAX_LEN: 80,

  GENDER_VALUES: ["male", "female", "non_binary", "other", "prefer_not_to_say"],

  EDUCATION_LEVEL_VALUES: require("./educationLevels").EDUCATION_LEVEL_VALUES,
};

module.exports = USER_CONSTRAINTS;