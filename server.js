const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASS = process.env.ADMIN_PASS || "080970";

app.use(express.static("public"));
app.get("/health", (_, res) => res.json({ ok: true }));

const players = new Map();
const banned = new Set();
const weapons = [
  { id: "rifle", name: "Rifle", damage: 25 },
  { id: "sniper", name: "Sniper", damage: 80 },
  { id: "shotgun", name: "Shotgun", damage: 45 }
];

function publicPlayers() {
  return [...players.values()].map(p => ({
    id: p.id, name: p.name, x: p.x, y: p.y, z: p.z,
    hp: p.hp, team: p.team, weapon: p.weapon, kills: p.kills, deaths: p.deaths
  }));
}
function broadcast() { io.emit("players:update", publicPlayers()); }

io.on("connection", socket => {
  socket.on("login", ({ name } = {}, reply = () => {}) => {
    name = String(name || "").trim().slice(0, 16);
    if (!/^[\p{L}\p{N}_-]{3,16}$/u.test(name)) return reply({ ok:false, error:"ชื่อ 3–16 ตัวอักษร ใช้ตัวอักษร/ตัวเลข/_/-" });
    if (banned.has(name.toLowerCase())) return reply({ ok:false, error:"บัญชีนี้ถูกระงับการเข้าเล่น" });
    if ([...players.values()].some(p => p.name.toLowerCase() === name.toLowerCase())) return reply({ ok:false, error:"ชื่อนี้มีผู้ใช้งานแล้ว" });
    players.set(socket.id, { id:socket.id, name, x:0, y:1.6, z:0, hp:100, team:Math.random()>.5?"RED":"BLUE", weapon:"rifle", kills:0, deaths:0, lastShot:0, inventory:["rifle"] });
    socket.data.loggedIn = true;
    reply({ ok:true, player:players.get(socket.id), weapons });
    broadcast();
  });

  socket.on("admin:login", ({ username, password } = {}, reply = () => {}) => {
    if (!socket.data.loggedIn) return reply({ ok:false, error:"กรุณาเข้าเกมก่อน" });
    if (String(username || "").trim().toLowerCase() === ADMIN_USER.toLowerCase() && password === ADMIN_PASS) {
      socket.data.admin = true;
      return reply({ ok:true });
    }
    reply({ ok:false, error:"ชื่อหรือรหัสผ่านแอดมินไม่ถูกต้อง" });
  });

  socket.on("player:move", data => {
    const p = players.get(socket.id); if (!p || !data) return;
    p.x = Math.max(-45, Math.min(45, Number(data.x) || 0));
    p.y = 1.6;
    p.z = Math.max(-45, Math.min(45, Number(data.z) || 0));
    broadcast();
  });

  socket.on("player:weapon", id => {
    const p = players.get(socket.id); if (!p || !p.inventory.includes(id)) return;
    p.weapon = id; socket.emit("weapon:changed", id);
  });

  socket.on("player:shoot", targetId => {
    const p = players.get(socket.id), target = players.get(targetId);
    if (!p || !target || target.id === p.id || Date.now()-p.lastShot < 180) return;
    p.lastShot = Date.now();
    const w = weapons.find(x => x.id === p.weapon) || weapons[0];
    target.hp -= w.damage;
    if (target.hp <= 0) {
      p.kills++; target.deaths++; target.hp = 100; target.x = Math.random()*12-6; target.z = Math.random()*12-6;
    }
    io.emit("combat:feed", { text: target.hp === 100 ? `${p.name} กำจัด ${target.name}` : `${p.name} ยิง ${target.name}` });
    broadcast();
  });

  socket.on("admin:action", (payload = {}, reply = () => {}) => {
    if (!socket.data.admin) return reply({ ok:false, error:"ไม่มีสิทธิ์แอดมิน" });
    const { action, targetId, value } = payload;
    const target = players.get(targetId);
    if (action === "grant" && target) {
      target.inventory = [...new Set([...target.inventory, String(value || "rifle")])];
      io.to(targetId).emit("admin:notice", `แอดมินมอบ ${value} ให้คุณ`);
    } else if (action === "heal" && target) target.hp = 100;
    else if (action === "ban" && target) {
      banned.add(target.name.toLowerCase());
      io.to(targetId).emit("account:banned");
      io.sockets.sockets.get(targetId)?.disconnect(true);
    } else if (action === "kick" && target) io.sockets.sockets.get(targetId)?.disconnect(true);
    else if (action === "teleport" && target) {
      const me = players.get(socket.id); target.x = me.x; target.z = me.z;
    } else if (action === "weapon:add" && value && !weapons.some(w => w.id === value.id)) weapons.push(value);
    else return reply({ ok:false, error:"คำสั่งไม่ถูกต้องหรือไม่พบผู้เล่น" });
    broadcast(); reply({ ok:true });
  });

  socket.on("disconnect", () => { players.delete(socket.id); broadcast(); });
});

server.listen(PORT, () => console.log(`PB-style FPS running on port ${PORT}`));