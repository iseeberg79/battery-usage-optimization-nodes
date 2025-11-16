module.exports = [
  {
    files: ["nodes/**/*.js"],
    languageOptions: {
      ecmaVersion: 12,
      sourceType: "commonjs",
      globals: {
        module: "readonly",
        require: "readonly",
        process: "readonly",
        console: "readonly",
        Buffer: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        RED: "readonly",
        msg: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly"
      }
    },
    rules: {
      "curly": "error",
      "eqeqeq": "warn",
      "no-undef": "error",
      "no-unused-vars": "warn",
      "semi": ["error", "always"]
    }
  }
];
