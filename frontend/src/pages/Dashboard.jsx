import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';

function statusLabel(s) { return { todo: 'To Do', in_progress: 'In Progress', done: 'Done' }[s] || s; }
function priorityLabel(p) { return { low: 'Low', medium: 'Medium', high: 'High' }[p] || p; }
function isOverdue(due) { return due && new Date(due) < new Date() && true; }

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/dashboard')
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading"><div className="spinner" />Loading dashboard...</div>;
  if (!data) return null;

  const { stats, projects, myTasks, overdueTasks } = data;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Good to see you, {user.name.split(' ')[0]} 👋</div>
          <div className="page-subtitle">Here's what's happening across your projects.</div>
        </div>
        <Link to="/projects" className="btn btn-primary">+ New Project</Link>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value stat-accent">{stats.total_projects}</div>
          <div className="stat-label">Projects</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.tasks_todo}</div>
          <div className="stat-label">To Do</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--blue)' }}>{stats.tasks_in_progress}</div>
          <div className="stat-label">In Progress</div>
        </div>
        <div className="stat-card">
          <div className="stat-value stat-green">{stats.tasks_done}</div>
          <div className="stat-label">Done</div>
        </div>
        <div className="stat-card">
          <div className={`stat-value ${stats.overdue_count > 0 ? 'stat-red' : 'stat-green'}`}>
            {stats.overdue_count}
          </div>
          <div className="stat-label">Overdue</div>
        </div>
      </div>

      <div className="grid-2">
        {/* My Tasks */}
        <div>
          <div className="section-title">My Assigned Tasks</div>
          {myTasks.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '32px', color: 'var(--text2)' }}>
              No tasks assigned to you yet.
            </div>
          ) : myTasks.slice(0, 6).map(task => (
            <div key={task.id} className="task-card" style={{ marginBottom: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="task-title truncate">{task.title}</div>
                <div className="task-meta">
                  <span className={`badge badge-${task.status}`}>{statusLabel(task.status)}</span>
                  <span className={`badge badge-${task.priority}`}>{priorityLabel(task.priority)}</span>
                  <span className="task-meta-item">◈ {task.project_name}</span>
                  {task.due_date && (
                    <span className={`task-meta-item ${isOverdue(task.due_date) && task.status !== 'done' ? 'overdue' : ''}`}>
                      📅 {task.due_date}
                    </span>
                  )}
                </div>
              </div>
              <Link to={`/projects/${task.project_id}`} className="btn btn-ghost btn-sm">→</Link>
            </div>
          ))}
        </div>

        {/* Projects overview */}
        <div>
          <div className="section-title">Projects Overview</div>
          {projects.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '32px', color: 'var(--text2)' }}>
              No projects yet. <Link to="/projects" style={{ color: 'var(--accent)' }}>Create one!</Link>
            </div>
          ) : projects.slice(0, 5).map(p => {
            const pct = p.total_tasks > 0 ? Math.round((p.done_tasks / p.total_tasks) * 100) : 0;
            return (
              <Link key={p.id} to={`/projects/${p.id}`} style={{ textDecoration: 'none', display: 'block' }}>
                <div className="card card-hover" style={{ marginBottom: 8, cursor: 'pointer' }}>
                  <div className="flex justify-between items-center mb-3">
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</div>
                    <span className={`badge badge-${p.my_role}`}>{p.my_role}</span>
                  </div>
                  <div className="flex justify-between" style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8 }}>
                    <span>{p.total_tasks} tasks</span>
                    <span>{pct}% done</span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Overdue tasks */}
      {overdueTasks.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <div className="section-title" style={{ color: 'var(--red)' }}>⚠ Overdue Tasks</div>
          {overdueTasks.map(task => (
            <div key={task.id} className="task-card" style={{ borderColor: 'rgba(239,68,68,0.3)', marginBottom: 8 }}>
              <div style={{ flex: 1 }}>
                <div className="task-title">{task.title}</div>
                <div className="task-meta">
                  <span className="task-meta-item overdue">📅 Due {task.due_date}</span>
                  <span className="task-meta-item">◈ {task.project_name}</span>
                  {task.assignee_name && <span className="task-meta-item">👤 {task.assignee_name}</span>}
                </div>
              </div>
              <Link to={`/projects/${task.project_id}`} className="btn btn-ghost btn-sm">→</Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
