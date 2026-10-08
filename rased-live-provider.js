(function(){
  "use strict";

  const SETTINGS_COLLECTION="systemSettings";
  const SETTINGS_DOC="liveMeetingProvider";
  let cachedConfig=null;
  let externalApiPromise=null;

  function safe(v){return String(v??"").trim()}
  function roomKey(prefix,id){
    return (safe(prefix||"rased")+"-"+safe(id||Date.now()))
      .replace(/[^a-zA-Z0-9_-]/g,"-")
      .replace(/-+/g,"-")
      .slice(0,120);
  }
  function replaceAllTemplate(template,values){
    let out=String(template||"");
    Object.entries(values||{}).forEach(([k,v])=>{
      out=out.split("{"+k+"}").join(encodeURIComponent(String(v??"")));
    });
    return out;
  }
  async function loadConfig(db,force=false){
    if(cachedConfig&&!force)return cachedConfig;
    const doc=await db.collection(SETTINGS_COLLECTION).doc(SETTINGS_DOC).get();
    cachedConfig=doc.exists?{id:doc.id,...(doc.data()||{})}:{type:"none"};
    return cachedConfig;
  }
  function clearConfigCache(){cachedConfig=null}
  function configStatus(cfg){
    const type=safe(cfg?.type||"none").toLowerCase();
    if(type==="jaas"){
      if(!safe(cfg?.jaasAppId))return {ready:false,message:"أدخل JaaS App ID."};
      if(!safe(cfg?.tokenEndpoint))return {ready:false,message:"أدخل رابط خدمة إصدار JaaS JWT."};
      return {ready:true,message:"JaaS جاهز للعمل داخل راصد."};
    }
    if(type==="iframe"){
      if(!safe(cfg?.embedUrlTemplate)||!String(cfg.embedUrlTemplate).includes("{room}")){
        return {ready:false,message:"أدخل رابط تضمين يحتوي على {room}."};
      }
      return {ready:true,message:"مزود التضمين المخصص جاهز."};
    }
    return {ready:false,message:"لم يتم إعداد مزود القاعات المباشرة بعد."};
  }
  function loadExternalApi(){
    if(window.JitsiMeetExternalAPI)return Promise.resolve();
    if(externalApiPromise)return externalApiPromise;
    externalApiPromise=new Promise((resolve,reject)=>{
      const s=document.createElement("script");
      s.src="https://8x8.vc/external_api.js";
      s.async=true;
      s.onload=()=>window.JitsiMeetExternalAPI?resolve():reject(new Error("تعذر تشغيل JaaS External API."));
      s.onerror=()=>reject(new Error("تعذر تحميل مكتبة JaaS من 8x8.vc."));
      document.head.appendChild(s);
    });
    return externalApiPromise;
  }
  async function requestJaasToken(cfg,payload){
    const res=await fetch(cfg.tokenEndpoint,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify(payload)
    });
    const text=await res.text();
    let data=null;
    try{data=text?JSON.parse(text):null}catch{data=text}
    if(!res.ok)throw new Error(data?.message||data?.error||text||("HTTP "+res.status));
    const token=typeof data==="string"?data:(data?.token||data?.jwt||"");
    if(!token)throw new Error("خدمة التوكن لم ترجع token/JWT صالحًا.");
    return token;
  }
  async function mount(opts){
    const {
      db,container,roomKey:rk,user={},role="participant",context={},
      onJoined=()=>{},onLeft=()=>{},onError=()=>{}
    }=opts||{};
    if(!db)throw new Error("Firestore db مطلوب.");
    if(!container)throw new Error("حاوية القاعة غير موجودة.");
    const cfg=await loadConfig(db,true);
    const status=configStatus(cfg);
    if(!status.ready)throw new Error(status.message);
    const key=roomKey("room",rk||Date.now());
    container.innerHTML="";

    if(String(cfg.type).toLowerCase()==="jaas"){
      await loadExternalApi();
      const token=await requestJaasToken(cfg,{
        roomName:key,
        role,
        user:{
          id:safe(user.id||user.email||"guest"),
          name:safe(user.name||user.email||"مستخدم راصد"),
          email:safe(user.email||"")
        },
        context
      });
      const appId=safe(cfg.jaasAppId).replace(/^\/+|\/+$/g,"");
      const fullRoom=appId+"/"+key;
      const api=new window.JitsiMeetExternalAPI("8x8.vc",{
        roomName:fullRoom,
        jwt:token,
        parentNode:container,
        width:"100%",
        height:"100%",
        userInfo:{displayName:user.name||user.email||"مستخدم راصد",email:user.email||""},
        configOverwrite:{
          prejoinPageEnabled:false,
          disableDeepLinking:true,
          startWithAudioMuted:role==="observer",
          startWithVideoMuted:role==="observer"
        },
        interfaceConfigOverwrite:{MOBILE_APP_PROMO:false}
      });
      let joined=false;
      api.addEventListener("videoConferenceJoined",e=>{joined=true;onJoined({mode:"jaas",event:e})});
      api.addEventListener("videoConferenceLeft",e=>{if(joined)onLeft({mode:"jaas",event:e});joined=false});
      api.addEventListener("readyToClose",e=>{if(joined)onLeft({mode:"jaas",event:e});joined=false});
      return {
        mode:"jaas",
        roomKey:key,
        dispose(){try{api.dispose()}catch{} if(joined){try{onLeft({mode:"jaas",reason:"dispose"})}catch{}} joined=false;container.innerHTML="";}
      };
    }

    if(String(cfg.type).toLowerCase()==="iframe"){
      const url=replaceAllTemplate(cfg.embedUrlTemplate,{
        room:key,
        name:user.name||user.email||"Rased User",
        email:user.email||"",
        role,
        userId:user.id||user.email||"",
        classId:context.classId||"",
        courseId:context.courseId||""
      });
      const iframe=document.createElement("iframe");
      iframe.src=url;
      iframe.allow="camera; microphone; fullscreen; display-capture; autoplay";
      iframe.referrerPolicy="strict-origin-when-cross-origin";
      iframe.style.cssText="width:100%;height:100%;border:0;display:block;background:#000";
      let joined=false;
      iframe.onload=()=>{
        joined=true;
        onJoined({mode:"iframe-estimated",event:null});
      };
      iframe.onerror=e=>{onError(e)};
      container.appendChild(iframe);
      return {
        mode:"iframe-estimated",
        roomKey:key,
        dispose(){if(joined){try{onLeft({mode:"iframe-estimated",reason:"dispose"})}catch{}} joined=false;iframe.remove();container.innerHTML="";}
      };
    }

    throw new Error("نوع مزود القاعة غير مدعوم.");
  }

  window.RasedLiveProvider={
    SETTINGS_COLLECTION,SETTINGS_DOC,
    roomKey,loadConfig,clearConfigCache,configStatus,mount
  };
})();
