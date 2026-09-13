const fs = require("fs");
const path = require("path");

module.exports = async () => {
  const p = path.resolve(__dirname, "../../data/estado-juego.json");
  if (fs.existsSync(p)) {
    fs.unlinkSync(p);
  }
};
