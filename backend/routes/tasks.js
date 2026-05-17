const express = require('express');
const { body, validationResult } = require('express-validator');
const { pool } = require('../db/database');
const { authenticate, requireProjectAdmin, requireProjectMember } = require('../middleware/auth');

const router = express.Router({ mergeParams: true });

// GET /api/projects/:projectId/tasks
router.get('/', authenticate, requireProjectMember, async (req, res) => {
  try {
    let sql = `
      SELECT t.*, u.name as assignee_name, u.email as assignee_email, c.name as creator_name
      FROM tasks t
      LEFT JOIN users u ON t.assignee_id = u.id
      JOIN users c ON t.creator_id = c.id
      WHERE t.project_id = $1
    `;
    const params = [req.params.projectId];
    let idx = 2;
    if (req.query.status) { sql += ` AND t.status = $${idx++}`; params.push(req.query.status); }
    if (req.query.priority) { sql += ` AND t.priority = $${idx++}`; params.push(req.query.priority); }
    if (req.query.assignee_id) { sql += ` AND t.assignee_id = $${idx++}`; params.push(req.query.assignee_id); }
    sql += ' ORDER BY t.created_at DESC';
    const result = await pool.query(sql, params);
    res.json({ tasks: result.rows });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// POST /api/projects/:projectId/tasks
router.post('/', authenticate, requireProjectMember, [
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('status').optional().isIn(['todo', 'in_progress', 'done']),
  body('priority').optional().isIn(['low', 'medium', 'high']),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  const { title, description, assignee_id, status = 'todo', priority = 'medium', due_date } = req.body;
  try {
    const result = await pool.query(`
      INSERT INTO tasks (title, description, project_id, assignee_id, creator_id, status, priority, due_date)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *
    `, [title, description || null, req.params.projectId, assignee_id || null, req.user.id, status, priority, due_date || null]);

    const task = await pool.query(`
      SELECT t.*, u.name as assignee_name, c.name as creator_name
      FROM tasks t LEFT JOIN users u ON t.assignee_id = u.id
      JOIN users c ON t.creator_id = c.id WHERE t.id = $1
    `, [result.rows[0].id]);
    res.status(201).json({ task: task.rows[0] });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// GET /api/projects/:projectId/tasks/:taskId
router.get('/:taskId', authenticate, requireProjectMember, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT t.*, u.name as assignee_name, c.name as creator_name
      FROM tasks t LEFT JOIN users u ON t.assignee_id = u.id
      JOIN users c ON t.creator_id = c.id
      WHERE t.id = $1 AND t.project_id = $2
    `, [req.params.taskId, req.params.projectId]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Task not found' });
    res.json({ task: result.rows[0] });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// PUT /api/projects/:projectId/tasks/:taskId
router.put('/:taskId', authenticate, requireProjectMember, async (req, res) => {
  try {
    const taskResult = await pool.query('SELECT * FROM tasks WHERE id = $1 AND project_id = $2',
      [req.params.taskId, req.params.projectId]);
    if (!taskResult.rows[0]) return res.status(404).json({ error: 'Task not found' });
    const task = taskResult.rows[0];

    const isAdmin = req.projectRole === 'admin';
    const isCreator = task.creator_id === req.user.id;
    const isAssignee = task.assignee_id === req.user.id;
    if (!isAdmin && !isCreator && !isAssignee) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const { title, description, assignee_id, status, priority, due_date } = req.body;
    const result = await pool.query(`
      UPDATE tasks SET
        title = COALESCE($1, title),
        description = COALESCE($2, description),
        assignee_id = CASE WHEN $3::boolean THEN $4::integer ELSE assignee_id END,
        status = COALESCE($5, status),
        priority = COALESCE($6, priority),
        due_date = COALESCE($7, due_date),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $8 RETURNING *
    `, [
      title || null, description || null,
      assignee_id !== undefined, assignee_id || null,
      status || null, priority || null, due_date || null,
      req.params.taskId
    ]);

    const updated = await pool.query(`
      SELECT t.*, u.name as assignee_name, c.name as creator_name
      FROM tasks t LEFT JOIN users u ON t.assignee_id = u.id
      JOIN users c ON t.creator_id = c.id WHERE t.id = $1
    `, [req.params.taskId]);
    res.json({ task: updated.rows[0] });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// DELETE /api/projects/:projectId/tasks/:taskId
router.delete('/:taskId', authenticate, requireProjectMember, async (req, res) => {
  try {
    const taskResult = await pool.query('SELECT * FROM tasks WHERE id = $1 AND project_id = $2',
      [req.params.taskId, req.params.projectId]);
    if (!taskResult.rows[0]) return res.status(404).json({ error: 'Task not found' });
    const task = taskResult.rows[0];
    if (req.projectRole !== 'admin' && task.creator_id !== req.user.id) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    await pool.query('DELETE FROM tasks WHERE id = $1', [req.params.taskId]);
    res.json({ message: 'Task deleted' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
