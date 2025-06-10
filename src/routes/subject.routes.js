const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticateToken, checkRole } = require('../middleware/auth');

// Get all subjects for a grade
router.get('/grade/:gradeId', authenticateToken, async (req, res) => {
  try {
    const { gradeId } = req.params;
    const result = await db.query(
      `SELECT s.*, 
        (SELECT COUNT(*) FROM timetable_entries WHERE subject_id = s.id) as timetable_entries_count
       FROM subjects s
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

// Get a single subject with details
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Get subject details
    const subjectResult = await db.query(
      `SELECT s.*, g.name as grade_name, d.name as department_name
       FROM subjects s
       JOIN grades g ON s.grade_id = g.id
       JOIN departments d ON g.department_id = d.id
       WHERE s.id = $1`,
      [id]
    );

    if (subjectResult.rows.length === 0) {
      return res.status(404).json({ error: 'Subject not found' });
    }

    // Get subject's timetable entries
    const timetableResult = await db.query(
      `SELECT te.*, 
        sec.name as section_name,
        p.first_name as professor_first_name,
        p.last_name as professor_last_name,
        r.name as room_name
       FROM timetable_entries te
       JOIN sections sec ON te.section_id = sec.id
       JOIN professors p ON te.professor_id = p.id
       JOIN rooms r ON te.room_id = r.id
       WHERE te.subject_id = $1
       ORDER BY te.day_of_week, te.start_time`,
      [id]
    );

    res.json({
      ...subjectResult.rows[0],
      timetable_entries: timetableResult.rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a new subject
router.post('/', authenticateToken, checkRole(['chef_departement', 'admin']), async (req, res) => {
  try {
    const { name, code, gradeId, credits, hoursPerWeek } = req.body;

    const result = await db.query(
      `INSERT INTO subjects (name, code, grade_id, credits, hours_per_week)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [name, code, gradeId, credits, hoursPerWeek]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    if (err.code === '23505') { // Unique violation
      res.status(400).json({ error: 'Subject with this name or code already exists in this grade' });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// Update a subject
router.put('/:id', authenticateToken, checkRole(['chef_departement', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, code, credits, hoursPerWeek } = req.body;

    const result = await db.query(
      `UPDATE subjects
       SET name = $1, code = $2, credits = $3, hours_per_week = $4
       WHERE id = $5
       RETURNING *`,
      [name, code, credits, hoursPerWeek, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Subject not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    if (err.code === '23505') {
      res.status(400).json({ error: 'Subject with this name or code already exists in this grade' });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// Delete a subject
router.delete('/:id', authenticateToken, checkRole(['chef_departement', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;

    // Check if subject has any timetable entries
    const checkResult = await db.query(
      'SELECT COUNT(*) FROM timetable_entries WHERE subject_id = $1',
      [id]
    );

    if (checkResult.rows[0].count > 0) {
      return res.status(400).json({
        error: 'Cannot delete subject with associated timetable entries'
      });
    }

    const result = await db.query('DELETE FROM subjects WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Subject not found' });
    }

    res.json({ message: 'Subject deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get subject statistics
router.get('/:id/stats', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const stats = await db.query(
      `SELECT
        (SELECT COUNT(*) FROM timetable_entries WHERE subject_id = $1) as timetable_entries_count,
        (SELECT COUNT(DISTINCT section_id) FROM timetable_entries WHERE subject_id = $1) as sections_count,
        (SELECT COUNT(DISTINCT professor_id) FROM timetable_entries WHERE subject_id = $1) as professors_count`,
      [id]
    );

    res.json(stats.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router; 