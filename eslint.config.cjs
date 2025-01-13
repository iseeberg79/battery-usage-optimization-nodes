const { ESLint } = require("eslint");

module.exports = new ESLint({
  env: {
    es2021: true,
    node: true
  },
  extends: "eslint:recommended",
  parserOptions: {
    ecmaVersion: 12,
    sourceType: "module"
  },
  rules: {
    curly: "error",
    eqeqeq: "warn",
    no-undef: "error",
    no-unused-vars: "warn",
    semi: ["error", "always"]
  },
  globals: {
    module: "readonly",
    msg: "readonly",
    RED: "readonly"
  }
});

