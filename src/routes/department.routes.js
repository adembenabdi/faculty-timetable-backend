const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticateToken, checkRole } = require('../middleware/auth');

// Get all departments
router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT d.*, 
        (SELECT COUNT(*) FROM users WHERE department_id = d.id) as staff_count,
        (SELECT COUNT(*) FROM grades WHERE department_id = d.id) as grades_count
       FROM departments d
       ORDER BY d.name`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get a single department with details
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Get department details
    const deptResult = await db.query(
      `SELECT d.*, 
        (SELECT COUNT(*) FROM users WHERE department_id = d.id) as staff_count,
        (SELECT COUNT(*) FROM grades WHERE department_id = d.id) as grades_count
       FROM departments d
       WHERE d.id = $1`,
      [id]
    );

    if (deptResult.rows.length === 0) {
      return res.status(404).json({ error: 'Department not found' });
    }

    // Get department staff
    const staffResult = await db.query(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.role, p.title, p.phone
       FROM users u
       LEFT JOIN professors p ON u.id = p.user_id
       WHERE u.department_id = $1
       ORDER BY u.role, u.last_name`,
      [id]
    );

    // Get department grades
    const gradesResult = await db.query(
      `SELECT g.*, 
        (SELECT COUNT(*) FROM sections WHERE grade_id = g.id) as sections_count
       FROM grades g
       WHERE g.department_id = $1
       ORDER BY g.level`,
      [id]
    );

    res.json({
      ...deptResult.rows[0],
      staff: staffResult.rows,
      grades: gradesResult.rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a new department
router.post('/', authenticateToken, checkRole(['admin']), async (req, res) => {
  try {
    const { name, code, description } = req.body;

    const result = await db.query(
      `INSERT INTO departments (name, code, description)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [name, code, description]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    if (err.code === '23505') { // Unique violation
      res.status(400).json({ error: 'Department with this name or code already exists' });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// Update a department
router.put('/:id', authenticateToken, checkRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, code, description } = req.body;

    const result = await db.query(
      `UPDATE departments
       SET name = $1, code = $2, description = $3
       WHERE id = $4
       RETURNING *`,
      [name, code, description, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Department not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    if (err.code === '23505') {
      res.status(400).json({ error: 'Department with this name or code already exists' });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// Delete a department
router.delete('/:id', authenticateToken, checkRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;

    // Check if department has any users or grades
    const checkResult = await db.query(
      `SELECT 
        (SELECT COUNT(*) FROM users WHERE department_id = $1) as users_count,
        (SELECT COUNT(*) FROM grades WHERE department_id = $1) as grades_count`,
      [id]
    );

    if (checkResult.rows[0].users_count > 0 || checkResult.rows[0].grades_count > 0) {
      return res.status(400).json({
        error: 'Cannot delete department with associated users or grades'
      });
    }

    const result = await db.query('DELETE FROM departments WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Department not found' });
    }

    res.json({ message: 'Department deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get department statistics
router.get('/:id/stats', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const stats = await db.query(
      `SELECT
        (SELECT COUNT(*) FROM users WHERE department_id = $1) as total_staff,
        (SELECT COUNT(*) FROM users WHERE department_id = $1 AND role = 'professor') as professors_count,
        (SELECT COUNT(*) FROM grades WHERE department_id = $1) as grades_count,
        (SELECT COUNT(*) FROM sections s
         JOIN grades g ON s.grade_id = g.id
         WHERE g.department_id = $1) as sections_count,
        (SELECT COUNT(*) FROM subjects WHERE department_id = $1) as subjects_count`,
      [id]
    );

    res.json(stats.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router; 