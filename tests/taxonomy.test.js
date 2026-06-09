const {
  normaliseTaxonomyInput,
  buildCategorySubDomainQuery,
  buildCategoryOnlyQuery,
} = require("../utils/taxonomy");

describe("taxonomy normalization", () => {
  it("maps mythology + Hindu to religion + Hindu", () => {
    const result = normaliseTaxonomyInput({
      category: "mythology",
      subDomain: "Hindu",
    });

    expect(result).toEqual({
      category: "religion",
      subDomain: "Hindu",
    });
  });

  it("maps mythology + Other Mythologies to religion + Sikhism", () => {
    const result = normaliseTaxonomyInput({
      category: "mythology",
      subDomain: "Other Mythologies",
    });

    expect(result).toEqual({
      category: "religion",
      subDomain: "Sikhism",
    });
  });

  it("accepts legacy domain field and normalizes to subDomain", () => {
    const result = normaliseTaxonomyInput({
      category: "mythology",
      domain: "Other Mythologies",
    });

    expect(result).toEqual({
      category: "religion",
      subDomain: "Sikhism",
    });
  });

  it("builds category aliases query for religion/mythology", () => {
    const query = buildCategoryOnlyQuery("mythology");
    expect(query.category.$in).toHaveLength(2);
    expect(query.category.$in.map((entry) => entry.source)).toEqual(
      expect.arrayContaining(["^religion$", "^mythology$"])
    );
  });

  it("builds subDomain aliases query for other mythologies mapped to Sikhism", () => {
    const query = buildCategorySubDomainQuery("mythology", "Other Mythologies");

    expect(query.category.$in.map((entry) => entry.source)).toEqual(
      expect.arrayContaining(["^religion$", "^mythology$"])
    );
    expect(query.subDomain.$in.map((entry) => entry.source)).toEqual(
      expect.arrayContaining([
        "^Sikhism$",
        "^sikhism$",
        "^sikh$",
        "^other mythology$",
        "^Other Mythologies$",
        "^others mythology$",
        "^others mythologies$",
      ])
    );
  });
});
