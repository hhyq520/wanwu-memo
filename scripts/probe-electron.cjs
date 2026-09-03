const electron = require("electron");
console.log("typeof", typeof electron);
console.log("keys", Object.keys(electron).slice(0, 20));
console.log("app", typeof electron.app);
console.log("default", electron.default && typeof electron.default.app);
if (!electron.app) {
  process.exit(2);
}
electron.app.whenReady().then(() => {
  console.log("ready");
  electron.app.quit();
});
