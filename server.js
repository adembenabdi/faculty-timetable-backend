const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', require('./src/routes/auth.routes'));
app.use('/api/departments', require('./src/routes/department.routes'));
app.use('/api/grades', require('./src/routes/grade.routes'));
app.use('/api/sections', require('./src/routes/section.routes'));
app.use('/api/professors', require('./src/routes/professor.routes'));
app.use('/api/subjects', require('./src/routes/subject.routes'));
app.use('/api/salles', require('./src/routes/salle.routes'));
app.use('/api/timetable', require('./src/routes/timetable.routes'));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    status: 'error',
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
