const express = require('express');
const { body, validationResult } = require('express-validator');
const { getDb } = require('../db/database');
const { authenticate, requireProjectAdmin, requireProjectMember } = require('../middleware/auth');

const router = express.Router();

// GET /api/projects - list all projects user is part of
router.get('/', authenticate, (req, res) => {
  const db = getDb();
  const projects = db.prepare(`
    SELECT p.*, u.name as owner_name,
      (SELECT COUNT(*) FROM tasks WHERE project_id = p.id) as task_count,
      (SELECT COUNT(*) FROM project_members WHERE project_id = p.id) + 1 as member_count,
      COALESCE(pm.role, 'admin') as my_role
    FROM projects p
    JOIN users u ON p.owner_id = u.id
    LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = ?
    WHERE p.owner_id = ? OR pm.user_id = ?
    ORDER BY p.created_at DESC
  `).all(req.user.id, req.user.id, req.user.id);
  res.json({ projects });
});

// POST /api/projects - create project
router.post('/', authenticate, [
  body('name').trim().notEmpty().withMessage('Project name is required'),
  body('description').optional().trim(),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { name, description } = req.body;
  const db = getDb();
  const result = db.prepare(
    'INSERT INTO projects (name, description, owner_id) VALUES (?, ?, ?)'
  ).run(name, description || null, req.user.id);

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ project });
});

// GET /api/projects/:projectId
router.get('/:projectId', authenticate, requireProjectMember, (req, res) => {
  const db = getDb();
  const project = db.prepare(`
    SELECT p.*, u.name as owner_name
    FROM projects p JOIN users u ON p.owner_id = u.id
    WHERE p.id = ?
  `).get(req.params.projectId);

  const members = db.prepare(`
    SELECT u.id, u.name, u.email, 
      CASE WHEN p.owner_id = u.id THEN 'admin' ELSE pm.role END as role
    FROM users u
    JOIN projects p ON p.id = ?
    LEFT JOIN project_members pm ON pm.user_id = u.id AND pm.project_id = ?
    WHERE p.owner_id = u.id OR pm.project_id = ?
  `).all(req.params.projectId, req.params.projectId, req.params.projectId);

  res.json({ project: { ...project, my_role: req.projectRole }, members });
});

// PUT /api/projects/:projectId
router.put('/:projectId', authenticate, requireProjectAdmin, [
  body('name').optional().trim().notEmpty(),
  body('description').optional().trim(),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { name, description } = req.body;
  const db = getDb();
  db.prepare(`
    UPDATE projects SET
      name = COALESCE(?, name),
      description = COALESCE(?, description)
    WHERE id = ?
  `).run(name || null, description !== undefined ? description : null, req.params.projectId);

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.projectId);
  res.json({ project });
});

// DELETE /api/projects/:projectId
router.delete('/:projectId', authenticate, requireProjectAdmin, (req, res) => {
  const db = getDb();
  // Only project owner can delete
  if (req.project.owner_id !== req.user.id) {
    return res.status(403).json({ error: 'Only the project owner can delete the project' });
  }
  db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.projectId);
  res.json({ message: 'Project deleted' });
});

// POST /api/projects/:projectId/members - add member
router.post('/:projectId/members', authenticate, requireProjectAdmin, [
  body('email').isEmail().normalizeEmail(),
  body('role').optional().isIn(['admin', 'member']),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { email, role = 'member' } = req.body;
  const db = getDb();

  const userToAdd = db.prepare('SELECT id, name, email FROM users WHERE email = ?').get(email);
  if (!userToAdd) return res.status(404).json({ error: 'User not found with that email' });

  if (userToAdd.id === req.project.owner_id) {
    return res.status(400).json({ error: 'User is already the project owner' });
  }

  try {
    db.prepare(
      'INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)'
    ).run(req.params.projectId, userToAdd.id, role);
    res.status(201).json({ message: 'Member added', user: { ...userToAdd, role } });
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      // Update role if already member
      db.prepare(
        'UPDATE project_members SET role = ? WHERE project_id = ? AND user_id = ?'
      ).run(role, req.params.projectId, userToAdd.id);
      res.json({ message: 'Member role updated', user: { ...userToAdd, role } });
    } else throw e;
  }
});

// DELETE /api/projects/:projectId/members/:userId
router.delete('/:projectId/members/:userId', authenticate, requireProjectAdmin, (req, res) => {
  const db = getDb();
  const { userId } = req.params;

  if (parseInt(userId) === req.project.owner_id) {
    return res.status(400).json({ error: 'Cannot remove the project owner' });
  }

  db.prepare('DELETE FROM project_members WHERE project_id = ? AND user_id = ?')
    .run(req.params.projectId, userId);
  res.json({ message: 'Member removed' });
});

module.exports = router;
