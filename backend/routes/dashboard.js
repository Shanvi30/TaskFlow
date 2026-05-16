const express = require('express');
const { getDb } = require('../db/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// GET /api/dashboard - user's overview stats
router.get('/', authenticate, (req, res) => {
  const db = getDb();
  const userId = req.user.id;
  const today = new Date().toISOString().slice(0, 10);

  // My projects (owned + member)
  const projects = db.prepare(`
    SELECT p.id, p.name,
      COUNT(DISTINCT t.id) as total_tasks,
      SUM(CASE WHEN t.status='done' THEN 1 ELSE 0 END) as done_tasks,
      COALESCE(pm.role, 'admin') as my_role
    FROM projects p
    LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = ?
    LEFT JOIN tasks t ON t.project_id = p.id
    WHERE p.owner_id = ? OR pm.user_id = ?
    GROUP BY p.id
    ORDER BY p.created_at DESC
  `).all(userId, userId, userId);

  // My assigned tasks
  const myTasks = db.prepare(`
    SELECT t.*, p.name as project_name
    FROM tasks t JOIN projects p ON t.project_id = p.id
    WHERE t.assignee_id = ?
    ORDER BY t.due_date ASC, t.created_at DESC
    LIMIT 20
  `).all(userId);

  // Overdue tasks (across all my projects)
  const overdueTasks = db.prepare(`
    SELECT t.*, p.name as project_name, u.name as assignee_name
    FROM tasks t
    JOIN projects p ON t.project_id = p.id
    LEFT JOIN users u ON t.assignee_id = u.id
    LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = ?
    WHERE (p.owner_id = ? OR pm.user_id = ?)
      AND t.status != 'done'
      AND t.due_date < ?
    ORDER BY t.due_date ASC
    LIMIT 10
  `).all(userId, userId, userId, today);

  // Summary stats
  const stats = {
    total_projects: projects.length,
    total_tasks_assigned: myTasks.length,
    tasks_todo: myTasks.filter(t => t.status === 'todo').length,
    tasks_in_progress: myTasks.filter(t => t.status === 'in_progress').length,
    tasks_done: myTasks.filter(t => t.status === 'done').length,
    overdue_count: overdueTasks.length,
  };

  res.json({ stats, projects, myTasks, overdueTasks });
});

module.exports = router;
