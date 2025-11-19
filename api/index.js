const express = require('express');
const path = require('path');

let app = express();

// Serve static files from wwwroot
app.use(express.static(path.join(__dirname, '../wwwroot')));

// Add routes
app.use(require('../routes/auth.js'));
app.use(require('../routes/models.js'));
app.use(require('../routes/schedule.js'));

// Export the Express app for Vercel
module.exports = app;
