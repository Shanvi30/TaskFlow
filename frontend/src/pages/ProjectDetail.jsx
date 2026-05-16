import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';

const STATUS_OPTIONS = ['todo', 'in_progress', 'done'];
const PRIORITY_OPTIONS = ['low', 'medium', 'high'];
const STATUS_LABELS = { todo: 'To Do', in_progress: 'In Progress', done: 'Done' };
const PRIORITY_LABELS = { low: 'Low', medium: 'Medium', high: 'High' };

function TaskModal({ projectId, members, task, onClose, onSave }) {
  const [form, setForm] = useState({
    title: task?.title || '',
    description: task?.description || '',
    assignee_id: task?.assignee_id || '',
    status: task?.status || 'todo',
    priority: task?.priority || 'medium',
    due_date: task?.due_date || '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = { ...form, assignee_id: form.assignee_id || undefined };
      let result;
      if (task) {
        result = await api.put(`/projects/${projectId}/tasks/${task.id}`, payload);
      } else {
        result = await api.post(`/projects/${projectId}/tasks`, payload);
      }
      onSave(result.task);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-lg">
        <div className="modal-title">{task ? 'Edit Task' : 'Create Task'}</div>
        {error && <div className="error-msg">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Title *</label>
            <input className="form-input" required placeholder="Task title"
              value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea className="form-input" rows={3} placeholder="Describe the task..."
              value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Status</label>
              <select className="form-input" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Priority</label>
              <select className="form-input" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
                {PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
              </select>
            </div>
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Assignee</label>
              <select className="form-input" value={form.assignee_id} onChange={e => setForm(f => ({ ...f, assignee_id: e.target.value }))}>
                <option value="">Unassigned</option>
                {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Due Date</label>
              <input className="form-input" type="date"
                value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Saving...' : task ? 'Save Changes' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AddMemberModal({ projectId, onClose, onAdd }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('member');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await api.post(`/projects/${projectId}/members`, { email, role });
      onAdd(data.user);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">Add Team Member</div>
        {error && <div className="error-msg">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Email Address *</label>
            <input className="form-input" type="email" required placeholder="colleague@example.com"
              value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Role</label>
            <select className="form-input" value={role} onChange={e => setRole(e.target.value)}>
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Adding...' : 'Add Member'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ProjectDetail() {
  const { projectId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [members, setMembers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [myRole, setMyRole] = useState('member');
  const [tab, setTab] = useState('tasks');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [editTask, setEditTask] = useState(null);

  const isAdmin = myRole === 'admin';

  useEffect(() => {
    Promise.all([
      api.get(`/projects/${projectId}`),
      api.get(`/projects/${projectId}/tasks`),
    ]).then(([projData, taskData]) => {
      setProject(projData.project);
      setMembers(projData.members);
      setMyRole(projData.project.my_role);
      setTasks(taskData.tasks);
    }).catch(() => navigate('/projects'))
      .finally(() => setLoading(false));
  }, [projectId]);

  const handleDeleteProject = async () => {
    if (!window.confirm('Delete this project and all its tasks? This cannot be undone.')) return;
    await api.delete(`/projects/${projectId}`);
    navigate('/projects');
  };

  const handleRemoveMember = async (userId) => {
    if (!window.confirm('Remove this member?')) return;
    await api.delete(`/projects/${projectId}/members/${userId}`);
    setMembers(prev => prev.filter(m => m.id !== userId));
  };

  const handleDeleteTask = async (taskId) => {
    if (!window.confirm('Delete this task?')) return;
    await api.delete(`/projects/${projectId}/tasks/${taskId}`);
    setTasks(prev => prev.filter(t => t.id !== taskId));
  };

  const handleStatusChange = async (task, newStatus) => {
    const result = await api.put(`/projects/${projectId}/tasks/${task.id}`, { status: newStatus });
    setTasks(prev => prev.map(t => t.id === task.id ? result.task : t));
  };

  if (loading) return <div className="loading"><div className="spinner" />Loading...</div>;
  if (!project) return null;

  const filteredTasks = statusFilter ? tasks.filter(t => t.status === statusFilter) : tasks;
  const today = new Date().toISOString().slice(0, 10);

  const tasksByStatus = {
    todo: tasks.filter(t => t.status === 'todo').length,
    in_progress: tasks.filter(t => t.status === 'in_progress').length,
    done: tasks.filter(t => t.status === 'done').length,
  };

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 4 }}>
            <span style={{ cursor: 'pointer', color: 'var(--accent)' }} onClick={() => navigate('/projects')}>Projects</span>
            {' / '}
          </div>
          <div className="page-title">{project.name}</div>
          {project.description && <div className="page-subtitle">{project.description}</div>}
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <>
              <button className="btn btn-secondary" onClick={() => setShowMemberModal(true)}>+ Member</button>
              <button className="btn btn-primary" onClick={() => { setEditTask(null); setShowTaskModal(true); }}>+ Task</button>
              <button className="btn btn-danger" onClick={handleDeleteProject}>Delete</button>
            </>
          )}
          {!isAdmin && (
            <button className="btn btn-primary" onClick={() => { setEditTask(null); setShowTaskModal(true); }}>+ Task</button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-value">{tasks.length}</div>
          <div className="stat-label">Total Tasks</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{tasksByStatus.todo}</div>
          <div className="stat-label">To Do</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--blue)' }}>{tasksByStatus.in_progress}</div>
          <div className="stat-label">In Progress</div>
        </div>
        <div className="stat-card">
          <div className="stat-value stat-green">{tasksByStatus.done}</div>
          <div className="stat-label">Done</div>
        </div>
        <div className="stat-card">
          <div className="stat-value stat-accent">{members.length}</div>
          <div className="stat-label">Members</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button className={`tab ${tab === 'tasks' ? 'active' : ''}`} onClick={() => setTab('tasks')}>Tasks</button>
        <button className={`tab ${tab === 'members' ? 'active' : ''}`} onClick={() => setTab('members')}>Team</button>
      </div>

      {tab === 'tasks' && (
        <div>
          {/* Filter */}
          <div className="flex gap-2 mb-4">
            {['', ...STATUS_OPTIONS].map(s => (
              <button key={s} className={`btn btn-sm ${statusFilter === s ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setStatusFilter(s)}>
                {s ? STATUS_LABELS[s] : 'All'}
              </button>
            ))}
          </div>

          {filteredTasks.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📋</div>
              <div className="empty-title">{statusFilter ? `No ${STATUS_LABELS[statusFilter]} tasks` : 'No tasks yet'}</div>
              <div className="empty-text">Create a task to get started.</div>
            </div>
          ) : filteredTasks.map(task => {
            const overdue = task.due_date && task.due_date < today && task.status !== 'done';
            const canEdit = isAdmin || task.creator_id === user.id || task.assignee_id === user.id;
            return (
              <div key={task.id} className="task-card" style={{ marginBottom: 8, borderColor: overdue ? 'rgba(239,68,68,0.3)' : undefined }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="task-title">{task.title}</div>
                  </div>
                  {task.description && (
                    <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 6 }}>
                      {task.description.slice(0, 120)}{task.description.length > 120 ? '…' : ''}
                    </div>
                  )}
                  <div className="task-meta">
                    <select
                      className={`badge badge-${task.status}`}
                      style={{ cursor: canEdit ? 'pointer' : 'default', border: 'none', background: 'inherit', font: 'inherit' }}
                      value={task.status}
                      onChange={e => canEdit && handleStatusChange(task, e.target.value)}
                      disabled={!canEdit}
                    >
                      {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                    </select>
                    <span className={`badge badge-${task.priority}`}>{PRIORITY_LABELS[task.priority]}</span>
                    {task.assignee_name && <span className="task-meta-item">👤 {task.assignee_name}</span>}
                    {task.due_date && <span className={`task-meta-item ${overdue ? 'overdue' : ''}`}>📅 {task.due_date}{overdue ? ' (overdue)' : ''}</span>}
                    <span className="task-meta-item">by {task.creator_name}</span>
                  </div>
                </div>
                {canEdit && (
                  <div className="flex gap-1">
                    <button className="btn btn-ghost btn-sm" onClick={() => { setEditTask(task); setShowTaskModal(true); }}>✎</button>
                    <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }}
                      onClick={() => handleDeleteTask(task.id)}>✕</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {tab === 'members' && (
        <div>
          {isAdmin && (
            <div style={{ marginBottom: 16 }}>
              <button className="btn btn-primary" onClick={() => setShowMemberModal(true)}>+ Add Member</button>
            </div>
          )}
          <div className="members-list">
            {members.map(m => (
              <div key={m.id} className="member-row">
                <div className="member-avatar">{m.name.slice(0, 2).toUpperCase()}</div>
                <div className="member-info">
                  <div className="member-name">{m.name} {m.id === user.id && <span style={{ fontSize: 11, color: 'var(--text3)' }}>(you)</span>}</div>
                  <div className="member-email">{m.email}</div>
                </div>
                <span className={`badge badge-${m.role}`}>{m.role}</span>
                {isAdmin && m.id !== user.id && project.owner_id !== m.id && (
                  <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }}
                    onClick={() => handleRemoveMember(m.id)}>Remove</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {showTaskModal && (
        <TaskModal
          projectId={projectId}
          members={members}
          task={editTask}
          onClose={() => { setShowTaskModal(false); setEditTask(null); }}
          onSave={(saved) => {
            if (editTask) setTasks(prev => prev.map(t => t.id === saved.id ? saved : t));
            else setTasks(prev => [saved, ...prev]);
          }}
        />
      )}

      {showMemberModal && (
        <AddMemberModal
          projectId={projectId}
          onClose={() => setShowMemberModal(false)}
          onAdd={(newMember) => setMembers(prev => {
            const exists = prev.find(m => m.id === newMember.id);
            if (exists) return prev.map(m => m.id === newMember.id ? { ...m, role: newMember.role } : m);
            return [...prev, newMember];
          })}
        />
      )}
    </div>
  );
}
