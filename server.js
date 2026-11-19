import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import app, { pool } from './api/app.js';

// Local development server. On Vercel, api/index.js is used instead.
const port = Number(process.env.API_PORT || 3001);
const directory = path.dirname(fileURLToPath(import.meta.url));

async function ensureTaskSchema() {
  await pool.query('ALTER TABLE "Task" DROP CONSTRAINT IF EXISTS "Task_pkey"');
  await pool.query('ALTER TABLE "Task" ADD PRIMARY KEY ("ID", "Task")');
}

app.use(express.static(path.join(directory, 'dist')));
app.get('/{*path}', (_request, response) => {
  response.sendFile(path.join(directory, 'dist', 'index.html'));
});

ensureTaskSchema()
  .then(() => {
    app.listen(port, () => {
      console.log(`HabitLoop API listening on http://localhost:${port}`);
    });
  })
  .catch((error) => {
    if (error.code !== '42P16' && error.code !== '42710') {
      console.error('Unable to initialize Task schema:', error);
      process.exit(1);
    }
  });
