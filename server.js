const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { Parser } = require('json2csv');
const Student = require('./models/Student');
const Admin = require('./models/Admin');
const config = require('./config');
const nodemailer = require('nodemailer');
const multer = require('multer');
const { parse } = require('csv-parse');
const cron = require('node-cron');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(__dirname));
app.use('/uploads', express.static(config.uploadDir));

// Multer setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, config.uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// Authenticate admin credentials
const authenticateAdmin = async (username, password) => {
  if (!username || !password) {
    throw new Error('Username and password are required');
  }
  const admin = await Admin.findOne({ username });
  if (!admin || admin.password !== password) {
    throw new Error('Invalid credentials');
  }
  return true;
};

mongoose.connect(config.mongoURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// Check admin auth
app.post('/api/check-auth', async (req, res) => {
  try {
    const { username, password } = req.body;
    await authenticateAdmin(username, password);
    res.json({ valid: true });
  } catch (error) {
    console.error('Check-auth error:', error.message);
    res.status(401).json({ valid: false, error: error.message });
  }
});

// Admin login
app.post('/api/admin-login', async (req, res) => {
  try {
    const { username, password } = req.body;
    await authenticateAdmin(username, password);
    res.json({ message: 'Login successful' });
  } catch (error) {
    console.error('Admin login error:', error.message);
    res.status(error.message === 'Invalid credentials' ? 401 : 400).json({ error: error.message });
  }
});

// Add single student
app.post('/api/add-student', upload.single('photo'), async (req, res) => {
  try {
    console.log('Received /api/add-student request:', req.body, req.file);
    const { username, password, name, rollNumber, email, subjects } = req.body;

    // Validate required fields
    if (!username || !password || !name || !rollNumber || !email || !subjects) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    await authenticateAdmin(username, password);

    let parsedSubjects;
    try {
      parsedSubjects = JSON.parse(subjects);
    } catch (parseError) {
      console.error('Failed to parse subjects:', subjects, parseError);
      return res.status(400).json({ error: 'Invalid subjects format' });
    }

    if (!Array.isArray(parsedSubjects) || parsedSubjects.length === 0) {
      return res.status(400).json({ error: 'Subjects must be a non-empty array' });
    }

    // Validate subjects format
    for (const subj of parsedSubjects) {
      if (!subj.name || !subj.date) {
        return res.status(400).json({ error: 'Each subject must have a name and date' });
      }
    }

    const photo = req.file ? `/uploads/${req.file.filename}` : '/uploads/default.jpg';
    const student = new Student({
      name,
      rollNumber,
      email,
      photo,
      subjects: parsedSubjects,
      qrCode: '',
      attendance: []
    });

    await student.save();
    console.log('Student added:', student);
    res.json({ message: 'Student added successfully' });
  } catch (error) {
    console.error('Error in /api/add-student:', error.message, error.stack);
    res.status(error.message === 'Invalid credentials' ? 401 : 500).json({ error: error.message || 'Failed to add student' });
  }
});

// Add students from CSV
app.post('/api/add-students-csv', upload.single('csvFile'), async (req, res) => {
  try {
    console.log('Received /api/add-students-csv request:', req.body, req.file);
    const { username, password } = req.body;
    if (!username || !password || !req.file) {
      return res.status(400).json({ error: 'Admin credentials and CSV file are required' });
    }
    await authenticateAdmin(username, password);
    const students = [];
    fs.createReadStream(req.file.path)
      .pipe(parse({ columns: true, trim: true }))
      .on('data', (row) => {
        try {
          students.push({
            name: row.name,
            rollNumber: row.rollNumber,
            email: row.email,
            photo: row.photo || '/uploads/default.jpg',
            subjects: JSON.parse(row.subjects),
            qrCode: '',
            attendance: []
          });
        } catch (error) {
          console.error('Error parsing CSV row:', row, error);
        }
      })
      .on('end', async () => {
        if (students.length === 0) {
          fs.unlinkSync(req.file.path);
          return res.status(400).json({ error: 'No valid students found in CSV' });
        }
        await Student.insertMany(students);
        fs.unlinkSync(req.file.path);
        console.log('Students added from CSV:', students.length);
        res.json({ message: 'Students added successfully' });
      })
      .on('error', (error) => {
        console.error('CSV parsing error:', error);
        res.status(500).json({ error: 'Failed to parse CSV' });
      });
  } catch (error) {
    console.error('Error in /api/add-students-csv:', error.message, error.stack);
    res.status(error.message === 'Invalid credentials' ? 401 : 500).json({ error: error.message });
  }
});

// Student login
app.post('/api/login', async (req, res) => {
  try {
    const { name, rollNumber } = req.body;
    console.log('Received /api/login:', { name, rollNumber });
    if (!name || !rollNumber) {
      return res.status(400).json({ error: 'Name and Roll Number are required' });
    }
    const trimmedName = name.trim();
    const trimmedRollNumber = rollNumber.trim();
    const student = await Student.findOne({ rollNumber: trimmedRollNumber });
    if (student && student.name.toLowerCase() === trimmedName.toLowerCase()) {
      console.log('Student login successful:', student);
      res.json(student);
    } else {
      console.log('Student not found or name mismatch');
      res.status(404).json({ error: 'Student not found' });
    }
  } catch (error) {
    console.error('Error in /api/login:', error.message);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// Get all unique subjects
app.get('/api/subjects', async (req, res) => {
  try {
    const students = await Student.find();
    const allSubjects = students.flatMap(s => s.subjects.map(sub => sub.name));
    const uniqueSubjects = [...new Set(allSubjects)];
    res.json(uniqueSubjects);
  } catch (error) {
    console.error('Error in /api/subjects:', error.message);
    res.status(500).json({ error: 'Failed to fetch subjects' });
  }
});

// Update QR Code
app.post('/api/update-qrcode', async (req, res) => {
  try {
    const { rollNumber, qrCode } = req.body;
    console.log('Received /api/update-qrcode:', { rollNumber, qrCode });
    if (!rollNumber || !qrCode) {
      return res.status(400).json({ error: 'Roll number and QR code are required' });
    }
    const student = await Student.findOneAndUpdate(
      { rollNumber: rollNumber.trim() },
      { qrCode },
      { new: true, runValidators: true }
    );
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }
    console.log('QR Code updated:', student);
    res.json({ success: true, message: 'QR Code updated successfully', student });
  } catch (error) {
    console.error('Error in /api/update-qrcode:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Email setup
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  },
  tls: {
    rejectUnauthorized: false
  }
});

// Daily attendance reset
cron.schedule('0 0 * * *', async () => {
  try {
    console.log('Resetting attendance at', new Date().toISOString());
    await Student.updateMany({}, { $set: { attendance: [] } });
    console.log('Attendance reset successfully');
  } catch (error) {
    console.error('Error resetting attendance:', error);
  }
});

// Send email
app.post('/api/send-email', async (req, res) => {
  try {
    const { email, subject, message } = req.body;
    console.log('Received /api/send-email:', { email, subject, message });
    if (!email || !subject || !message) {
      return res.status(400).json({ error: 'Email, subject, and message are required' });
    }
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject,
      text: message
    };
    await transporter.sendMail(mailOptions);
    console.log('Email sent:', mailOptions);
    res.json({ success: true, message: 'Email sent successfully' });
  } catch (error) {
    console.error('Error in /api/send-email:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Mark attendance
app.post('/api/mark-attendance', async (req, res) => {
  try {
    const { rollNumber, subject } = req.body;
    console.log('Received /api/mark-attendance:', { rollNumber, subject });
    const student = await Student.findOne({ rollNumber });
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }
    const subjectIndex = student.subjects.findIndex((subj) => subj.name === subject);
    if (subjectIndex === -1) {
      return res.status(404).json({ error: 'Subject not found' });
    }
    const attendance = student.attendance.find((att) => att.subject === subject);
    if (attendance) {
      console.log(`Attendance already marked for ${subject} by ${rollNumber}`);
      return res.status(400).json({ error: 'Attendance already marked' });
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
    const csvPath = path.join(__dirname, 'attendance', fileName);
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
    console.log(`Appended to CSV: ${csvPath}`);
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
        console.error('Failed to send email:', emailError.message);
      }
    }
    res.json({ success: true, message: `Attendance marked for ${student.name}` });
  } catch (error) {
    console.error('Error in /api/mark-attendance:', error.message);
    res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
});

app.listen(config.port, () => {
  console.log(`Server is running on http://localhost:${config.port}`);
});