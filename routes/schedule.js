// routes/schedule.js
const express = require("express");
const formidable = require("express-formidable");
const fs = require("fs");
const csv = require("csv-parser");
const path = require("path");

const router = express.Router();
const SCHEDULE_DIR = path.join(__dirname, "../schedules");
if (!fs.existsSync(SCHEDULE_DIR)) fs.mkdirSync(SCHEDULE_DIR);

router.post("/api/schedule/:urn", formidable(), async (req, res, next) => {
  const file = req.files["schedule-file"];
  if (!file) return res.status(400).send("Missing schedule-file");

  const tasks = [];
  fs.createReadStream(file.path)
    .pipe(csv())
    .on("data", (row) => {
      if (row["Task Name"] && row["Start"] && row["Finish"])
        tasks.push({
          id: row["ID"] || row["Task ID"] || row["Task Name"],
          name: row["Task Name"],
          start: new Date(row["Start"]),
          end: new Date(row["Finish"]),
          elements: [], // link later
        });
    })
    .on("end", () => {
      const f = path.join(SCHEDULE_DIR, `${req.params.urn}.json`);
      fs.writeFileSync(f, JSON.stringify({ urn: req.params.urn, tasks }, null, 2));
      res.json({ ok: true, tasks });
    })
    .on("error", next);
});

router.get("/api/schedule/:urn", async (req, res, next) => {
  try {
    const f = path.join(SCHEDULE_DIR, `${req.params.urn}.json`);
    if (!fs.existsSync(f)) return res.status(404).send("No schedule");
    res.json(JSON.parse(fs.readFileSync(f)));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
