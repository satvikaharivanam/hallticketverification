// server.js
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path'); // Add path module
const Student = require('./models/Student');

const app = express();

app.use(cors()); // Enable CORS for all requests
app.use(bodyParser.json());
// Serve static files from the 'uploads' directory at /uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

mongoose.connect('mongodb://localhost:27017/studentdatabase', {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

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

app.listen(5000, () => {
  console.log('Server is running on http://localhost:5000');
});