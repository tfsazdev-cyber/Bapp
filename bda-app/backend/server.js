const express = require('express');
const cors    = require('cors');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { Pool } = require('pg');

const app    = express();
const PORT   = process.env.PORT   || 3000;
const SECRET = process.env.JWT_SECRET || 'bda_secret_CHANGE_IN_PRODUCTION';

app.use(cors());
app.use(express.json());

// ══════════════════════════════════════════════════════════════
//  PostgreSQL connection pool
//  Reads from env vars set in docker-compose.yml
// ══════════════════════════════════════════════════════════════
const pool = new Pool({
  host:     process.env.DB_HOST     || 'database',
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME     || 'bda',
  user:     process.env.DB_USER     || 'bda_user',
  password: process.env.DB_PASSWORD || 'bda_password',
  max:      10,                      // max pool connections
  idleTimeoutMillis:    30000,
  connectionTimeoutMillis: 5000,
});

// ── Fallback in-memory store (used if DB is not connected) ─────
const fallbackUsers = [
  { id:1, first_name:'Admin', last_name:'User', email:'admin@bda.com', password: bcrypt.hashSync('admin123',10), phone:'+91 9876543210', company:'BDA Corp', role:'Admin', status:'active', created_at:new Date().toISOString() }
];

let useDB = false;

// Test DB connection on startup
pool.connect()
  .then(client => {
    client.release();
    useDB = true;
    console.log('✅ Connected to PostgreSQL');
  })
  .catch(err => {
    console.warn('⚠️  PostgreSQL not available, using in-memory fallback:', err.message);
  });

// ── Helpers ───────────────────────────────────────────────────
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function makeToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    SECRET,
    { expiresIn: '24h' }
  );
}

function dbRowToUser(row) {
  return {
    id:         row.id,
    firstName:  row.first_name,
    lastName:   row.last_name,
    email:      row.email,
    phone:      row.phone,
    company:    row.company,
    role:       row.role,
    status:     row.status,
    createdAt:  row.created_at,
    lastLogin:  row.last_login,
  };
}

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try { req.user = jwt.verify(token, SECRET); next(); }
  catch { res.status(401).json({ error: 'Invalid or expired token' }); }
}

async function logAudit(userId, action, targetId, details, ip) {
  if (!useDB) return;
  try {
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, target_id, details, ip_address)
       VALUES ($1,$2,$3,$4,$5)`,
      [userId, action, targetId, JSON.stringify(details), ip]
    );
  } catch (e) { console.error('Audit log error:', e.message); }
}

// ══════════════════════════════════════════════════════════════
//  ROUTES
// ══════════════════════════════════════════════════════════════

// Health check — also reports DB status
app.get('/health', async (_req, res) => {
  let dbOk = false;
  try { await pool.query('SELECT 1'); dbOk = true; } catch {}
  res.json({
    status:   'ok',
    service:  'BDA Backend',
    database: dbOk ? 'connected' : 'fallback (in-memory)',
    uptime:   process.uptime(),
    time:     new Date().toISOString(),
  });
});

// ── REGISTER ──────────────────────────────────────────────────
app.post('/register', async (req, res) => {
  const { firstName, lastName, email, phone, company, role, password } = req.body;

  // Validate
  const missing = [];
  if (!firstName?.trim()) missing.push('firstName');
  if (!email?.trim())     missing.push('email');
  if (!password)          missing.push('password');
  if (missing.length)     return res.status(400).json({ error: `Missing: ${missing.join(', ')}` });
  if (!emailRe.test(email)) return res.status(400).json({ error: 'Invalid email' });
  if (password.length < 8)  return res.status(400).json({ error: 'Password must be 8+ characters' });

  const validRoles = ['Admin','Manager','Analyst','Viewer'];
  const safeRole   = validRoles.includes(role) ? role : 'Viewer';
  const hashed     = await bcrypt.hash(password, 10);

  try {
    if (useDB) {
      const { rows } = await pool.query(
        `INSERT INTO users (first_name, last_name, email, password, phone, company, role)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [firstName.trim(), (lastName||'').trim(), email.trim().toLowerCase(),
         hashed, (phone||'').trim(), (company||'').trim(), safeRole]
      );
      const user = dbRowToUser(rows[0]);
      await logAudit(user.id, 'user.register', user.id, { email: user.email }, req.ip);
      return res.status(201).json({ message: 'Account created', token: makeToken(user), user });
    } else {
      // Fallback
      if (fallbackUsers.find(u => u.email.toLowerCase() === email.toLowerCase())) {
        return res.status(409).json({ error: 'Email already registered' });
      }
      const u = { id: fallbackUsers.length+1, first_name: firstName, last_name: lastName||'',
                  email: email.toLowerCase(), password: hashed, phone: phone||'',
                  company: company||'', role: safeRole, status:'active', created_at: new Date().toISOString() };
      fallbackUsers.push(u);
      const user = dbRowToUser(u);
      return res.status(201).json({ message: 'Account created (fallback)', token: makeToken(user), user });
    }
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already registered' });
    console.error('Register error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── LOGIN ─────────────────────────────────────────────────────
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  try {
    let row;
    if (useDB) {
      const { rows } = await pool.query('SELECT * FROM users WHERE email=$1', [email.toLowerCase()]);
      row = rows[0];
    } else {
      row = fallbackUsers.find(u => u.email.toLowerCase() === email.toLowerCase());
    }

    if (!row) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, row.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    if (row.status === 'inactive') return res.status(403).json({ error: 'Account is deactivated' });

    // Update last_login
    if (useDB) {
      await pool.query('UPDATE users SET last_login=NOW() WHERE id=$1', [row.id]);
      await pool.query(
        `INSERT INTO sessions (user_id, ip_address, user_agent) VALUES ($1,$2,$3)`,
        [row.id, req.ip, req.headers['user-agent'] || '']
      );
      await logAudit(row.id, 'user.login', row.id, {}, req.ip);
    }

    const user = dbRowToUser(row);
    return res.json({ message: 'Login successful', token: makeToken(user), user });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET MY PROFILE ────────────────────────────────────────────
app.get('/me', authMiddleware, async (req, res) => {
  try {
    if (useDB) {
      const { rows } = await pool.query('SELECT * FROM users WHERE id=$1', [req.user.id]);
      if (!rows[0]) return res.status(404).json({ error: 'User not found' });
      return res.json(dbRowToUser(rows[0]));
    } else {
      const row = fallbackUsers.find(u => u.id === req.user.id);
      if (!row) return res.status(404).json({ error: 'Not found' });
      return res.json(dbRowToUser(row));
    }
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// ── LIST ALL USERS ────────────────────────────────────────────
app.get('/users', authMiddleware, async (req, res) => {
  if (req.user.role !== 'Admin' && req.user.role !== 'Manager') {
    return res.status(403).json({ error: 'Access denied' });
  }
  try {
    if (useDB) {
      const { rows } = await pool.query(
        `SELECT * FROM users ORDER BY created_at DESC`
      );
      return res.json(rows.map(dbRowToUser));
    } else {
      return res.json(fallbackUsers.map(dbRowToUser));
    }
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// ── GET SINGLE USER ───────────────────────────────────────────
app.get('/users/:id', authMiddleware, async (req, res) => {
  const id = parseInt(req.params.id);
  if (req.user.role !== 'Admin' && req.user.id !== id) {
    return res.status(403).json({ error: 'Access denied' });
  }
  try {
    if (useDB) {
      const { rows } = await pool.query('SELECT * FROM users WHERE id=$1', [id]);
      if (!rows[0]) return res.status(404).json({ error: 'User not found' });
      return res.json(dbRowToUser(rows[0]));
    } else {
      const row = fallbackUsers.find(u => u.id === id);
      if (!row) return res.status(404).json({ error: 'Not found' });
      return res.json(dbRowToUser(row));
    }
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// ── UPDATE USER ───────────────────────────────────────────────
app.patch('/users/:id', authMiddleware, async (req, res) => {
  const id  = parseInt(req.params.id);
  if (req.user.role !== 'Admin' && req.user.id !== id) {
    return res.status(403).json({ error: 'Access denied' });
  }
  const { firstName, lastName, phone, company, role, status } = req.body;
  const isAdmin = req.user.role === 'Admin';

  try {
    if (useDB) {
      const { rows } = await pool.query(
        `UPDATE users SET
           first_name = COALESCE(NULLIF($1,''), first_name),
           last_name  = COALESCE(NULLIF($2,''), last_name),
           phone      = COALESCE(NULLIF($3,''), phone),
           company    = COALESCE(NULLIF($4,''), company),
           role       = CASE WHEN $5::text IS NOT NULL AND $6 THEN $5::user_role ELSE role END,
           status     = CASE WHEN $7::text IS NOT NULL AND $6 THEN $7::user_status ELSE status END
         WHERE id=$8 RETURNING *`,
        [firstName||'', lastName||'', phone||'', company||'',
         role||null, isAdmin, status||null, id]
      );
      if (!rows[0]) return res.status(404).json({ error: 'User not found' });
      await logAudit(req.user.id, 'user.update', id, req.body, req.ip);
      return res.json({ message: 'User updated', user: dbRowToUser(rows[0]) });
    } else {
      const idx = fallbackUsers.findIndex(u => u.id === id);
      if (idx < 0) return res.status(404).json({ error: 'Not found' });
      if (firstName) fallbackUsers[idx].first_name = firstName;
      if (lastName)  fallbackUsers[idx].last_name  = lastName;
      if (phone)     fallbackUsers[idx].phone      = phone;
      if (company)   fallbackUsers[idx].company    = company;
      if (role && isAdmin)   fallbackUsers[idx].role   = role;
      if (status && isAdmin) fallbackUsers[idx].status = status;
      return res.json({ message: 'User updated', user: dbRowToUser(fallbackUsers[idx]) });
    }
  } catch (err) {
    console.error('Update error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── DELETE USER (Admin only) ──────────────────────────────────
app.delete('/users/:id', authMiddleware, async (req, res) => {
  if (req.user.role !== 'Admin') return res.status(403).json({ error: 'Admin only' });
  const id = parseInt(req.params.id);
  if (id === 1) return res.status(400).json({ error: 'Cannot delete root admin' });

  try {
    if (useDB) {
      const { rowCount } = await pool.query('DELETE FROM users WHERE id=$1', [id]);
      if (!rowCount) return res.status(404).json({ error: 'User not found' });
      await logAudit(req.user.id, 'user.delete', id, {}, req.ip);
    } else {
      const idx = fallbackUsers.findIndex(u => u.id === id);
      if (idx < 0) return res.status(404).json({ error: 'Not found' });
      fallbackUsers.splice(idx, 1);
    }
    res.json({ message: 'User deleted' });
  } catch (err) {
    console.error('Delete error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── AUDIT LOGS (Admin only) ───────────────────────────────────
app.get('/audit-logs', authMiddleware, async (req, res) => {
  if (req.user.role !== 'Admin') return res.status(403).json({ error: 'Admin only' });
  if (!useDB) return res.json([]);
  try {
    const { rows } = await pool.query(
      `SELECT al.*, u.first_name || ' ' || u.last_name AS actor_name
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.user_id
       ORDER BY al.created_at DESC
       LIMIT 100`
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// ── STATS (dashboard numbers from real DB) ────────────────────
app.get('/stats', authMiddleware, async (req, res) => {
  if (!useDB) {
    return res.json({ total:10, active:7, admins:2, companies:8, roles:{Admin:2,Manager:2,Analyst:3,Viewer:3} });
  }
  try {
    const [totals, roles, companies] = await Promise.all([
      pool.query(`SELECT status, COUNT(*) FROM users GROUP BY status`),
      pool.query(`SELECT role,   COUNT(*) FROM users GROUP BY role`),
      pool.query(`SELECT COUNT(DISTINCT company) AS c FROM users`),
    ]);
    const byStatus = Object.fromEntries(totals.rows.map(r=>[r.status, parseInt(r.count)]));
    const byRole   = Object.fromEntries(roles.rows.map(r=>[r.role,   parseInt(r.count)]));
    res.json({
      total:     Object.values(byStatus).reduce((a,b)=>a+b,0),
      active:    byStatus.active  || 0,
      pending:   byStatus.pending || 0,
      inactive:  byStatus.inactive|| 0,
      companies: parseInt(companies.rows[0]?.c || 0),
      roles:     byRole,
    });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// ══════════════════════════════════════════════════════════════
app.listen(PORT, () => {
  console.log(`✅ BDA Backend  → http://localhost:${PORT}`);
  console.log(`   Default admin : admin@bda.com  /  Admin@123`);
});
