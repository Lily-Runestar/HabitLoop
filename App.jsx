
import { useEffect, useState } from "react";
import "./App.css";

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDays() {
  const today = new Date();

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() + index - 3);

    return {
      key: dateKey(date),
      label: date.toLocaleDateString("en-US", {
        weekday: "short",
      }),
      number: date.getDate(),
      offset: index - 3,
    };
  });
}

function HabitApp({ user, onLogout }) {
  const [databaseTaskName, setDatabaseTaskName] = useState("");
  const [addingDatabaseTask, setAddingDatabaseTask] = useState(false);
  const [today, setToday] = useState(() => dateKey(new Date()));
  const [databaseTasks, setDatabaseTasks] = useState([]);
  const [databaseError, setDatabaseError] = useState("");

  useEffect(() => {
    const todayParts = today.split("-");
    const taskDate = `${todayParts[1]}${todayParts[2]}${todayParts[0]}`;
    fetch(`/api/tasks/${encodeURIComponent(user.ID)}/${taskDate}`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load your tasks");
        return data;
      })
      .then((data) => setDatabaseTasks(data.tasks))
      .catch((error) => setDatabaseError(error.message));
  }, [user.ID, today]);

  useEffect(() => {
    const timer = setInterval(() => {
      setToday(dateKey(new Date()));
    }, 30000);

    return () => clearInterval(timer);
  }, []);

  const days = getDays();

  async function toggleDatabaseHabit(taskName) {
    const todayParts = today.split("-");
    const taskDate = Number(`${todayParts[1]}${todayParts[2]}${todayParts[0]}`);
    const current = databaseTasks.find((task) => task.task === taskName);
    if (!current) return;

    try {
      const response = await fetch(`/api/tasks/${user.ID}/${taskDate}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: taskName, completion: !current.completion }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not update habit.");
      setDatabaseTasks((currentTasks) => currentTasks.map((task) =>
        task.task === taskName ? { ...task, completion: data.completion } : task
      ));
    } catch (error) {
      setDatabaseError(error.message);
    }
  }

  async function addDatabaseTask(event) {
    event.preventDefault();
    const task = databaseTaskName.trim();
    if (!task) return;

    const todayParts = today.split("-");
    setAddingDatabaseTask(true);
    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.ID,
          task,
          taskDate: Number(`${todayParts[1]}${todayParts[2]}${todayParts[0]}`),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not add task.");
      setDatabaseTasks((current) => current.some((item) => item.task === data.task)
        ? current
        : [...current, data]);
      setDatabaseTaskName("");
    } catch (error) {
      setDatabaseError(error.message);
    } finally {
      setAddingDatabaseTask(false);
    }
  }

  const completedCount = databaseTasks.filter((task) => task.completion).length;
  const progress = databaseTasks.length
    ? Math.round((completedCount / databaseTasks.length) * 100)
    : 0;

  return (
    <main className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-icon">≋</span>
          <span>HabitLoop</span>
        </div>
        <button className="logout-button" type="button" onClick={onLogout}>
          {user.username} · Sign out
        </button>
      </header>

      <section className="summary">
        <div>
          <p className="section-label">NEON DATABASE</p>
          <h2>
            {databaseError
              ? "Connection unavailable"
              : databaseTasks.length
                ? "Tasks loaded"
                : "No assigned tasks"}
          </h2>
          {databaseError && <p>{databaseError}</p>}
          {!databaseError && (
            <p>
              {databaseTasks.filter((task) => task.completion).length} of {databaseTasks.length} completed
            </p>
          )}
        </div>
      </section>

      <section className="summary">
        <div>
          <p className="section-label">TODAY'S PROGRESS</p>
          <h2>{completedCount} of {databaseTasks.length} completed</h2>
          <div
            className="progress-track"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="progress-fill"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="progress-number">{progress}%</div>
      </section>

      <section className="timeline-section">
        <div className="section-heading">
          <div>
            <p className="section-label">YOUR WEEK AT A GLANCE</p>
            <h2>Seven-day tide</h2>
          </div>
          <span className="timezone-note">Past · Today · Upcoming</span>
        </div>

        <div className="timeline">
          {days.map((day) => (
            <div
              className={[
                "day",
                day.offset === 0 ? "day-today" : "",
                day.offset > 0 ? "day-future" : "",
              ].join(" ")}
              key={day.key}
            >
              <span className="day-label">
                {day.offset === 0 ? "Today" : day.label}
              </span>
              <span className="day-number">{day.number}</span>
              <span className="day-status">
                {day.offset > 0 ? "·" : day.offset < 0 ? "Past" : "Now"}
              </span>
            </div>
          ))}
        </div>

        <p className="timeline-hint">
          ✓ Completed · ○ Missed · — Upcoming
        </p>
      </section>

      <section className="habits-section">
        <div className="section-heading">
          <div>
            <p className="section-label">BUILD YOUR RHYTHM</p>
            <h2>Your habits</h2>
          </div>
          <span className="habit-count">
            {databaseTasks.length} {databaseTasks.length === 1 ? "habit" : "habits"}
          </span>
        </div>

        <form className="habit-form database-task-form" onSubmit={addDatabaseTask}>
          <input
            value={databaseTaskName}
            onChange={(event) => setDatabaseTaskName(event.target.value)}
            placeholder="Add a habit for today"
            aria-label="New database habit"
            maxLength={100}
          />
          <button type="submit" className="add-button" disabled={addingDatabaseTask}>
            <span>+</span> {addingDatabaseTask ? "Adding..." : "Add habit"}
          </button>
        </form>

        {databaseTasks.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">≈</span>
            <h3>Start your first ripple</h3>
            <p>Add a habit above and it will be saved to your account.</p>
          </div>
        ) : (
          <div className="habit-list">
            {databaseTasks.map((task) => {
              const completedToday = Boolean(task.completion);
              return (
                <article className="habit-card" key={task.task}>
                  <div className="habit-main">
                    <button
                      type="button"
                      className={["today-check", completedToday ? "is-complete" : ""].join(" ")}
                      onClick={() => toggleDatabaseHabit(task.task)}
                      aria-label={completedToday ? `Mark ${task.task} incomplete today` : `Mark ${task.task} complete today`}
                    >
                      {completedToday ? "✓" : ""}
                    </button>
                    <div className="habit-info">
                      <h3 className={completedToday ? "completed-name" : ""}>{task.task}</h3>
                      <p>{completedToday ? "Completed today — nice work!" : "A little progress goes a long way"}</p>
                    </div>
                  </div>
                  <div className="history">
                    {days.map((day) => {
                      const isToday = day.offset === 0;
                      const isFuture = day.offset > 0;
                      const isDone = isToday && completedToday;
                      return (
                        <div className="history-day" key={day.key}>
                          <span className="history-label">{isToday ? "Today" : day.label}</span>
                          {isFuture ? (
                            <span className="history-mark future-mark" aria-label={`${day.key}, upcoming`}>—</span>
                          ) : (
                            <span className={["history-mark", isDone ? "mark-done" : "mark-missed", isToday ? "mark-today" : ""].join(" ")} aria-label={isDone ? `Completed on ${day.key}` : `Not completed on ${day.key}`}>
                              {isDone ? "✓" : "○"}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <footer>
        <span className="footer-wave">≋</span>
        Keep going with the flow.
      </footer>
    </main>
  );
}

export default function App() {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("habitloop-user"));
    } catch {
      return null;
    }
  });
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  async function login(event) {
    event.preventDefault();
    setLoginError("");
    setLoggingIn(true);

    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Login failed.");
      localStorage.setItem("habitloop-user", JSON.stringify(data.user));
      setUser(data.user);
      setPassword("");
    } catch (error) {
      setLoginError(error.message);
    } finally {
      setLoggingIn(false);
    }
  }

  function logout() {
    localStorage.removeItem("habitloop-user");
    setUser(null);
  }

  if (!user) {
    return (
      <main className="login-page">
        <section className="login-panel">
          <div className="login-brand"><span className="brand-icon">≋</span><span>HabitLoop</span></div>
          <p className="section-label">WELCOME BACK</p>
          <h1>Build your rhythm.</h1>
          <p className="login-copy">Sign in to keep your habits moving.</p>
          <form className="login-form" onSubmit={login}>
            <label htmlFor="username">Username</label>
            <input id="username" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required />
            <label htmlFor="password">Password</label>
            <input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
            {loginError && <p className="login-error" role="alert">{loginError}</p>}
            <button type="submit" disabled={loggingIn}>{loggingIn ? "Signing in..." : "Sign in"}</button>
          </form>
        </section>
      </main>
    );
  }

  return <HabitApp user={user} onLogout={logout} />;
}
