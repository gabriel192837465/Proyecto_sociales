const { execSync } = require("child_process");

const PORT = process.env.PORT || 3000;

if (process.platform === "win32") {
  try {
    const out = execSync(`netstat -ano | findstr :${PORT}`, { encoding: "utf8" });
    const pids = new Set();
    for (const line of out.split("\n")) {
      if (!line.includes("LISTENING")) continue;
      const pid = line.trim().split(/\s+/).pop();
      if (pid && pid !== "0") pids.add(pid);
    }
    for (const pid of pids) {
      try {
        execSync(`taskkill /PID ${pid} /F`, { stdio: "ignore" });
        console.log(`Proceso ${pid} detenido (puerto ${PORT}).`);
      } catch { /* ya terminó */ }
    }
    if (!pids.size) console.log(`Nada escuchando en el puerto ${PORT}.`);
  } catch {
    console.log(`Puerto ${PORT} libre.`);
  }
} else {
  try {
    execSync(`lsof -ti :${PORT} | xargs kill -9`, { stdio: "inherit" });
  } catch {
    console.log(`Puerto ${PORT} libre.`);
  }
}
