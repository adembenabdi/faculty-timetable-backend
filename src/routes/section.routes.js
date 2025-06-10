const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticateToken, checkRole } = require('../middleware/auth');

// Get all sections for a grade
router.get('/grade/:gradeId', authenticateToken, async (req, res) => {
  try {
    const { gradeId } = req.params;
    const result = await db.query(
      `SELECT s.*, 
        (SELECT COUNT(*) FROM timetable_entries WHERE section_id = s.id) as timetable_entries_count
       FROM sections s
       WHERE s.grade_id = $1
       ORDER BY s.name`,
      [gradeId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get a single section with details
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Get section details
    const sectionResult = await db.query(
      `SELECT s.*, g.name as grade_name, d.name as department_name
       FROM sections s
       JOIN grades g ON s.grade_id = g.id
       JOIN departments d ON g.department_id = d.id
       WHERE s.id = $1`,
      [id]
    );

    if (sectionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Section not found' });
    }

    // Get section's timetable entries
    const timetableResult = await db.query(
      `SELECT te.*, 
        s.name as subject_name,
        p.first_name as professor_first_name,
        p.last_name as professor_last_name,
        r.name as room_name
       FROM timetable_entries te
       JOIN subjects s ON te.subject_id = s.id
       JOIN professors p ON te.professor_id = p.id
       JOIN rooms r ON te.room_id = r.id
       WHERE te.section_id = $1
       ORDER BY te.day_of_week, te.start_time`,
      [id]
    );

    res.json({
      ...sectionResult.rows[0],
      timetable_entries: timetableResult.rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a new section
router.post('/', authenticateToken, checkRole(['chef_departement', 'admin']), async (req, res) => {
  try {
    const { name, gradeId, capacity } = req.body;

    const result = await db.query(
      `INSERT INTO sections (name, grade_id, capacity)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [name, gradeId, capacity]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    if (err.code === '23505') { // Unique violation
      res.status(400).json({ error: 'Section with this name already exists in this grade' });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// Update a section
router.put('/:id', authenticateToken, checkRole(['chef_departement', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, capacity } = req.body;

    const result = await db.query(
      `UPDATE sections
       SET name = $1, capacity = $2
       WHERE id = $3
       RETURNING *`,
      [name, capacity, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Section not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    if (err.code === '23505') {
      res.status(400).json({ error: 'Section with this name already exists in this grade' });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// Delete a section
router.delete('/:id', authenticateToken, checkRole(['chef_departement', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;

    // Check if section has any timetable entries
    const checkResult = await db.query(
      'SELECT COUNT(*) FROM timetable_entries WHERE section_id = $1',
      [id]
    );

    if (checkResult.rows[0].count > 0) {
      return res.status(400).json({
        error: 'Cannot delete section with associated timetable entries'
      });
    }

    const result = await db.query('DELETE FROM sections WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Section not found' });
    }

    res.json({ message: 'Section deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get section statistics
router.get('/:id/stats', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const stats = await db.query(
      `SELECT
        (SELECT COUNT(*) FROM timetable_entries WHERE section_id = $1) as timetable_entries_count,
        (SELECT COUNT(DISTINCT subject_id) FROM timetable_entries WHERE section_id = $1) as subjects_count,
        (SELECT COUNT(DISTINCT professor_id) FROM timetable_entries WHERE section_id = $1) as professors_count`,
      [id]
    );

    res.json(stats.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router; 