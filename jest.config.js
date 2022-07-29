module.exports = {
  roots: ["<rootDir>/src/", "<rootDir>/test/"],
  transform: {
    "^.+\\.(t|j)sx?$": ["@swc/jest"],
  },
  testRegex: "(/__tests__/.*|\\.(test|spec))\\.[tj]sx?$",
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
  testEnvironment: "node",
};
