# TaskFlow — Team Task Manager

A full-stack team task management application with role-based access control, project management, and real-time task tracking.

---

## Features

- **Authentication** — JWT-based signup/login with bcrypt password hashing
- **Projects** — Create, update, delete projects with owner control
- **Team Management** — Add/remove members, assign Admin or Member roles
- **Tasks** — Create, assign, update status, set priority and due dates
- **Dashboard** — Aggregate stats, assigned tasks, overdue alerts, project progress
- **RBAC** — Admins manage projects & members; Members work on tasks

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js, Express.js |
| Database | SQLite via better-sqlite3 |
| Auth | JWT + bcryptjs |
| Validation | express-validator |
| Frontend | React 18, React Router v6 |
| Build | Vite |
| Deploy | Railway (Docker) |

---

## Project Structure

```
taskflow/
├── backend/
│   ├── db/database.js          # SQLite schema & connection
│   ├── middleware/auth.js      # JWT + RBAC middleware
│   ├── routes/
│   │   ├── auth.js             # POST /signup, /login, GET /me
│   │   ├── projects.js         # Project CRUD + member mgmt
│   │   ├── tasks.js            # Task CRUD with filters
│   │   └── dashboard.js        # Aggregate stats
│   └── server.js               # Express app entry
├── frontend/
│   └── src/
│       ├── context/AuthContext.jsx
│       ├── pages/
│       │   ├── AuthPage.jsx
│       │   ├── Dashboard.jsx
│       │   ├── ProjectsPage.jsx
│       │   └── ProjectDetail.jsx
│       └── api.js
├── Dockerfile
├── railway.toml
└── README.md
```

---

## REST API Reference

### Auth

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/signup` | No | Register new user |
| POST | `/api/auth/login` | No | Login, get JWT |
| GET | `/api/auth/me` | Yes | Get current user |

### Projects

| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| GET | `/api/projects` | Any | List user's projects |
| POST | `/api/projects` | Any | Create project |
| GET | `/api/projects/:id` | Member+ | Get project details |
| PUT | `/api/projects/:id` | Admin | Update project |
| DELETE | `/api/projects/:id` | Owner | Delete project |
| POST | `/api/projects/:id/members` | Admin | Add member |
| DELETE | `/api/projects/:id/members/:uid` | Admin | Remove member |

### Tasks

| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| GET | `/api/projects/:id/tasks` | Member+ | List tasks (filterable) |
| POST | `/api/projects/:id/tasks` | Member+ | Create task |
| GET | `/api/projects/:id/tasks/:tid` | Member+ | Get task |
| PUT | `/api/projects/:id/tasks/:tid` | Creator/Assignee/Admin | Update task |
| DELETE | `/api/projects/:id/tasks/:tid` | Creator/Admin | Delete task |

### Dashboard

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/dashboard` | Yes | Stats, my tasks, overdue |

---

## Role-Based Access Control

| Action | Owner | Admin | Member |
|--------|-------|-------|--------|
| Delete project | ✅ | ❌ | ❌ |
| Edit project | ✅ | ✅ | ❌ |
| Add/remove members | ✅ | ✅ | ❌ |
| Create tasks | ✅ | ✅ | ✅ |
| Edit any task | ✅ | ✅ | own only |
| Delete any task | ✅ | ✅ | own only |

---

## Local Development

### Prerequisites

- Node.js 18+
- npm

### Setup

```bash
# Clone the repo
git clone <your-repo-url>
cd taskflow

# Install backend dependencies
cd backend && npm install && cd ..

# Install frontend dependencies
cd frontend && npm install && cd ..

# Create environment file
cp .env.example backend/.env
# Edit backend/.env and set JWT_SECRET to a random string
```

### Run locally

**Terminal 1 — Backend:**

```bash
cd backend
node server.js
# Runs on http://localhost:5000
```

**Terminal 2 — Frontend:**

```bash
cd frontend
npm run dev
# Runs on http://localhost:5173
```

Open [http://localhost:5173](http://localhost:5173)

---

## Deploy to Railway

### Step 1 — Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit: TaskFlow app"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/taskflow.git
git push -u origin main
```

### Step 2 — Create Railway Project

1. Go to [railway.app](https://railway.app) and sign in
2. Click **"New Project"** → **"Deploy from GitHub repo"**
3. Connect your GitHub account and select the `taskflow` repository
4. Railway will auto-detect the `Dockerfile`

### Step 3 — Set Environment Variables

In your Railway project → **Variables** tab, add:

| Variable | Value |
|----------|-------|
| `JWT_SECRET` | `any-long-random-string-here` |
| `NODE_ENV` | `production` |
| `PORT` | `8080` |
| `DB_PATH` | `/data/taskmanager.db` |

### Step 4 — Add Persistent Volume (Important!)

SQLite data must persist between deploys:

1. In Railway → your service → **Volumes** tab
2. Click **"Add Volume"**
3. Mount path: `/data`
4. This ensures your database survives redeployments

### Step 5 — Deploy

1. Click **Deploy** (or push to main — auto-deploys)
2. Railway builds the Docker image and starts the app
3. Click **"Generate Domain"** to get a public URL

### Step 6 — Verify

Visit `https://your-app.railway.app/api/health` — should return `{"status":"ok"}`

---

## Database Schema

```sql
users          → id, name, email, password, created_at
projects       → id, name, description, owner_id, created_at
project_members→ id, project_id, user_id, role, joined_at
tasks          → id, title, description, project_id, assignee_id,
                 creator_id, status, priority, due_date, created_at, updated_at
```

---

## Security

- Passwords hashed with bcrypt (10 salt rounds)
- JWT tokens expire in 7 days
- All routes require authentication except `/api/auth/signup` and `/api/auth/login`
- SQL injection prevented via parameterized queries (better-sqlite3)
- RBAC enforced at middleware level, not just frontend
- Foreign key constraints enabled in SQLite

---

## Sample API Usage

```bash
# Signup
curl -X POST https://your-app.railway.app/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice","email":"alice@example.com","password":"secret123"}'

# Login
curl -X POST https://your-app.railway.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","password":"secret123"}'

# Create project (use token from login)
curl -X POST https://your-app.railway.app/api/projects \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"My Project","description":"A cool project"}'
```
