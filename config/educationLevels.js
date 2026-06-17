const EDUCATION_LEVEL_VALUES = [
  "less_than_high_school",
  "high_school_ged",
  "some_college",
  "associate_degree",
  "bachelor_degree",
  "master_degree",
  "doctorate_professional",
  "prefer_not_to_say",
];

const EDUCATION_LEVEL_LABELS = {
  less_than_high_school: "Less than high school",
  high_school_ged: "High school / GED",
  some_college: "Some college",
  associate_degree: "Associate degree",
  bachelor_degree: "Bachelor's degree",
  master_degree: "Master's degree",
  doctorate_professional: "Doctorate or professional degree",
  prefer_not_to_say: "Prefer not to say",
};

function getEducationLevelLabel(value) {
  if (!value) return null;
  return EDUCATION_LEVEL_LABELS[value] || null;
}

function formatUserEducation(user) {
  if (!user) return null;
  if (user.highestEducationLevel) {
    return getEducationLevelLabel(user.highestEducationLevel);
  }
  if (user.yearsOfEducation != null && user.yearsOfEducation !== "") {
    return `${user.yearsOfEducation} years of education`;
  }
  return null;
}

module.exports = {
  EDUCATION_LEVEL_VALUES,
  EDUCATION_LEVEL_LABELS,
  getEducationLevelLabel,
  formatUserEducation,
};
