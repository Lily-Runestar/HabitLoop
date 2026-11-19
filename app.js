import 'dotenv/config';
import express from 'express';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

// Neon's Pool talks to the database over WebSockets; Node needs the ws package for that.
neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is missing. Copy .env.example to .env and add your Neon connection string.');
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Some connection failures (e.g. AggregateError) have an empty message, so dig out the real cause.
function describeError(error) {
  const inner = error?.errors?.length ? error.errors.map(describeError).join('; ') : '';
  return [error?.code, error?.message, inner].filter(Boolean).join(' - ') || String(error);
}

const app = express();

app.use(express.json());

app.post('/api/login', async (request, response) => {
  const username = String(request.body.username || '').trim();
  const password = String(request.body.password || '');

  if (!username || !password) {
    return response.status(400).json({ error: 'Username and password are required.' });
  }

  try {
    const result = await pool.query(
      'SELECT "ID", "username", "email" FROM "User" WHERE "username" = $1 AND "password" = $2',
      [username, password],
    );

    if (result.rows.length === 0) {
      return response.status(401).json({ error: 'Invalid username or password.' });
    }

    response.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Login failed:', error);
    response.status(500).json({ error: describeError(error) });
  }
});

app.get('/api/health', (_request, response) => {
  response.json({ configured: Boolean(process.env.DATABASE_URL) });
});

app.post('/api/tasks', async (request, response) => {
  const userId = Number(request.body.userId);
  const taskName = String(request.body.task || '').trim();
  const taskDate = Number(request.body.taskDate);

  if (!Number.isInteger(userId) || !taskName || !/^\d{8}$/.test(String(request.body.taskDate || ''))) {
    return response.status(400).json({ error: 'A user, task name, and date are required.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(
      'SELECT "ID" FROM "TaskAllocation" WHERE "Task" = $1',
      [taskName],
    );

    if (existing.rows.length > 0 && Number(existing.rows[0].ID) !== userId) {
      await client.query('ROLLBACK');
      return response.status(409).json({ error: 'That task name is already assigned to another user.' });
    }

    if (existing.rows.length === 0) {
      await client.query(
        'INSERT INTO "TaskAllocation" ("Task", "ID") VALUES ($1, $2)',
        [taskName, userId],
      );
    }

    await client.query(`
      INSERT INTO "Task" ("ID", "ID_F", "Task", "completion")
      OVERRIDING SYSTEM VALUE
      VALUES ($1, $2, $3, false)
      ON CONFLICT ("ID", "Task") DO NOTHING
    `, [taskDate, userId, taskName]);

    await client.query('COMMIT');
    response.status(201).json({ task: taskName, completion: false });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Task creation failed:', error);
    response.status(500).json({ error: describeError(error) });
  } finally {
    client.release();
  }
});

app.patch('/api/tasks/:userId/:taskDate', async (request, response) => {
  const userId = Number(request.params.userId);
  const taskDate = Number(request.params.taskDate);
  const taskName = String(request.body.task || '').trim();
  const completion = Boolean(request.body.completion);

  if (!Number.isInteger(userId) || !/^\d{8}$/.test(request.params.taskDate) || !taskName) {
    return response.status(400).json({ error: 'A valid user, date, and habit are required.' });
  }

  try {
    await pool.query(`
      INSERT INTO "Task" ("ID", "ID_F", "Task", "completion")
      OVERRIDING SYSTEM VALUE
      VALUES ($1, $2, $3, $4)
      ON CONFLICT ("ID", "Task") DO UPDATE
      SET "completion" = EXCLUDED."completion"
    `, [taskDate, userId, taskName, completion]);

    response.json({ task: taskName, completion });
  } catch (error) {
    console.error('Task update failed:', error);
    response.status(500).json({ error: describeError(error) });
  }
});

app.get('/api/tasks/:userId/:taskDate', async (request, response) => {
  const userId = Number(request.params.userId);
  const taskDate = Number(request.params.taskDate);
  if (!Number.isInteger(userId) || !/^\d{8}$/.test(request.params.taskDate)) {
    return response.status(400).json({ error: 'Invalid user ID or date.' });
  }

  try {
    const result = await pool.query(`
      SELECT allocation."Task" AS task,
             COALESCE(task."completion", false) AS completion
      FROM "TaskAllocation" allocation
      LEFT JOIN "Task" task ON task."Task" = allocation."Task"
                          AND task."ID_F" = $1
                          AND task."ID" = $2
      WHERE allocation."ID" = $1
      ORDER BY allocation."Task"
    `, [userId, taskDate]);

    response.json({ tasks: result.rows });
  } catch (error) {
    console.error('Task query failed:', error);
    response.status(500).json({ error: describeError(error) });
  }
});

// Dumps every table (including passwords) - never expose this publicly.
if (!process.env.VERCEL) {
  app.get('/api/data', async (_request, response) => {
    try {
      const [users, tasks, allocations, gambling, seashells] = await Promise.all([
        pool.query('SELECT * FROM "User" ORDER BY "ID"'),
        pool.query('SELECT * FROM "Task" ORDER BY "ID"'),
        pool.query('SELECT * FROM "TaskAllocation" ORDER BY "Task"'),
        pool.query('SELECT * FROM "GAMBLING" ORDER BY "ID"'),
        pool.query('SELECT * FROM "Seashell" ORDER BY "Name"'),
      ]);

      response.json({
        users: users.rows,
        tasks: tasks.rows,
        allocations: allocations.rows,
        gambling: gambling.rows,
        seashells: seashells.rows,
      });
    } catch (error) {
      console.error('Neon query failed:', error);
      response.status(500).json({ error: describeError(error) });
    }
  });
}

export default app;
