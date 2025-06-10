const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticateToken, checkRole } = require('../middleware/auth');

// Get timetable entries for a section
router.get('/section/:sectionId', authenticateToken, async (req, res) => {
  try {
    const { sectionId } = req.params;
    const result = await db.query(
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
      [sectionId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get timetable entries for a professor
router.get('/professor/:professorId', authenticateToken, async (req, res) => {
  try {
    const { professorId } = req.params;
    const result = await db.query(
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
      [professorId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get timetable entries for a room
router.get('/room/:roomId', authenticateToken, async (req, res) => {
  try {
    const { roomId } = req.params;
    const result = await db.query(
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
      [roomId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a new timetable entry
router.post('/', authenticateToken, checkRole(['chef_departement', 'admin']), async (req, res) => {
  try {
    const { subjectId, sectionId, professorId, roomId, dayOfWeek, startTime, endTime } = req.body;

    // Check for conflicts
    const conflictCheck = await db.query(
      `SELECT COUNT(*) FROM timetable_entries
       WHERE (
         (section_id = $1 OR professor_id = $2 OR room_id = $3)
         AND day_of_week = $4
         AND (
           (start_time <= $5 AND end_time > $5)
           OR (start_time < $6 AND end_time >= $6)
           OR (start_time >= $5 AND end_time <= $6)
         )
       )`,
      [sectionId, professorId, roomId, dayOfWeek, startTime, endTime]
    );

    if (conflictCheck.rows[0].count > 0) {
      return res.status(400).json({
        error: 'Time slot conflicts with existing timetable entries'
      });
    }

    const result = await db.query(
      `INSERT INTO timetable_entries 
       (subject_id, section_id, professor_id, room_id, day_of_week, start_time, end_time)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [subjectId, sectionId, professorId, roomId, dayOfWeek, startTime, endTime]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update a timetable entry
router.put('/:id', authenticateToken, checkRole(['chef_departement', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { subjectId, sectionId, professorId, roomId, dayOfWeek, startTime, endTime } = req.body;

    // Check for conflicts (excluding the current entry)
    const conflictCheck = await db.query(
      `SELECT COUNT(*) FROM timetable_entries
       WHERE id != $1
       AND (
         (section_id = $2 OR professor_id = $3 OR room_id = $4)
         AND day_of_week = $5
         AND (
           (start_time <= $6 AND end_time > $6)
           OR (start_time < $7 AND end_time >= $7)
           OR (start_time >= $6 AND end_time <= $7)
         )
       )`,
      [id, sectionId, professorId, roomId, dayOfWeek, startTime, endTime]
    );

    if (conflictCheck.rows[0].count > 0) {
      return res.status(400).json({
        error: 'Time slot conflicts with existing timetable entries'
      });
    }

    const result = await db.query(
      `UPDATE timetable_entries
       SET subject_id = $1, section_id = $2, professor_id = $3, room_id = $4,
           day_of_week = $5, start_time = $6, end_time = $7
       WHERE id = $8
       RETURNING *`,
      [subjectId, sectionId, professorId, roomId, dayOfWeek, startTime, endTime, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Timetable entry not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete a timetable entry
router.delete('/:id', authenticateToken, checkRole(['chef_departement', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query('DELETE FROM timetable_entries WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Timetable entry not found' });
    }

    res.json({ message: 'Timetable entry deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get timetable statistics
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const stats = await db.query(
      `SELECT
        (SELECT COUNT(*) FROM timetable_entries) as total_entries,
        (SELECT COUNT(DISTINCT section_id) FROM timetable_entries) as sections_count,
        (SELECT COUNT(DISTINCT professor_id) FROM timetable_entries) as professors_count,
        (SELECT COUNT(DISTINCT room_id) FROM timetable_entries) as rooms_count,
        (SELECT COUNT(DISTINCT subject_id) FROM timetable_entries) as subjects_count`
    );

    res.json(stats.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router; 