const express = require('express');
const { pool } = require('../db/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  const userId = req.user.id;
  const today = new Date().toISOString().slice(0, 10);
  try {
    const projects = await pool.query(`
      SELECT p.id, p.name,
        COUNT(DISTINCT t.id) as total_tasks,
        SUM(CASE WHEN t.status='done' THEN 1 ELSE 0 END) as done_tasks,
        COALESCE(pm.role, 'admin') as my_role
      FROM projects p
      LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $1
      LEFT JOIN tasks t ON t.project_id = p.id
      WHERE p.owner_id = $1 OR pm.user_id = $1
      GROUP BY p.id, pm.role
      ORDER BY p.created_at DESC
    `, [userId]);

    const myTasks = await pool.query(`
      SELECT t.*, p.name as project_name
      FROM tasks t JOIN projects p ON t.project_id = p.id
      WHERE t.assignee_id = $1
      ORDER BY t.due_date ASC NULLS LAST, t.created_at DESC LIMIT 20
    `, [userId]);

    const overdueTasks = await pool.query(`
      SELECT t.*, p.name as project_name, u.name as assignee_name
      FROM tasks t
      JOIN projects p ON t.project_id = p.id
      LEFT JOIN users u ON t.assignee_id = u.id
      LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $1
      WHERE (p.owner_id = $1 OR pm.user_id = $1)
        AND t.status != 'done'
        AND t.due_date < $2
      ORDER BY t.due_date ASC LIMIT 10
    `, [userId, today]);

    const tasks = myTasks.rows;
    const stats = {
      total_projects: projects.rows.length,
      total_tasks_assigned: tasks.length,
      tasks_todo: tasks.filter(t => t.status === 'todo').length,
      tasks_in_progress: tasks.filter(t => t.status === 'in_progress').length,
      tasks_done: tasks.filter(t => t.status === 'done').length,
      overdue_count: overdueTasks.rows.length,
    };

    res.json({ stats, projects: projects.rows, myTasks: tasks, overdueTasks: overdueTasks.rows });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
