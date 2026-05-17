const express = require('express');
const { body, validationResult } = require('express-validator');
const { pool } = require('../db/database');
const { authenticate, requireProjectAdmin, requireProjectMember } = require('../middleware/auth');

const router = express.Router();

// GET /api/projects
router.get('/', authenticate, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.*, u.name as owner_name,
        (SELECT COUNT(*) FROM tasks WHERE project_id = p.id) as task_count,
        (SELECT COUNT(*) FROM project_members WHERE project_id = p.id) + 1 as member_count,
        COALESCE(pm.role, 'admin') as my_role
      FROM projects p
      JOIN users u ON p.owner_id = u.id
      LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $1
      WHERE p.owner_id = $1 OR pm.user_id = $1
      ORDER BY p.created_at DESC
    `, [req.user.id]);
    res.json({ projects: result.rows });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// POST /api/projects
router.post('/', authenticate, [
  body('name').trim().notEmpty().withMessage('Project name is required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  const { name, description } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO projects (name, description, owner_id) VALUES ($1, $2, $3) RETURNING *',
      [name, description || null, req.user.id]
    );
    res.status(201).json({ project: result.rows[0] });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// GET /api/projects/:projectId
router.get('/:projectId', authenticate, requireProjectMember, async (req, res) => {
  try {
    const project = await pool.query(
      'SELECT p.*, u.name as owner_name FROM projects p JOIN users u ON p.owner_id = u.id WHERE p.id = $1',
      [req.params.projectId]
    );
    const members = await pool.query(`
      SELECT u.id, u.name, u.email,
        CASE WHEN p.owner_id = u.id THEN 'admin' ELSE pm.role END as role
      FROM users u
      JOIN projects p ON p.id = $1
      LEFT JOIN project_members pm ON pm.user_id = u.id AND pm.project_id = $1
      WHERE p.owner_id = u.id OR pm.project_id = $1
    `, [req.params.projectId]);
    res.json({ project: { ...project.rows[0], my_role: req.projectRole }, members: members.rows });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// PUT /api/projects/:projectId
router.put('/:projectId', authenticate, requireProjectAdmin, async (req, res) => {
  const { name, description } = req.body;
  try {
    const result = await pool.query(
      'UPDATE projects SET name = COALESCE($1, name), description = COALESCE($2, description) WHERE id = $3 RETURNING *',
      [name || null, description !== undefined ? description : null, req.params.projectId]
    );
    res.json({ project: result.rows[0] });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// DELETE /api/projects/:projectId
router.delete('/:projectId', authenticate, requireProjectAdmin, async (req, res) => {
  if (req.project.owner_id !== req.user.id) {
    return res.status(403).json({ error: 'Only the project owner can delete' });
  }
  try {
    await pool.query('DELETE FROM projects WHERE id = $1', [req.params.projectId]);
    res.json({ message: 'Project deleted' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// POST /api/projects/:projectId/members
router.post('/:projectId/members', authenticate, requireProjectAdmin, [
  body('email').isEmail().normalizeEmail(),
  body('role').optional().isIn(['admin', 'member']),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  const { email, role = 'member' } = req.body;
  try {
    const userResult = await pool.query('SELECT id, name, email FROM users WHERE email = $1', [email]);
    if (!userResult.rows[0]) return res.status(404).json({ error: 'User not found with that email' });
    const userToAdd = userResult.rows[0];
    if (userToAdd.id === req.project.owner_id) {
      return res.status(400).json({ error: 'User is already the project owner' });
    }
    await pool.query(
      'INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT (project_id, user_id) DO UPDATE SET role = $3',
      [req.params.projectId, userToAdd.id, role]
    );
    res.status(201).json({ message: 'Member added', user: { ...userToAdd, role } });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// DELETE /api/projects/:projectId/members/:userId
router.delete('/:projectId/members/:userId', authenticate, requireProjectAdmin, async (req, res) => {
  if (parseInt(req.params.userId) === req.project.owner_id) {
    return res.status(400).json({ error: 'Cannot remove the project owner' });
  }
  try {
    await pool.query('DELETE FROM project_members WHERE project_id = $1 AND user_id = $2',
      [req.params.projectId, req.params.userId]);
    res.json({ message: 'Member removed' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
