const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticateToken, checkRole } = require('../middleware/auth');

// Get all grades for a department
router.get('/department/:departmentId', authenticateToken, async (req, res) => {
  try {
    const { departmentId } = req.params;
    const result = await db.query(
      `SELECT g.*, 
        (SELECT COUNT(*) FROM sections WHERE grade_id = g.id) as sections_count,
        (SELECT COUNT(*) FROM subjects WHERE grade_id = g.id) as subjects_count
       FROM grades g
       WHERE g.department_id = $1
       ORDER BY g.level`,
      [departmentId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get a single grade with details
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Get grade details
    const gradeResult = await db.query(
      `SELECT g.*, d.name as department_name
       FROM grades g
       JOIN departments d ON g.department_id = d.id
       WHERE g.id = $1`,
      [id]
    );

    if (gradeResult.rows.length === 0) {
      return res.status(404).json({ error: 'Grade not found' });
    }

    // Get grade sections
    const sectionsResult = await db.query(
      `SELECT s.*, 
        (SELECT COUNT(*) FROM timetable_entries WHERE section_id = s.id) as timetable_entries_count
       FROM sections s
       WHERE s.grade_id = $1
       ORDER BY s.name`,
      [id]
    );

    // Get grade subjects
    const subjectsResult = await db.query(
      `SELECT s.*, 
        (SELECT COUNT(*) FROM timetable_entries WHERE subject_id = s.id) as timetable_entries_count
       FROM subjects s
       WHERE s.grade_id = $1
       ORDER BY s.name`,
      [id]
    );

    res.json({
      ...gradeResult.rows[0],
      sections: sectionsResult.rows,
      subjects: subjectsResult.rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a new grade
router.post('/', authenticateToken, checkRole(['chef_departement', 'admin']), async (req, res) => {
  try {
    const { name, level, departmentId } = req.body;

    const result = await db.query(
      `INSERT INTO grades (name, level, department_id)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [name, level, departmentId]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    if (err.code === '23505') { // Unique violation
      res.status(400).json({ error: 'Grade with this name already exists in this department' });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// Update a grade
router.put('/:id', authenticateToken, checkRole(['chef_departement', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, level } = req.body;

    const result = await db.query(
      `UPDATE grades
       SET name = $1, level = $2
       WHERE id = $3
       RETURNING *`,
      [name, level, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Grade not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    if (err.code === '23505') {
      res.status(400).json({ error: 'Grade with this name already exists in this department' });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// Delete a grade
router.delete('/:id', authenticateToken, checkRole(['chef_departement', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;

    // Check if grade has any sections or subjects
    const checkResult = await db.query(
      `SELECT 
        (SELECT COUNT(*) FROM sections WHERE grade_id = $1) as sections_count,
        (SELECT COUNT(*) FROM subjects WHERE grade_id = $1) as subjects_count`,
      [id]
    );

    if (checkResult.rows[0].sections_count > 0 || checkResult.rows[0].subjects_count > 0) {
      return res.status(400).json({
        error: 'Cannot delete grade with associated sections or subjects'
      });
    }

    const result = await db.query('DELETE FROM grades WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Grade not found' });
    }

    res.json({ message: 'Grade deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get grade statistics
router.get('/:id/stats', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const stats = await db.query(
      `SELECT
        (SELECT COUNT(*) FROM sections WHERE grade_id = $1) as sections_count,
        (SELECT COUNT(*) FROM subjects WHERE grade_id = $1) as subjects_count,
        (SELECT COUNT(*) FROM timetable_entries te
         JOIN sections s ON te.section_id = s.id
         WHERE s.grade_id = $1) as timetable_entries_count`,
      [id]
    );

    res.json(stats.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router; 