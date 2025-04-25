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
    // For production, use bcrypt:
    // if (!admin || !(await bcrypt.compare(password, admin.password))) {
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

// Admin login
app.post('/api/admin-login', async (req, res) => {
  const { username, password } = req.body;
  try {
    await authenticateAdmin(username, password);
    res.json({ message: 'Login successful' });
  } catch (error) {
    console.error('Error during admin login:', error.message);
    res.status(error.message === 'Invalid credentials' ? 401 : 400).json({ error: error.message });
  }
});

// Add single student
app.post('/api/add-student', upload.single('photo'), async (req, res) => {
  try {
    const { username, password, name, rollNumber, email, subjects } = req.body;
    await authenticateAdmin(username, password);
    const photo = req.file ? `/uploads/${req.file.filename}` : '/uploads/default.jpg';
    const parsedSubjects = JSON.parse(subjects);
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
    res.json({ message: 'Student added successfully' });
  } catch (error) {
    console.error('Error adding student:', error.message);
    res.status(error.message === 'Invalid credentials' ? 401 : 500).json({ error: error.message });
  }
});

// Add students from CSV
app.post('/api/add-students-csv', upload.single('csvFile'), async (req, res) => {
  try {
    const { username, password } = req.body;
    await authenticateAdmin(username, password);
    const students = [];
    fs.createReadStream(req.file.path)
      .pipe(parse({ columns: true, trim: true }))
      .on('data', (row) => {
        students.push({
          name: row.name,
          rollNumber: row.rollNumber,
          email: row.email,
          photo: row.photo || '/uploads/default.jpg',
          subjects: JSON.parse(row.subjects),
          qrCode: '',
          attendance: []
        });
      })
      .on('end', async () => {
        await Student.insertMany(students);
        fs.unlinkSync(req.file.path);
        res.json({ message: 'Students added successfully' });
      })
      .on('error', (error) => {
        console.error('Error parsing CSV:', error);
        res.status(500).json({ error: 'Failed to parse CSV' });
      });
  } catch (error) {
    console.error('Error adding students:', error.message);
    res.status(error.message === 'Invalid credentials' ? 401 : 500).json({ error: error.message });
  }
});

// Student login
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

// Get all unique subjects
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

// Add a new subject
app.post('/api/subjects', async (req, res) => {
  try {
    const { subject } = req.body;
    if (!subject) {
      return res.status(400).json({ error: 'Subject name is required' });
    }
    const trimmedSubject = subject.trim();
    // Check if subject already exists
    const students = await Student.find();
    const allSubjects = students.flatMap(s => s.subjects.map(sub => sub.name));
    if (allSubjects.includes(trimmedSubject)) {
      return res.status(400).json({ error: 'Subject already exists' });
    }
    // Find the first student to add the subject to, or create a dummy student
    let student = await Student.findOne();
    if (!student) {
      // Create a dummy student if no students exist
      student = new Student({
        name: 'Dummy Student',
        rollNumber: 'DUMMY001',
        email: 'dummy@example.com',
        photo: '/uploads/default.jpg',
        subjects: [],
        qrCode: '',
        attendance: []
      });
      await student.save();
    }
    student.subjects.push({ name: trimmedSubject, date: new Date().toISOString().split('T')[0] });
    await student.save();
    console.log(`Added subject ${trimmedSubject} to student ${student.rollNumber}`);
    res.status(201).json({ message: 'Subject added successfully' });
  } catch (error) {
    console.error('Error adding subject:', error);
    res.status(500).json({ error: 'Failed to add subject' });
  }
});

// Delete a subject
app.delete('/api/subjects/:subject', async (req, res) => {
  try {
    const subject = req.params.subject;
    if (!subject) {
      return res.status(400).json({ error: 'Subject name is required' });
    }
    const trimmedSubject = subject.trim();
    // Remove the subject from all students
    const result = await Student.updateMany(
      { 'subjects.name': trimmedSubject },
      { $pull: { subjects: { name: trimmedSubject } } }
    );
    console.log(`Deleted subject ${trimmedSubject} from ${result.modifiedCount} students`);
    res.json({ message: 'Subject deleted successfully' });
  } catch (error) {
    console.error('Error deleting subject:', error);
    res.status(500).json({ error: 'Failed to delete subject' });
  }
});

// Update QR Code
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
    console.log('Attendance reset successfully for all students');
  } catch (error) {
    console.error('Error resetting attendance:', error);
  }
});

// Send email
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
    console.error('Full error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Mark attendance
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
    console.log(`📝 Appended to CSV at: ${csvPath}`);
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

app.listen(5000, '0.0.0.0', () => {
  console.log('Server running on port 5000');
});