const jwt = require('jsonwebtoken');
const { pool } = require('../db/database');

const JWT_SECRET = process.env.JWT_SECRET;

async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const result = await pool.query('SELECT id, name, email FROM users WHERE id = $1', [payload.userId]);
    if (!result.rows[0]) return res.status(401).json({ error: 'User not found' });
    req.user = result.rows[0];
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

async function requireProjectAdmin(req, res, next) {
  const projectId = req.params.projectId || req.body.project_id;
  if (!projectId) return res.status(400).json({ error: 'Project ID required' });
  try {
    const proj = await pool.query('SELECT * FROM projects WHERE id = $1', [projectId]);
    if (!proj.rows[0]) return res.status(404).json({ error: 'Project not found' });
    const project = proj.rows[0];

    if (project.owner_id === req.user.id) {
      req.project = project; req.projectRole = 'admin'; return next();
    }
    const mem = await pool.query(
      'SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2',
      [projectId, req.user.id]
    );
    if (!mem.rows[0] || mem.rows[0].role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    req.project = project; req.projectRole = 'admin'; next();
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
}

async function requireProjectMember(req, res, next) {
  const projectId = req.params.projectId || req.body.project_id;
  if (!projectId) return res.status(400).json({ error: 'Project ID required' });
  try {
    const proj = await pool.query('SELECT * FROM projects WHERE id = $1', [projectId]);
    if (!proj.rows[0]) return res.status(404).json({ error: 'Project not found' });
    const project = proj.rows[0];

    if (project.owner_id === req.user.id) {
      req.project = project; req.projectRole = 'admin'; return next();
    }
    const mem = await pool.query(
      'SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2',
      [projectId, req.user.id]
    );
    if (!mem.rows[0]) return res.status(403).json({ error: 'Not a project member' });
    req.project = project; req.projectRole = mem.rows[0].role; next();
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
}

module.exports = { authenticate, requireProjectAdmin, requireProjectMember, JWT_SECRET };
