const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { Parser } = require('json2csv');
const Student = require('./models/Student');
const config = require('./config');
const nodemailer = require('nodemailer');
require('dotenv').config(); // Load environment variables
const cron = require('node-cron'); // Added for attendance reset

const app = express();

app.use(cors());
app.use(bodyParser.json());
app.use('/uploads', express.static(path.join(__dirname, 'Uploads')));

mongoose.connect(config.mongoURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// 🔒 Login route
app.post('/api/login', async (req, res) => {
  const { name, rollNumber } = req.body;
  console.log('Received:', { name, rollNumber });
  try {
    if (!name || !rollNumber) {
      return res.status(400).json({ error: 'Name and Roll Number are required.' });
    }
    const trimmedName = name.trim();
    const trimmedRollNumber = rollNumber.trim();
    console.log(`Querying: { rollNumber: '${trimmedRollNumber}' }`);
    const student = await Student.findOne({ rollNumber: trimmedRollNumber });
    console.log('Found student:', student);
    if (student && student.name.toLowerCase() === trimmedName.toLowerCase()) {
      console.log('Login successful:', student);
      res.json(student);
    } else {
      console.log("❌ Student not found or name mismatch");
      res.status(404).json({ error: "Student not found" });
    }
  } catch (error) {
    console.error("Error during login:", error);
    res.status(500).json({ error: "Something went wrong. Please try again later." });
  }
});

// 📚 Get all unique subjects
app.get('/api/subjects', async (req, res) => {
  try {
    const students = await Student.find();
    const allSubjects = students.flatMap(s => s.subjects.map(sub => sub.name));
    const uniqueSubjects = [...new Set(allSubjects)];
    res.json(uniqueSubjects);
  } catch (err) {
    console.error("Error fetching subjects:", err);
    res.status(500).json({ error: "Failed to fetch subjects" });
  }
});

// ✅ Update QR Code
app.post('/api/update-qrcode', async (req, res) => {
  const { rollNumber, qrCode } = req.body;
  try {
    if (!rollNumber || !qrCode) {
      return res.status(400).json({ error: 'Roll number and QR code are required.' });
    }
    const student = await Student.findOneAndUpdate(
      { rollNumber: rollNumber.trim() },
      { qrCode: qrCode },
      { new: true, runValidators: true }
    );
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }
    console.log('QR Code updated for:', student);
    res.json({ success: true, message: 'QR Code updated successfully', student });
  } catch (error) {
    console.error('Error updating QR Code:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  },
  tls: {
    rejectUnauthorized: false // Disable certificate validation (for testing)
  }
});

// Schedule daily attendance reset at midnight
cron.schedule('0 0 * * *', async () => {
  try {
    console.log('Resetting attendance at', new Date().toISOString());
    await Student.updateMany({}, { $set: { attendance: [] } });
    console.log('Attendance reset successfully for all students');
  } catch (error) {
    console.error('Error resetting attendance:', error);
  }
});

// Email sending route
app.post('/api/send-email', async (req, res) => {
  const { email, subject, message } = req.body;

  if (!email || !subject || !message) {
    return res.status(400).json({ error: 'Email, subject, and message are required' });
  }

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: subject,
    text: message
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('Email sent:', mailOptions);
    res.json({ success: true, message: 'Email sent successfully' });
  } catch (error) {
    console.error('Full error:', error);  // 👈 Logs the real cause
    res.status(500).json({ error: error.message });
  }
});

// ✅ Attendance + CSV
app.post('/api/mark-attendance', async (req, res) => {
  const { rollNumber, subject } = req.body;
  console.log('Received attendance request:', { rollNumber, subject });

  try {
    const student = await Student.findOne({ rollNumber });
    if (!student) {
      return res.status(404).json({ error: "Student not found" });
    }

    const subjectIndex = student.subjects.findIndex((subj) => subj.name === subject);
    if (subjectIndex === -1) {
      return res.status(404).json({ error: "Subject not found" });
    }

    const attendance = student.attendance.find((att) => att.subject === subject);
    if (attendance) {
      console.log(`❌ Attendance already marked for ${subject} by ${rollNumber}`);
      return res.status(400).json({ error: "Attendance already marked" });
    }

    student.attendance.push({
      subject,
      status: true,
      lastUpdated: new Date()
    });

    await student.save();
    console.log('Attendance updated:', student.attendance);

    const today = new Date().toISOString().split('T')[0];
    const fileName = `${today}_${subject}.csv`;
    const csvPath = path.join(__dirname, 'attendance', fileName); // Dynamically create path
    const attendanceData = [
      { rollNumber, name: student.name, subject, status: 'Present', date: today }
    ];

    const dir = path.join(__dirname, 'attendance');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const parser = new Parser({ header: !fs.existsSync(csvPath) });
    const csvLine = parser.parse(attendanceData);
    fs.appendFileSync(csvPath, csvLine);
    console.log(`📝 Appended to CSV at: ${csvPath}`);

    // Send email notification
    console.log('Attempting to send email for student:', student.rollNumber);
    if (student.email) {
      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: student.email,
        subject: 'Attendance Marked',
        text: `Dear ${student.name},\n\nYour attendance for ${subject} has been marked on ${today}.\nRoll Number: ${rollNumber}\n\nRegards,\nExam Administration`
      };
      try {
        await transporter.sendMail(mailOptions);
        console.log('Email sent to:', student.email);
      } catch (emailError) {
        console.error('Failed to send email to', student.email, ':', emailError.message);
      }
    } else {
      console.log('No email found for student:', student.rollNumber);
    }

    return res.status(200).json({ success: true, message: `Attendance marked for ${student.name}` });
  } catch (err) {
    console.error("❌ Internal server error:", err);
    res.status(500).json({ error: 'Internal Server Error', details: err.message });
  }
});

app.listen(config.port, () => {
  console.log(`Server is running on http://localhost:${config.port}`);
});