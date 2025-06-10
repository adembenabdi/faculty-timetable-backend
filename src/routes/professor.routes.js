const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticateToken, checkRole } = require('../middleware/auth');

// Get all professors
router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT p.*, 
        d.name as department_name,
        (SELECT COUNT(*) FROM timetable_entries WHERE professor_id = p.id) as timetable_entries_count
       FROM professors p
       JOIN departments d ON p.department_id = d.id
       ORDER BY p.last_name, p.first_name`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get a single professor with details
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Get professor details
    const professorResult = await db.query(
      `SELECT p.*, d.name as department_name
       FROM professors p
       JOIN departments d ON p.department_id = d.id
       WHERE p.id = $1`,
      [id]
    );

    if (professorResult.rows.length === 0) {
      return res.status(404).json({ error: 'Professor not found' });
    }

    // Get professor's timetable entries
    const timetableResult = await db.query(
      `SELECT te.*, 
        s.name as subject_name,
        sec.name as section_name,
        r.name as room_name
       FROM timetable_entries te
       JOIN subjects s ON te.subject_id = s.id
       JOIN sections sec ON te.section_id = sec.id
       JOIN rooms r ON te.room_id = r.id
       WHERE te.professor_id = $1
       ORDER BY te.day_of_week, te.start_time`,
      [id]
    );

    // Get professor's subjects
    const subjectsResult = await db.query(
      `SELECT DISTINCT s.*
       FROM subjects s
       JOIN timetable_entries te ON s.id = te.subject_id
       WHERE te.professor_id = $1
       ORDER BY s.name`,
      [id]
    );

    res.json({
      ...professorResult.rows[0],
      timetable_entries: timetableResult.rows,
      subjects: subjectsResult.rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a new professor
router.post('/', authenticateToken, checkRole(['chef_departement', 'admin']), async (req, res) => {
  try {
    const { firstName, lastName, email, phone, departmentId, specialization, maxHoursPerWeek } = req.body;

    const result = await db.query(
      `INSERT INTO professors 
       (first_name, last_name, email, phone, department_id, specialization, max_hours_per_week)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [firstName, lastName, email, phone, departmentId, specialization, maxHoursPerWeek]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    if (err.code === '23505') { // Unique violation
      res.status(400).json({ error: 'Professor with this email already exists' });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// Update a professor
router.put('/:id', authenticateToken, checkRole(['chef_departement', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { firstName, lastName, email, phone, departmentId, specialization, maxHoursPerWeek } = req.body;

    const result = await db.query(
      `UPDATE professors
       SET first_name = $1, last_name = $2, email = $3, phone = $4,
           department_id = $5, specialization = $6, max_hours_per_week = $7
       WHERE id = $8
       RETURNING *`,
      [firstName, lastName, email, phone, departmentId, specialization, maxHoursPerWeek, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Professor not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    if (err.code === '23505') {
      res.status(400).json({ error: 'Professor with this email already exists' });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// Delete a professor
router.delete('/:id', authenticateToken, checkRole(['chef_departement', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;

    // Check if professor has any timetable entries
    const checkResult = await db.query(
      'SELECT COUNT(*) FROM timetable_entries WHERE professor_id = $1',
      [id]
    );

    if (checkResult.rows[0].count > 0) {
      return res.status(400).json({
        error: 'Cannot delete professor with associated timetable entries'
      });
    }

    const result = await db.query('DELETE FROM professors WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Professor not found' });
    }

    res.json({ message: 'Professor deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get professor statistics
router.get('/:id/stats', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const stats = await db.query(
      `SELECT
        (SELECT COUNT(*) FROM timetable_entries WHERE professor_id = $1) as timetable_entries_count,
        (SELECT COUNT(DISTINCT subject_id) FROM timetable_entries WHERE professor_id = $1) as subjects_count,
        (SELECT COUNT(DISTINCT section_id) FROM timetable_entries WHERE professor_id = $1) as sections_count,
        (SELECT COUNT(DISTINCT room_id) FROM timetable_entries WHERE professor_id = $1) as rooms_count,
        (SELECT SUM(EXTRACT(EPOCH FROM (end_time - start_time))/3600)
         FROM timetable_entries
         WHERE professor_id = $1) as total_hours`,
      [id]
    );

    res.json(stats.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get professor availability
router.get('/:id/availability', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { dayOfWeek } = req.query;

    const result = await db.query(
      `SELECT start_time, end_time
       FROM timetable_entries
       WHERE professor_id = $1
       ${dayOfWeek ? 'AND day_of_week = $2' : ''}
       ORDER BY start_time`,
      dayOfWeek ? [id, dayOfWeek] : [id]
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router; 