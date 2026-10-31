/* AlFalah Rased: context-aware back link for teacher/supervisor service pages. */
(function(){
 "use strict";
 const current=String(location.pathname||"");
 if(/\/(?:teacher|supervisor-dashboard|admin|admin-login|student)\.html$/i.test(current))return;
 const sessionRole=(()=>{try{return String(sessionStorage.getItem("currentUserRole")||"").toLowerCase().trim()}catch(e){return ""}})();
 const localRole=(()=>{try{return String(localStorage.getItem("currentUserRole")||"").toLowerCase().trim()}catch(e){return ""}})();
 let role=sessionRole||localRole;
 if(role!=="teacher"&&role!=="supervisor"){
  try{
   const gate=JSON.parse(localStorage.getItem("alfalah.gate.session.v1")||"null");
   if(gate&&Number(gate.expiresAt)>Date.now())role=String(gate.rasedRole||"").toLowerCase().trim();
  }catch(e){}
 }
 if(role!=="teacher"&&role!=="supervisor")return;
 const target=role==="teacher"
  ?"https://rasededu.online/rased/teacher.html"
  :"https://rasededu.online/rased/supervisor-dashboard.html";
 const label=role==="teacher"?"العودة لبوابة المعلم":"العودة لبوابة المشرف";
 function init(){
  if(document.getElementById("rasedPortalBackHome"))return;
  const style=document.createElement("style");
  style.id="rasedPortalBackHomeStyle";
  style.textContent="#rasedPortalBackHome{position:fixed;bottom:max(13px,env(safe-area-inset-bottom));left:max(13px,env(safe-area-inset-left));z-index:9900;display:inline-flex;align-items:center;justify-content:center;gap:6px;max-width:calc(100vw - 26px);padding:10px 15px;border:1px solid #c9972c;border-radius:12px;background:#075343;color:#fff!important;text-decoration:none!important;font:800 13px Tahoma,Arial,sans-serif;box-shadow:0 5px 20px rgba(0,0,0,.2);direction:rtl}#rasedPortalBackHome:hover,#rasedPortalBackHome:focus-visible{background:#087661;outline:2px solid #d5b263;outline-offset:2px}@media(max-width:600px){#rasedPortalBackHome{bottom:max(9px,env(safe-area-inset-bottom));left:max(9px,env(safe-area-inset-left));font-size:12px;padding:9px 12px}}@media print{#rasedPortalBackHome{display:none!important}}";
  document.head.appendChild(style);
  const link=document.createElement("a");link.id="rasedPortalBackHome";link.href=target;link.textContent="↩ "+label;link.setAttribute("aria-label",label);
  document.body.appendChild(link);
 }
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();
