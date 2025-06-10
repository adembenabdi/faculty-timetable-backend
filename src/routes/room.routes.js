const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticateToken, checkRole } = require('../middleware/auth');

// Get all rooms
router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT r.*, 
        (SELECT COUNT(*) FROM timetable_entries WHERE room_id = r.id) as timetable_entries_count
       FROM rooms r
       ORDER BY r.name`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get a single room with details
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Get room details
    const roomResult = await db.query(
      'SELECT * FROM rooms WHERE id = $1',
      [id]
    );

    if (roomResult.rows.length === 0) {
      return res.status(404).json({ error: 'Room not found' });
    }

    // Get room's timetable entries
    const timetableResult = await db.query(
      `SELECT te.*, 
        s.name as subject_name,
        sec.name as section_name,
        p.first_name as professor_first_name,
        p.last_name as professor_last_name
       FROM timetable_entries te
       JOIN subjects s ON te.subject_id = s.id
       JOIN sections sec ON te.section_id = sec.id
       JOIN professors p ON te.professor_id = p.id
       WHERE te.room_id = $1
       ORDER BY te.day_of_week, te.start_time`,
      [id]
    );

    res.json({
      ...roomResult.rows[0],
      timetable_entries: timetableResult.rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a new room
router.post('/', authenticateToken, checkRole(['chef_departement', 'admin']), async (req, res) => {
  try {
    const { name, capacity, type, building, floor } = req.body;

    const result = await db.query(
      `INSERT INTO rooms (name, capacity, type, building, floor)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [name, capacity, type, building, floor]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    if (err.code === '23505') { // Unique violation
      res.status(400).json({ error: 'Room with this name already exists' });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// Update a room
router.put('/:id', authenticateToken, checkRole(['chef_departement', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, capacity, type, building, floor } = req.body;

    const result = await db.query(
      `UPDATE rooms
       SET name = $1, capacity = $2, type = $3, building = $4, floor = $5
       WHERE id = $6
       RETURNING *`,
      [name, capacity, type, building, floor, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Room not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    if (err.code === '23505') {
      res.status(400).json({ error: 'Room with this name already exists' });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// Delete a room
router.delete('/:id', authenticateToken, checkRole(['chef_departement', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;

    // Check if room has any timetable entries
    const checkResult = await db.query(
      'SELECT COUNT(*) FROM timetable_entries WHERE room_id = $1',
      [id]
    );

    if (checkResult.rows[0].count > 0) {
      return res.status(400).json({
        error: 'Cannot delete room with associated timetable entries'
      });
    }

    const result = await db.query('DELETE FROM rooms WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Room not found' });
    }

    res.json({ message: 'Room deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get room statistics
router.get('/:id/stats', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const stats = await db.query(
      `SELECT
        (SELECT COUNT(*) FROM timetable_entries WHERE room_id = $1) as timetable_entries_count,
        (SELECT COUNT(DISTINCT subject_id) FROM timetable_entries WHERE room_id = $1) as subjects_count,
        (SELECT COUNT(DISTINCT section_id) FROM timetable_entries WHERE room_id = $1) as sections_count,
        (SELECT COUNT(DISTINCT professor_id) FROM timetable_entries WHERE room_id = $1) as professors_count`,
      [id]
    );

    res.json(stats.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get room availability
router.get('/:id/availability', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { dayOfWeek } = req.query;

    const result = await db.query(
      `SELECT start_time, end_time
       FROM timetable_entries
       WHERE room_id = $1
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