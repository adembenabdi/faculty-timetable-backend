const app = require('./app');
const db = require('./config/db');

const PORT = process.env.PORT || 5000;

// Test database connection
db.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Error connecting to the database:', err);
    process.exit(1);
  }
  console.log('Database connected successfully');
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
}); 