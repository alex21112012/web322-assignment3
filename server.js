/********************************************************************************
* WEB322 – Assignment 03
*
* I declare that this assignment is my own work in accordance with Seneca's
* Academic Integrity Policy:
*
* https://www.senecapolytechnic.ca/about/policies/academic-integrity-policy.html
*
* Name: ______________________ Student ID: ______________ Date: ______________
*
********************************************************************************/
// WEB322 – A3 basic implementation
require('dotenv').config();

const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const { Sequelize, DataTypes } = require('sequelize');
const bcrypt = require('bcryptjs');
const clientSessions = require('client-sessions');
app.set('views', __dirname + '/views');

const app = express();

/* -------------------- BASIC CONFIG -------------------- */

const HTTP_PORT = process.env.PORT || 8080;

// view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// client-sessions – uses your SESSION string
app.use(
  clientSessions({
    cookieName: 'session',
    secret: process.env.session,   // <-- from .env (session=happyHolidays)
    duration: 30 * 60 * 1000,      // 30 min
    activeDuration: 5 * 60 * 1000, // extend 5 min on activity
  })
);

// make session available in views
app.use((req, res, next) => {
  res.locals.session = req.session;
  next();
});

/* -------------------- MONGODB (USERS) -------------------- */

// uses your mongoose connection string exactly
mongoose
  .connect(process.env.mongoose)
  .then(() => console.log('MongoDB connected'))
  .catch((err) => console.log('MongoDB error:', err));

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true }, // handle
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },               // bcrypt hash
  createdAt: { type: Date, default: Date.now },
},
 {
    collection: 'users',
  }
);



const User = mongoose.models.User || mongoose.model('User', userSchema);



/* ----------------- POSTGRES (TASKS) --------------------- */

// uses your postgres URL exactly
const sequelize = new Sequelize(process.env.database, {
  dialect: 'postgres',
  logging: false,
  dialectOptions: {
    ssl: { require: true, rejectUnauthorized: false }, // fixes “connection is insecure”
  },
});

sequelize
  .authenticate()
  .then(() => console.log('Postgres connected'))
  .catch((err) => console.log('Postgres error:', err));

const Task = sequelize.define('Task', {
  title: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  description: DataTypes.TEXT,
  dueDate: DataTypes.DATE,
  status: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'pending',
  },
  // store Mongo user _id as string
  userId: {
    type: DataTypes.STRING,
    allowNull: false,
  },
});

// create table if it doesn’t exist
sequelize
  .sync()
  .then(() => console.log('Sequelize synced'))
  .catch((err) => console.log('Sequelize sync error:', err));

/* ----------------- AUTH MIDDLEWARE ---------------------- */

function ensureLogin(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  next();
}

/* ------------------------ ROUTES ------------------------ */

// simple home – your landing page with Login / Register buttons
app.get('/', (req, res) => {
  res.render('home'); // make views/home.ejs (like the sample)
});

/* --------- AUTH: REGISTER / LOGIN / LOGOUT ------------- */

app.get('/register', (req, res) => {
  res.render('register', { error: null, formData: {} });
});

app.post('/register', async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.render('register', {
      error: 'All fields are required.',
      formData: { username, email },
    });
  }

  try {
    // check for existing username or email
    const existing = await User.findOne({
      $or: [{ username }, { email }],
    }).exec();

    if (existing) {
      return res.render('register', {
        error: 'Username or email already in use.',
        formData: { username, email },
      });
    }

    // hash password (10 rounds like notes)
    const hash = await bcrypt.hash(password, 10);

    await User.create({
      username,
      email,
      password: hash,
    });

    // redirect to login after successful register
    res.redirect('/login');
  } catch (err) {
    console.log('Register error:', err);
    res.render('register', {
      error: 'There was an error creating your account.',
      formData: { username, email },
    });
  }
});

app.get('/login', (req, res) => {
  res.render('login', { error: null });
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.render('login', {
      error: 'Please enter both username and password.',
    });
  }

  try {
    const user = await User.findOne({ username }).exec();

    if (!user) {
      return res.render('login', { error: 'Invalid credentials' });
    }

    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      return res.render('login', { error: 'Invalid credentials' });
    }

    // create session (only what assignment needs)
    req.session.user = {
      id: user._id.toString(),
      username: user.username,
      email: user.email,
    };

    res.redirect('/dashboard');
  } catch (err) {
    console.log('Login error:', err);
    res.render('login', { error: 'There was an error logging in.' });
  }
});

app.get('/logout', (req, res) => {
  req.session.reset();
  res.redirect('/login');
});

/* -------------------- DASHBOARD / TASKS ------------------- */

// dashboard – show quick info + list of tasks
app.get('/dashboard', ensureLogin, async (req, res) => {
  try {
    const tasks = await Task.findAll({
      where: { userId: req.session.user.id },
      order: [['createdAt', 'ASC']],
    });

    res.render('dashboard', {
      user: req.session.user,
      tasks,
    });
  } catch (err) {
    console.log('Dashboard error:', err);
    res.render('dashboard', { user: req.session.user, tasks: [] });
  }
});

// list all tasks
app.get('/tasks', ensureLogin, async (req, res) => {
  try {
    const tasks = await Task.findAll({
      where: { userId: req.session.user.id },
      order: [['createdAt', 'ASC']],
    });
    res.render('tasks', { tasks });
  } catch (err) {
    console.log('Tasks error:', err);
    res.render('tasks', { tasks: [] });
  }
});

// show add-task form
app.get('/tasks/add', ensureLogin, (req, res) => {
  res.render('task-add', { error: null });
});

// create new task
app.post('/tasks/add', ensureLogin, async (req, res) => {
  const { title, description, dueDate } = req.body;

  if (!title) {
    return res.render('task-add', { error: 'Title is required.' });
  }

  try {
    await Task.create({
      title,
      description: description || null,
      dueDate: dueDate || null,
      status: 'pending',
      userId: req.session.user.id,
    });

    res.redirect('/tasks');
  } catch (err) {
    console.log('Add task error:', err);
    res.render('task-add', { error: 'Could not create task.' });
  }
});

// show edit form
app.get('/tasks/edit/:id', ensureLogin, async (req, res) => {
  try {
    const task = await Task.findOne({
      where: { id: req.params.id, userId: req.session.user.id },
    });

    if (!task) {
      return res.redirect('/tasks');
    }

    res.render('task-edit', { task, error: null });
  } catch (err) {
    console.log('Edit task GET error:', err);
    res.redirect('/tasks');
  }
});

// update task
app.post('/tasks/edit/:id', ensureLogin, async (req, res) => {
  const { title, description, dueDate, status } = req.body;

  try {
    await Task.update(
      {
        title,
        description: description || null,
        dueDate: dueDate || null,
        status: status || 'pending',
      },
      {
        where: { id: req.params.id, userId: req.session.user.id },
      }
    );

    res.redirect('/tasks');
  } catch (err) {
    console.log('Edit task POST error:', err);
    res.render('task-edit', {
      task: { id: req.params.id, title, description, dueDate, status },
      error: 'Could not update task.',
    });
  }
});

// delete task
app.post('/tasks/delete/:id', ensureLogin, async (req, res) => {
  try {
    await Task.destroy({
      where: { id: req.params.id, userId: req.session.user.id },
    });
    res.redirect('/tasks');
  } catch (err) {
    console.log('Delete task error:', err);
    res.redirect('/tasks');
  }
});

// update status only (eg. mark complete)
app.post('/tasks/status/:id', ensureLogin, async (req, res) => {
  const { status } = req.body; // e.g. "complete" or "pending"
  try {
    await Task.update(
      { status },
      { where: { id: req.params.id, userId: req.session.user.id } }
    );
    res.redirect('/tasks');
  } catch (err) {
    console.log('Status update error:', err);
    res.redirect('/tasks');
  }
});

/* ---------------------- 404 ---------------------------- */

app.use((req, res) => {
  res.status(404).send('Page Not Found');
});

/* -------------------- START SERVER --------------------- */

app.listen(HTTP_PORT, () => {
  console.log(`Server listening on port ${HTTP_PORT}`);
});
