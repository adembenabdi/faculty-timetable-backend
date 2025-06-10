const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

// Get user profile
router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT u.*, d.name as department_name, d.building, d.floor,
        CASE 
          WHEN u.role = 'professor' THEN p.phone
          WHEN u.role = 'chef_departement' THEN cd.phone
          WHEN u.role = 'admin' THEN a.phone
        END as phone,
        CASE 
          WHEN u.role = 'professor' THEN p.office
          WHEN u.role = 'chef_departement' THEN cd.office
          WHEN u.role = 'admin' THEN a.office
        END as office
       FROM users u
       LEFT JOIN departments d ON u.department_id = d.id
       LEFT JOIN professors p ON u.id = p.user_id
       LEFT JOIN chef_departements cd ON u.id = cd.user_id
       LEFT JOIN admins a ON u.id = a.user_id
       WHERE u.id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    delete user.password_hash;

    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update user profile
router.put('/', authenticateToken, async (req, res) => {
  try {
    const { firstName, lastName, phone, office } = req.body;
    
    // Update user basic info
    const userResult = await db.query(
      `UPDATE users
       SET first_name = $1, last_name = $2
       WHERE id = $3
       RETURNING id, email, first_name, last_name, role, department_id`,
      [firstName, lastName, req.user.id]
    );

    // Update role-specific info
    if (req.user.role === 'professor') {
      await db.query(
        `UPDATE professors
         SET phone = $1, office = $2
         WHERE user_id = $3`,
        [phone, office, req.user.id]
      );
    } else if (req.user.role === 'chef_departement') {
      await db.query(
        `UPDATE chef_departements
         SET phone = $1, office = $2
         WHERE user_id = $3`,
        [phone, office, req.user.id]
      );
    } else if (req.user.role === 'admin') {
      await db.query(
        `UPDATE admins
         SET phone = $1, office = $2
         WHERE user_id = $3`,
        [phone, office, req.user.id]
      );
    }

    res.json(userResult.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router; 