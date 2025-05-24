// config.js - Configuration settings for the project

module.exports = {
  // MongoDB connection
  mongoURI: 'mongodb://localhost:27017/studentdatabase',

  // Server settings
  port: 5001,

  // File paths
  uploadDir: __dirname + '/uploads',

  // Other settings (e.g., for future use)
  debugMode: true
};