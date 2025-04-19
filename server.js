const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { Parser } = require('json2csv');
const Student = require('./models/Student');
const config = require('./config');

const app = express();

app.use(cors());
app.use(bodyParser.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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

    // Check if already marked for this student
    console.log('Current date:', new Date().toISOString().split('T')[0]);
    console.log('Current attendance data:', student.attendance);
    const attendance = student.attendance.find((att) => att.subject === subject);
    if (attendance) {
      console.log(`❌ Attendance already marked for ${subject} by ${rollNumber}`);
      return res.status(400).json({ error: "Attendance already marked" });
    }

    // Mark attendance
    student.attendance.push({
      subject,
      status: true,
      lastUpdated: new Date()
    });

    await student.save();
    console.log('Attendance updated:', student.attendance);

    // Create or append to CSV at specified path
    const today = new Date().toISOString().split('T')[0]; // e.g., "2025-04-19"
    const fileName = `${today}_${subject}.csv`;
    const csvPath = 'C:\\Users\\Administrator\\Desktop\\hall ticket verification\\' + fileName;
    const attendanceData = [
      { rollNumber, name: student.name, subject, status: 'Present', date: today }
    ];

    // Ensure directory exists
    const dir = 'C:\\Users\\Administrator\\Desktop\\hall ticket verification';
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    try {
      if (!fs.existsSync(csvPath)) {
        const parser = new Parser();
        const csv = parser.parse(attendanceData);
        fs.writeFileSync(csvPath, csv);
        console.log(`📝 New CSV created at: ${csvPath}`);
      } else {
        const parser = new Parser({ header: false });
        const csvLine = parser.parse(attendanceData);
        fs.appendFileSync(csvPath, '\n' + csvLine);
        console.log(`📝 Appended to CSV at: ${csvPath}`);
      }
    } catch (fsError) {
      console.error(`❌ CSV write error: ${fsError.message}`);
      return res.status(500).json({ error: 'Failed to write CSV file', details: fsError.message });
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