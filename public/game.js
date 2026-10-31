import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
const socket=io();
const $=id=>document.getElementById(id);
let me=null, isAdmin=false, players={}, meshes={}, yaw=0, pitch=0, move={forward:false,back:false,left:false,right:false}, selected=null;
let scene,camera,renderer,clock, velocity=0, lastSend=0;
function show(id){$(id).classList.remove("hidden")}function hide(id){$(id).classList.add("hidden")}
$("playBtn").onclick=()=>socket.emit("login",{name:$("playerName").value},r=>{if(!r.ok){$("loginError").textContent=r.error;return}me=r.player;hide("login");show("game");$("playerLabel").textContent=me.name;initGame();});
$("adminOpen").onclick=()=>show("adminLogin");$("adminCancel").onclick=()=>hide("adminLogin");
$("adminLoginBtn").onclick=()=>socket.emit("admin:login",{username:$("adminUser").value,password:$("adminPass").value},r=>{if(!r.ok){$("adminError").textContent=r.error;return}isAdmin=true;hide("adminLogin");show("adminToggle");});
$("adminToggle").onclick=()=>{renderAdmin();show("adminPanel")};$("closeAdmin").onclick=()=>hide("adminPanel");
function initGame(){
 scene=new THREE.Scene();scene.background=new THREE.Color(0x9bb1c5);scene.fog=new THREE.Fog(0x9bb1c5,35,100);
 camera=new THREE.PerspectiveCamera(75,innerWidth/innerHeight,.1,200);camera.position.set(0,1.6,0);
 renderer=new THREE.WebGLRenderer({canvas:$("gameCanvas"),antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(innerWidth,innerHeight);
 scene.add(new THREE.HemisphereLight(0xffffff,0x536273,2));
 const sun=new THREE.DirectionalLight(0xffffff,2);sun.position.set(10,20,5);scene.add(sun);
 const floor=new THREE.Mesh(new THREE.PlaneGeometry(110,110),new THREE.MeshStandardMaterial({color:0x66715e}));floor.rotation.x=-Math.PI/2;floor.position.y=-.05;scene.add(floor);
 const grid=new THREE.GridHelper(100,50,0x37483c,0x59664e);grid.position.y=.01;scene.add(grid);
 const wallmat=new THREE.MeshStandardMaterial({color:0x697887});
 for(let i=0;i<18;i++){let x=(Math.random()-.5)*65,z=(Math.random()-.5)*65;let b=new THREE.Mesh(new THREE.BoxGeometry(3+Math.random()*3,2+Math.random()*3,3),wallmat);b.position.set(x,b.geometry.parameters.height/2,z);scene.add(b)}
 clock=new THREE.Clock();animate();
 $("gameCanvas").addEventListener("click",()=>{if(innerWidth>700)$("gameCanvas").requestPointerLock?.()});
 document.addEventListener("mousemove",e=>{if(document.pointerLockElement===$("gameCanvas")){yaw-=e.movementX*.002;pitch=Math.max(-1.2,Math.min(1.2,pitch-e.movementY*.002));}});
 document.addEventListener("keydown",e=>{if(e.code==="KeyW")move.forward=true;if(e.code==="KeyS")move.back=true;if(e.code==="KeyA")move.left=true;if(e.code==="KeyD")move.right=true;if(e.code==="Space")velocity=5;if(e.code==="KeyF")shoot();});
 document.addEventListener("keyup",e=>{if(e.code==="KeyW")move.forward=false;if(e.code==="KeyS")move.back=false;if(e.code==="KeyA")move.left=false;if(e.code==="KeyD")move.right=false;});
 document.querySelectorAll("[data-move]").forEach(b=>{let k=b.dataset.move;b.addEventListener("pointerdown",e=>{e.preventDefault();move[k]=true});["pointerup","pointerleave","pointercancel"].forEach(ev=>b.addEventListener(ev,()=>move[k]=false));});
 $("fire").onpointerdown=shoot;
 $("jump").onpointerdown=()=>velocity=5;
 addEventListener("resize",()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});
}
function makePlayer(p){let g=new THREE.Group();let body=new THREE.Mesh(new THREE.CapsuleGeometry(.42,.8,4,8),new THREE.MeshStandardMaterial({color:p.team==="RED"?0xb94339:0x3673bd}));body.position.y=1;g.add(body);let head=new THREE.Mesh(new THREE.SphereGeometry(.24,12,10),new THREE.MeshStandardMaterial({color:0xc7a17c}));head.position.y=1.72;g.add(head);scene.add(g);return g}
function animate(){
 requestAnimationFrame(animate);let dt=Math.min(clock.getDelta(),.05);
 let dir=new THREE.Vector3((move.right?1:0)-(move.left?1:0),0,(move.back?1:0)-(move.forward?1:0));dir.normalize().applyAxisAngle(new THREE.Vector3(0,1,0),yaw);
 camera.position.addScaledVector(dir,8*dt);camera.position.x=THREE.MathUtils.clamp(camera.position.x,-45,45);camera.position.z=THREE.MathUtils.clamp(camera.position.z,-45,45);
 velocity-=12*dt;camera.position.y=Math.max(1.6,camera.position.y+velocity*dt);if(camera.position.y===1.6&&velocity<0)velocity=0;
 camera.rotation.order="YXZ";camera.rotation.set(pitch,yaw,0);
 let now=performance.now();if(now-lastSend>80){socket.emit("player:move",{x:camera.position.x,z:camera.position.z});lastSend=now}
 renderer.render(scene,camera);
}
function shoot(){
 if(!me||!camera)return;
 const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(0,0),camera);
 const list=Object.entries(meshes).filter(([id])=>id!==socket.id).map(([id,obj])=>({id,obj}));
 for(const item of list){let hits=ray.intersectObject(item.obj,true);if(hits.length&&hits[0].distance<55){socket.emit("player:shoot",item.id);break}}
}
socket.on("players:update",list=>{
 list.forEach(p=>{players[p.id]=p;if(p.id===socket.id){me=p;$("hp").textContent=p.hp;$("kills").textContent=p.kills;$("deaths").textContent=p.deaths;return}
 if(scene){if(!meshes[p.id])meshes[p.id]=makePlayer(p);meshes[p.id].position.set(p.x,0,p.z);}});
 Object.keys(meshes).forEach(id=>{if(!list.some(p=>p.id===id)){scene?.remove(meshes[id]);delete meshes[id]}});
 if(isAdmin&&!$("adminPanel").classList.contains("hidden"))renderAdmin();
});
socket.on("combat:feed",x=>{let d=document.createElement("div");d.className="feeditem";d.textContent=x.text;$("feed").prepend(d);setTimeout(()=>d.remove(),3500)});
socket.on("admin:notice",x=>alert(x));socket.on("account:banned",()=>{alert("บัญชีถูกระงับ");location.reload()});
function renderAdmin(){
 $("adminPlayers").innerHTML="";
 Object.values(players).forEach(p=>{if(p.id===socket.id)return;let row=document.createElement("div");row.className="adminRow";row.innerHTML=`<strong>${p.name} • HP ${p.hp} • ${p.team}</strong>`;
 [["แจก Rifle","grant","rifle"],["ฮีล","heal",""],["วาร์ปไปหา","teleport",""],["เตะ","kick",""],["แบน","ban",""]].forEach(([label,action,value])=>{let b=document.createElement("button");b.textContent=label;b.onclick=()=>socket.emit("admin:action",{action,targetId:p.id,value},r=>{if(!r.ok)alert(r.error)});row.append(b)});$("adminPlayers").append(row)});
}
$("addWeapon").onclick=()=>{let name=$("newWeapon").value.trim();if(!name)return;let id="custom_"+Date.now();socket.emit("admin:action",{action:"weapon:add",value:{id,name,damage:30}},r=>{if(r.ok){alert("เพิ่มอาวุธแล้ว");$("newWeapon").value=""}else alert(r.error)})};