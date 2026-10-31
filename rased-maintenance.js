/* Rased central maintenance mode — shared runtime */
(function(){
  "use strict";

  const FIREBASE_CONFIG={
    apiKey:"AIzaSyAfgSV-6IMkXncgPWxY69omKfvFtGakgk",
    authDomain:"results2026-7c0dd.firebaseapp.com",
    projectId:"results2026-7c0dd",
    storageBucket:"results2026-7c0dd.firebasestorage.app",
    messagingSenderId:"241421115694",
    appId:"1:241421115694:web:96f55fd9fd1d5b18b31abf"
  };
  const COLLECTION="systemSettings";
  const DOCUMENT="maintenance";
  const OVERLAY_ID="rasedMaintenanceOverlay";

  function role(){
    try{
      return String(
        sessionStorage.getItem("currentUserRole") ||
        localStorage.getItem("currentUserRole") ||
        ""
      ).trim().toLowerCase();
    }catch(e){ return ""; }
  }

  function isBypassed(){
    return window.RASED_MAINTENANCE_BYPASS===true ||
      role()==="admin" || role()==="superadmin" ||
      /(?:^|\/)admin\.html$/i.test(String(location.pathname||""));
  }

  function isMaintenanceActive(data){
    // Manual control only: ignore any previously saved schedules and end times.
    return Boolean(data && data.enabled===true && data.scheduled!==true && !data.startAt);
  }

  function ensureStyles(){
    if(document.getElementById("rasedMaintenanceStyles"))return;
    const style=document.createElement("style");
    style.id="rasedMaintenanceStyles";
    style.textContent=
      "#rasedMaintenanceOverlay{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:22px;background:linear-gradient(135deg,#063b31,#0b6756);font-family:Tahoma,Arial,sans-serif;direction:rtl;text-align:center;color:#fff}"+
      "#rasedMaintenanceOverlay .rased-maintenance-box{width:min(680px,94vw);padding:42px 28px;border:1px solid rgba(255,255,255,.28);border-radius:24px;background:rgba(0,0,0,.18);box-shadow:0 20px 70px rgba(0,0,0,.28)}"+
      "#rasedMaintenanceOverlay .rased-maintenance-school-logo{display:block;width:clamp(76px,15vw,108px);height:clamp(76px,15vw,108px);object-fit:contain;background:white;border:3px solid #d7b466;border-radius:50%;padding:6px;margin:0 auto 16px;box-shadow:0 9px 24px rgba(0,0,0,.22)}"+
      "#rasedMaintenanceOverlay .rased-maintenance-icon{font-size:46px;line-height:1;margin-bottom:12px}"+
      "#rasedMaintenanceOverlay h1{margin:0 0 16px;font-size:clamp(24px,4vw,40px);color:#f7d77a}"+
      "#rasedMaintenanceOverlay .rased-maintenance-message{margin:0 auto 25px;white-space:pre-wrap;font-size:clamp(24px,3.4vw,34px);line-height:1.6;color:#ff7474;font-weight:900;text-shadow:0 2px 10px rgba(0,0,0,.35)}"+
      "#rasedMaintenanceOverlay .rased-maintenance-credit{padding-top:18px;border-top:1px solid rgba(255,255,255,.22);font-size:14px;font-weight:bold;color:#fff}"+
      "#rasedMaintenanceOverlay .rased-maintenance-admin-link{display:inline-flex;align-items:center;justify-content:center;margin-top:18px;padding:9px 18px;background:#fff9e9;color:#075343;border:1px solid #dbb65d;border-radius:12px;font:bold 13px Tahoma,Arial,sans-serif;text-decoration:none;box-shadow:0 4px 12px rgba(0,0,0,.17)}"+
      "#rasedMaintenanceOverlay .rased-maintenance-admin-link:focus-visible{outline:3px solid #f2d277;outline-offset:3px}"+
      "body.rased-maintenance-active{overflow:hidden}";
    document.head.appendChild(style);
  }

  function removeOverlay(){
    document.getElementById(OVERLAY_ID)?.remove();
    document.body?.classList.remove("rased-maintenance-active");
  }

  function showOverlay(data){
    if(isBypassed()){removeOverlay();return;}
    ensureStyles();
    let overlay=document.getElementById(OVERLAY_ID);
    if(!overlay){
      overlay=document.createElement("div");
      overlay.id=OVERLAY_ID;
      overlay.setAttribute("role","alertdialog");
      overlay.setAttribute("aria-modal","true");
      overlay.innerHTML=
        "<div class=\"rased-maintenance-box\">"+
        "<img class=\"rased-maintenance-school-logo\" src=\"logo.jpeg\" alt=\"شعار مدارس الفلاح الأهلية\">"+
        "<div class=\"rased-maintenance-icon\">🛠️</div>"+
        "<h1>الموقع مغلق مؤقتًا</h1>"+
        "<p class=\"rased-maintenance-message\"></p>"+
        
        "<div class=\"rased-maintenance-credit\">محمد عامر أحمد</div>"+
        (["/teacher.html","/supervisor-dashboard.html","/supervisor.html"].some(p=>String(location.pathname||"").endsWith(p))?
         "<a class=\"rased-maintenance-admin-link\" href=\"https://rasededu.online/rased/admin-login.html\">🔐 لوحة الإدارة</a>":"")+
        "</div>";
      document.body.appendChild(overlay);
    }
    overlay.querySelector(".rased-maintenance-message").textContent=
      String(data?.message||"الموقع مغلق للتحسين أو الصيانة.");
    document.body.classList.add("rased-maintenance-active");
  }

  function render(data){
    const active=isMaintenanceActive(data);
    if(active)showOverlay(data);
    else removeOverlay();
    window.dispatchEvent(new CustomEvent("rased:maintenance",{
      detail:{active,data:data||null}
    }));
  }

  function loadScript(src){
    return new Promise((resolve,reject)=>{
      const existing=[...document.scripts].find(s=>s.src===src);
      if(existing){existing.addEventListener("load",resolve,{once:true});if(window.firebase)resolve();return;}
      const tag=document.createElement("script");tag.src=src;tag.onload=resolve;tag.onerror=reject;document.head.appendChild(tag);
    });
  }
  async function start(){
    if(isBypassed())return;
    try{
      try{const local=JSON.parse(localStorage.getItem("rased.maintenance.v1")||"null");if(local)render(local)}catch(e){}

      if(!window.firebase){
        await loadScript("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
        await loadScript("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore-compat.js");
      }else if(!firebase.firestore){
        await loadScript("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore-compat.js");
      }
      if(!firebase.apps||!firebase.apps.length)firebase.initializeApp(FIREBASE_CONFIG);
      const store=firebase.firestore();
      store.collection(COLLECTION).doc(DOCUMENT).onSnapshot(
        snap=>render(snap.exists?snap.data():null),
        ()=>removeOverlay()
      );
    }catch(error){
      console.warn("[Rased maintenance] fail-open",error);
      removeOverlay();
    }
  }

  window.rasedMaintenanceIsActive=isMaintenanceActive;
  window.rasedMaintenanceRender=render;

  const boot=()=>{
    if(document.body)start();
    else setTimeout(boot,100);
  };
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});
  else boot();
})();