// === S&A 4D Playback Extension ===
// Author: Meer & ChatGPT (2025 Edition)
// Description: Adds smooth 4D schedule playback with Apple-style transitions.

class FourDPlayback extends Autodesk.Viewing.Extension {
  constructor(viewer, options) {
    super(viewer, options);
    this.viewer = viewer;
    this.schedule = null;
    this.playing = false;
    this.currentIdx = 0;
    this.interval = null;
    this.activeColor = new THREE.Vector4(0.0, 0.55, 1.0, 0.7); // S&A blue
    this.inactiveColor = new THREE.Vector4(0.8, 0.8, 0.8, 0.05); // faint grey
  }

  load() {
    console.log("✅ FourDPlayback Extension loaded.");
    return true;
  }

  unload() {
    console.log("❎ FourDPlayback Extension unloaded.");
    this.stop();
    return true;
  }

  /**
   * Initialize a schedule dataset
   * @param {Object} schedule { urn, tasks: [...] }
   */
  async initSchedule(schedule) {
    this.schedule = schedule;
    this.viewer.clearThemingColors();
    this.currentIdx = 0;
    console.log(`📅 Loaded schedule with ${schedule.tasks.length} tasks.`);
  }

  /**
   * Highlight elements active during a given date
   * @param {Date} date
   */
  highlightActive(date) {
    if (!this.schedule) return;
    const { tasks } = this.schedule;
    this.viewer.clearThemingColors();

    const activeTasks = tasks.filter(
      (t) => date >= new Date(t.start)
    );

    activeTasks.forEach((t) => {
      if (t.elements && t.elements.length > 0) {
        t.elements.forEach((dbId) =>
          this.viewer.setThemingColor(dbId, this.activeColor)
        );
      }
    });

    // Subtle background fade for inactive context
    this.viewer.impl.sceneUpdated(true);
  }

  /**
   * Sequential playback
   */
  play(speed = 800) {
    if (!this.schedule) {
      alert("No schedule loaded.");
      return;
    }

    if (this.playing) {
      this.stop();
      return;
    }

    this.playing = true;
    this.currentIdx = 0;

    const tasks = [...this.schedule.tasks].sort(
      (a, b) => new Date(a.start) - new Date(b.start)
    );

    const animateStep = () => {
      if (!this.playing || this.currentIdx >= tasks.length) {
        this.stop();
        return;
      }

      const current = tasks[this.currentIdx];
      this.highlightActive(new Date(current.start));

      // Display active task info overlay
      this.showTaskHUD(current);

      this.currentIdx++;
      this.interval = setTimeout(animateStep, speed);
    };

    this.fadeHUD("Playback started", "rgba(0,0,0,0.8)");
    animateStep();
  }

  stop() {
    this.playing = false;
    if (this.interval) clearTimeout(this.interval);
    this.viewer.clearThemingColors();
    this.fadeHUD("Playback stopped", "rgba(80,0,0,0.6)");
  }

  /**
   * Minimalistic task info overlay
   */
  showTaskHUD(task) {
    let hud = document.getElementById("task-hud");
    if (!hud) {
      hud = document.createElement("div");
      hud.id = "task-hud";
      hud.style.position = "fixed";
      hud.style.bottom = "90px";
      hud.style.left = "50%";
      hud.style.transform = "translateX(-50%)";
      hud.style.padding = "12px 24px";
      hud.style.borderRadius = "14px";
      hud.style.backdropFilter = "blur(10px)";
      hud.style.fontFamily = "Inter, sans-serif";
      hud.style.fontSize = "14px";
      hud.style.color = "#fff";
      hud.style.background = "rgba(0,0,0,0.6)";
      hud.style.transition = "opacity .4s ease";
      hud.style.opacity = "0";
      hud.style.zIndex = "9999";
      document.body.appendChild(hud);
    }

    hud.innerHTML = `<strong>${task.name}</strong><br>
      ${new Date(task.start).toLocaleDateString()} – ${new Date(task.end).toLocaleDateString()}`;
    hud.style.opacity = "1";
    setTimeout(() => (hud.style.opacity = "0"), 1200);
  }

  fadeHUD(message, bg = "rgba(0,0,0,0.8)") {
    let hud = document.getElementById("fourd-hud");
    if (!hud) {
      hud = document.createElement("div");
      hud.id = "fourd-hud";
      hud.style.position = "fixed";
      hud.style.top = "80px";
      hud.style.left = "50%";
      hud.style.transform = "translateX(-50%)";
      hud.style.padding = "8px 16px";
      hud.style.borderRadius = "12px";
      hud.style.fontFamily = "Inter, sans-serif";
      hud.style.fontSize = "13px";
      hud.style.color = "#fff";
      hud.style.transition = "opacity .4s ease";
      hud.style.zIndex = "9999";
      document.body.appendChild(hud);
    }
    hud.style.background = bg;
    hud.innerText = message;
    hud.style.opacity = "1";
    setTimeout(() => (hud.style.opacity = "0"), 1000);
  }
}

Autodesk.Viewing.theExtensionManager.registerExtension(
  "FourDPlayback",
  FourDPlayback
);
