// models/Student.js
const mongoose = require('mongoose');

const subjectSchema = new mongoose.Schema({
  name: String,
  date: Date
});

const attendanceSchema = new mongoose.Schema({
  subject: String,
  status: Boolean,
  lastUpdated: Date
});

const studentSchema = new mongoose.Schema({
  name: String, // Will update database to match
  rollNumber: String,
  subjects: [subjectSchema],
  attendance: [attendanceSchema],
  qrCode: String,
}, { collection: 'users' }); // Specify the 'users' collection

module.exports = mongoose.model('Student', studentSchema);