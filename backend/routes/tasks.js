const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { getDb } = require('../db/database');
const { authenticate, requireProjectAdmin, requireProjectMember } = require('../middleware/auth');

const router = express.Router({ mergeParams: true });

// GET /api/projects/:projectId/tasks
router.get('/', authenticate, requireProjectMember, [
  query('status').optional().isIn(['todo', 'in_progress', 'done']),
  query('assignee_id').optional().isInt(),
  query('priority').optional().isIn(['low', 'medium', 'high']),
], (req, res) => {
  const db = getDb();
  let sql = `
    SELECT t.*,
      u.name as assignee_name, u.email as assignee_email,
      c.name as creator_name
    FROM tasks t
    LEFT JOIN users u ON t.assignee_id = u.id
    JOIN users c ON t.creator_id = c.id
    WHERE t.project_id = ?
  `;
  const params = [req.params.projectId];

  if (req.query.status) { sql += ' AND t.status = ?'; params.push(req.query.status); }
  if (req.query.assignee_id) { sql += ' AND t.assignee_id = ?'; params.push(req.query.assignee_id); }
  if (req.query.priority) { sql += ' AND t.priority = ?'; params.push(req.query.priority); }

  sql += ' ORDER BY t.created_at DESC';
  const tasks = db.prepare(sql).all(...params);
  res.json({ tasks });
});

// POST /api/projects/:projectId/tasks
router.post('/', authenticate, requireProjectMember, [
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('description').optional().trim(),
  body('assignee_id').optional().isInt(),
  body('status').optional().isIn(['todo', 'in_progress', 'done']),
  body('priority').optional().isIn(['low', 'medium', 'high']),
  body('due_date').optional().isDate().withMessage('due_date must be YYYY-MM-DD'),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { title, description, assignee_id, status = 'todo', priority = 'medium', due_date } = req.body;
  const db = getDb();

  // Validate assignee is project member
  if (assignee_id) {
    const isMember = db.prepare(`
      SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?
      UNION SELECT 1 FROM projects WHERE id = ? AND owner_id = ?
    `).get(req.params.projectId, assignee_id, req.params.projectId, assignee_id);
    if (!isMember) return res.status(400).json({ error: 'Assignee must be a project member' });
  }

  const result = db.prepare(`
    INSERT INTO tasks (title, description, project_id, assignee_id, creator_id, status, priority, due_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(title, description || null, req.params.projectId, assignee_id || null, req.user.id, status, priority, due_date || null);

  const task = db.prepare(`
    SELECT t.*, u.name as assignee_name, c.name as creator_name
    FROM tasks t
    LEFT JOIN users u ON t.assignee_id = u.id
    JOIN users c ON t.creator_id = c.id
    WHERE t.id = ?
  `).get(result.lastInsertRowid);

  res.status(201).json({ task });
});

// GET /api/projects/:projectId/tasks/:taskId
router.get('/:taskId', authenticate, requireProjectMember, (req, res) => {
  const db = getDb();
  const task = db.prepare(`
    SELECT t.*, u.name as assignee_name, u.email as assignee_email, c.name as creator_name
    FROM tasks t
    LEFT JOIN users u ON t.assignee_id = u.id
    JOIN users c ON t.creator_id = c.id
    WHERE t.id = ? AND t.project_id = ?
  `).get(req.params.taskId, req.params.projectId);

  if (!task) return res.status(404).json({ error: 'Task not found' });
  res.json({ task });
});

// PUT /api/projects/:projectId/tasks/:taskId
router.put('/:taskId', authenticate, requireProjectMember, [
  body('title').optional().trim().notEmpty(),
  body('description').optional().trim(),
  body('assignee_id').optional(),
  body('status').optional().isIn(['todo', 'in_progress', 'done']),
  body('priority').optional().isIn(['low', 'medium', 'high']),
  body('due_date').optional().isDate(),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND project_id = ?')
    .get(req.params.taskId, req.params.projectId);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  // Members can only update status of their own tasks; admins can update anything
  const isAdmin = req.projectRole === 'admin';
  const isCreator = task.creator_id === req.user.id;
  const isAssignee = task.assignee_id === req.user.id;

  if (!isAdmin && !isCreator && !isAssignee) {
    return res.status(403).json({ error: 'You can only update tasks you created or are assigned to' });
  }

  const { title, description, assignee_id, status, priority, due_date } = req.body;

  db.prepare(`
    UPDATE tasks SET
      title = COALESCE(?, title),
      description = COALESCE(?, description),
      assignee_id = CASE WHEN ? IS NOT NULL THEN ? ELSE assignee_id END,
      status = COALESCE(?, status),
      priority = COALESCE(?, priority),
      due_date = COALESCE(?, due_date),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    title || null, description || null,
    assignee_id !== undefined ? 1 : null, assignee_id || null,
    status || null, priority || null, due_date || null,
    req.params.taskId
  );

  const updated = db.prepare(`
    SELECT t.*, u.name as assignee_name, c.name as creator_name
    FROM tasks t LEFT JOIN users u ON t.assignee_id = u.id
    JOIN users c ON t.creator_id = c.id WHERE t.id = ?
  `).get(req.params.taskId);

  res.json({ task: updated });
});

// DELETE /api/projects/:projectId/tasks/:taskId
router.delete('/:taskId', authenticate, requireProjectMember, (req, res) => {
  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND project_id = ?')
    .get(req.params.taskId, req.params.projectId);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  if (req.projectRole !== 'admin' && task.creator_id !== req.user.id) {
    return res.status(403).json({ error: 'Only admins or task creators can delete tasks' });
  }

  db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.taskId);
  res.json({ message: 'Task deleted' });
});

module.exports = router;
