const mongoose = require('mongoose');

const adminSchema = new mongoose.Schema({
  username: String,
  password: String // In production, hash with bcrypt
});

module.exports = mongoose.model('Admin', adminSchema, 'adminusers');  