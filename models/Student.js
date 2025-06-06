const mongoose = require('mongoose');

const subjectSchema = new mongoose.Schema({
  name: String,
  date: Date,
});

const attendanceSchema = new mongoose.Schema({
  subject: String,
  status: Boolean,
  lastUpdated: Date,
});

const studentSchema = new mongoose.Schema({
  name: String,
  rollNumber: String,
  subjects: [subjectSchema],
  attendance: [attendanceSchema],
  qrCode: String,
  email: String, // Added email field
  photo: String, // Added photo field to match document
}, { collection: 'users' });

module.exports = mongoose.model('Student', studentSchema);