// wwwroot/schedule.js
export async function uploadSchedule(urn) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".csv";
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const form = new FormData();
    form.append("schedule-file", file);
    const resp = await fetch(`/api/schedule/${urn}`, { method: "POST", body: form });
    const data = await resp.json();
    if (data.ok) {
      alert(`Uploaded ${data.tasks.length} tasks`);
      return data;
    }
  };
  input.click();
}