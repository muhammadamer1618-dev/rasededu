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
      out=out.split("{"+k+"}").join(
        encodeURIComponent(String(v??""))
      );
    });
    return out;
  }

  async function loadConfig(db,force=false){
    if(cachedConfig&&!force)return cachedConfig;

    const doc=await db
      .collection(SETTINGS_COLLECTION)
      .doc(SETTINGS_DOC)
      .get();

    cachedConfig=doc.exists
      ?{id:doc.id,...(doc.data()||{})}
      :{type:"none"};

    return cachedConfig;
  }

  function clearConfigCache(){
    cachedConfig=null;
  }

  function configStatus(cfg){
    const type=safe(cfg?.type||"none").toLowerCase();

    if(type==="jaas"){
      if(
        !safe(cfg?.jaasAppId) ||
        !safe(cfg?.tokenEndpoint)
      ){
        return {
          ready:true,
          demo:true,
          message:
            "الوضع التجريبي جاهز الآن للاختبار داخل راصد (مدة القاعة التجريبية محدودة)."
        };
      }

      return {
        ready:true,
        message:"JaaS جاهز للعمل داخل راصد."
      };
    }

    if(type==="iframe"){
      if(
        !safe(cfg?.embedUrlTemplate) ||
        !String(cfg.embedUrlTemplate)
          .includes("{room}")
      ){
        return {
          ready:false,
          message:
            "أدخل رابط تضمين يحتوي على {room}."
        };
      }

      return {
        ready:true,
        message:
          "مزود التضمين المخصص جاهز."
      };
    }

    return {
      ready:true,
      demo:true,
      message:
        "الوضع التجريبي جاهز الآن للاختبار داخل راصد (مدة القاعة التجريبية محدودة)."
    };
  }

  function loadExternalApi(appId){
    if(window.JitsiMeetExternalAPI){
      return Promise.resolve();
    }

    if(externalApiPromise){
      return externalApiPromise;
    }

    const cleanAppId=safe(appId)
      .replace(/^\/+|\/+$/g,"");

    if(!cleanAppId){
      return Promise.reject(
        new Error(
          "JaaS App ID غير موجود."
        )
      );
    }

    externalApiPromise=
      new Promise((resolve,reject)=>{

        const s=
          document.createElement("script");

        s.src=
          `https://8x8.vc/${encodeURIComponent(
            cleanAppId
          )}/external_api.js`;

        s.async=true;

        s.onload=()=>
          window.JitsiMeetExternalAPI
            ?resolve()
            :reject(
              new Error(
                "تعذر تشغيل JaaS External API."
              )
            );

        s.onerror=()=>reject(
          new Error(
            "تعذر تحميل مكتبة JaaS من 8x8.vc."
          )
        );

        document.head.appendChild(s);
      });

    return externalApiPromise;
  }

  let demoExternalApiPromise=null;

  function loadDemoExternalApi(force=false){
    if(window.JitsiMeetExternalAPI&&!force){
      return Promise.resolve();
    }

    if(demoExternalApiPromise&&!force){
      return demoExternalApiPromise;
    }

    demoExternalApiPromise=
      new Promise((resolve,reject)=>{

        const s=
          document.createElement("script");

        s.src=
          "https://meet.jit.si/external_api.js";

        s.async=true;

        s.onload=()=>
          window.JitsiMeetExternalAPI
            ?resolve()
            :reject(
              new Error(
                "تعذر تشغيل وضع الاختبار."
              )
            );

        s.onerror=()=>reject(
          new Error(
            "تعذر تحميل مكتبة القاعة التجريبية."
          )
        );

        document.head.appendChild(s);
      });

    return demoExternalApiPromise;
  }

  async function requestJaasToken(
    cfg,
    payload
  ){
    const res=await fetch(
      cfg.tokenEndpoint,
      {
        method:"POST",
        headers:{
          "Content-Type":
            "application/json"
        },
        body:JSON.stringify(payload)
      }
    );

    const text=
      await res.text();

    let data=null;

    try{
      data=
        text
          ?JSON.parse(text)
          :null;
    }catch{
      data=text;
    }

    if(!res.ok){
      throw new Error(
        data?.message ||
        data?.error ||
        text ||
        ("HTTP "+res.status)
      );
    }

    const token=
      typeof data==="string"
        ?data
        :(
          data?.token ||
          data?.jwt ||
          ""
        );

    if(!token){
      throw new Error(
        "خدمة التوكن لم ترجع token/JWT صالحًا."
      );
    }

    return token;
  }

  function openEmbeddedFallback(container,key,reason,user){
    container.innerHTML="";
    const notice=document.createElement("div");
    notice.style.cssText="padding:10px;background:#fff2cf;color:#583c00;font-size:13px";
    notice.textContent="تعذر الاتصال بمزود القاعات المخصص ("+reason+"). محاولة فتح القاعة داخل راصد؛ لا يُحتسب الحضور تلقائيًا في الوضع البديل.";
    const iframe=document.createElement("iframe");
    iframe.src="https://meet.jit.si/"+encodeURIComponent(key)+"#config.prejoinPageEnabled=false&config.disableDeepLinking=true&userInfo.displayName="+encodeURIComponent(String(user?.name||user?.email||"مستخدم راصد"));
    iframe.title="القاعة المباشرة داخل راصد";
    iframe.allow="camera; microphone; fullscreen; display-capture; autoplay";
    iframe.referrerPolicy="strict-origin-when-cross-origin";
    iframe.style.cssText="display:block;width:100%;height:100%;min-height:480px;border:0;background:#0b1f25";
    container.append(notice,iframe);
    return {mode:"embedded-fallback",roomKey:key,dispose(){container.innerHTML=""}};
  }

  async function mountTrackedFallback(container,key,user,role,onJoined,onLeft,onError,reason){
    try{
      await loadDemoExternalApi(true);
      container.innerHTML="";
      const notice=document.createElement("div");
      notice.style.cssText="padding:8px 10px;background:#fff5d9;color:#654400;font-size:13px";
      notice.textContent="تعذر مزود القاعات الأساسي ("+reason+"). تعمل القاعة الآن عبر مزود بديل، وسيُسجّل الدخول والخروج عند الانضمام الفعلي.";
      const frameHost=document.createElement("div");
      frameHost.style.cssText="width:100%;height:min(65vh,600px);min-height:420px;max-height:600px;background:#0b1f25;position:relative";
      container.append(notice,frameHost);
      const api=new window.JitsiMeetExternalAPI("meet.jit.si",{
        roomName:key,
        parentNode:frameHost,
        width:"100%",
        height:"100%",
        userInfo:{
          displayName:user?.name||user?.email||"مستخدم راصد",
          email:user?.email||""
        },
        configOverwrite:{
          prejoinPageEnabled:false,
          disableDeepLinking:true,
          startWithAudioMuted:role==="observer",
          startWithVideoMuted:role==="observer"
        },
        interfaceConfigOverwrite:{MOBILE_APP_PROMO:false}
      });
      let joined=false;
      const leave=(event,reasonText)=>{
        if(!joined)return;
        joined=false;
        try{onLeft({mode:"demo-fallback",event,reason:reasonText})}catch(error){console.error("Fallback room leave handler failed",error)}
      };
      api.addEventListener("videoConferenceJoined",event=>{
        if(joined)return;
        joined=true;
        try{onJoined({mode:"demo-fallback",event})}catch(error){console.error("Fallback room join handler failed",error)}
      });
      api.addEventListener("videoConferenceLeft",event=>leave(event,"conference-left"));
      api.addEventListener("readyToClose",event=>leave(event,"ready-to-close"));
      return {
        mode:"demo-fallback",
        roomKey:key,
        dispose(){
          try{api.dispose()}catch{}
          leave(null,"dispose");
          container.innerHTML="";
        }
      };
    }catch(error){
      console.error("Tracked fallback provider unavailable",error);
      try{onError(error)}catch{}
      return openEmbeddedFallback(container,key,reason,user);
    }
  }

  async function mount(opts){

    const {
      db,
      container,
      roomKey:rk,
      user={},
      role="participant",
      context={},
      onJoined=()=>{},
      onLeft=()=>{},
      onError=()=>{}
    }=opts||{};

    if(!db){
      throw new Error(
        "Firestore db مطلوب."
      );
    }

    if(!container){
      throw new Error(
        "حاوية القاعة غير موجودة."
      );
    }

    let cfg;
    try {
      cfg=await loadConfig(db,true);
    } catch(error) {
      console.warn("Room provider settings unavailable; trying default in-page room",error);
      cfg={type:"none"};
    }

    const status=
      configStatus(cfg);

    if(!status.ready){
      throw new Error(
        status.message
      );
    }

    const key=
      roomKey(
        "room",
        rk||Date.now()
      );

    container.innerHTML="";

    const cfgType=
      String(
        cfg?.type||"none"
      ).toLowerCase();

    const useDemo=
      cfgType==="none" ||
      (
        cfgType==="jaas" &&
        (
          !safe(cfg?.jaasAppId) ||
          !safe(cfg?.tokenEndpoint)
        )
      );

    if(useDemo){

      try {
        await loadDemoExternalApi();
      } catch(error) {
        console.warn("External meeting API failed; trying embedded room",error);
        const iframe=document.createElement("iframe");
        iframe.src="https://meet.jit.si/"+encodeURIComponent(key)+"#config.prejoinPageEnabled=false&config.disableDeepLinking=true&userInfo.displayName="+encodeURIComponent(String(user?.name||user?.email||"مستخدم راصد"));
        iframe.title="قاعة راصد المباشرة";
        iframe.allow="camera; microphone; fullscreen; display-capture; autoplay";
        iframe.referrerPolicy="strict-origin-when-cross-origin";
        iframe.style.cssText="width:100%;height:100%;min-height:480px;border:0;display:block;background:#0c2028";
        container.appendChild(iframe);
        const note=document.createElement("div");
        note.style.cssText="padding:8px;background:#fff5d9;color:#654400";
        note.textContent="تم تشغيل القاعة بطريقة بديلة. لا يُحتسب الحضور تلقائيًا حتى نتأكد من دخول المشارك.";
        container.prepend(note);
        return {mode:"embedded-fallback",roomKey:key,dispose(){iframe.remove();note.remove();}};
      }

      const api=
        new window.JitsiMeetExternalAPI(
          "meet.jit.si",
          {
            roomName:key,

            parentNode:
              container,

            width:"100%",
            height:"100%",

            userInfo:{
              displayName:
                user.name ||
                user.email ||
                "مستخدم راصد",

              email:
                user.email||""
            },

            configOverwrite:{
              prejoinPageEnabled:false,
              disableDeepLinking:true,

              startWithAudioMuted:
                role==="observer",

              startWithVideoMuted:
                role==="observer"
            },

            interfaceConfigOverwrite:{
              MOBILE_APP_PROMO:false
            }
          }
        );

      let joined=false;

      api.addEventListener(
        "videoConferenceJoined",
        e=>{
          joined=true;

          onJoined({
            mode:"demo",
            event:e
          });
        }
      );

      api.addEventListener(
        "videoConferenceLeft",
        e=>{
          if(joined){
            onLeft({
              mode:"demo",
              event:e
            });
          }

          joined=false;
        }
      );

      api.addEventListener(
        "readyToClose",
        e=>{
          if(joined){
            onLeft({
              mode:"demo",
              event:e
            });
          }

          joined=false;
        }
      );

      return {
        mode:"demo",
        roomKey:key,

        dispose(){

          try{
            api.dispose();
          }catch{}

          if(joined){
            try{
              onLeft({
                mode:"demo",
                reason:"dispose"
              });
            }catch{}
          }

          joined=false;

          container.innerHTML="";
        }
      };
    }

    if(
      String(cfg.type)
        .toLowerCase()
        ==="jaas"
    ){

      const appId=
        safe(cfg.jaasAppId)
          .replace(
            /^\/+|\/+$/g,
            ""
          );

      try {
        await loadExternalApi(appId);
      } catch(error) {
        console.error("JaaS External API unavailable",error);
        return mountTrackedFallback(container,key,user,role,onJoined,onLeft,onError,"مكتبة مزود القاعات");
      }

      let token;
      try { token=
        await requestJaasToken(
          cfg,
          {
            roomName:key,

            role,

            user:{
              id:safe(
                user.id ||
                user.email ||
                "guest"
              ),

              name:safe(
                user.name ||
                user.email ||
                "مستخدم راصد"
              ),

              email:safe(
                user.email||""
              )
            },

            context
          }
        );
      } catch(error) {
        console.error("JaaS token endpoint unavailable",error);
        return mountTrackedFallback(container,key,user,role,onJoined,onLeft,onError,"خدمة تصريح الدخول");
      }

      const fullRoom=
        appId+"/"+key;

      const api=
        new window.JitsiMeetExternalAPI(
          "8x8.vc",
          {
            roomName:
              fullRoom,

            jwt:
              token,

            parentNode:
              container,

            width:
              "100%",

            height:
              "100%",

            userInfo:{
              displayName:
                user.name ||
                user.email ||
                "مستخدم راصد",

              email:
                user.email||""
            },

            configOverwrite:{
              prejoinPageEnabled:false,
              disableDeepLinking:true,

              startWithAudioMuted:
                role==="observer",

              startWithVideoMuted:
                role==="observer"
            },

            interfaceConfigOverwrite:{
              MOBILE_APP_PROMO:false
            }
          }
        );

      let joined=false;

      api.addEventListener(
        "videoConferenceJoined",
        e=>{
          joined=true;

          onJoined({
            mode:"jaas",
            event:e
          });
        }
      );

      api.addEventListener(
        "videoConferenceLeft",
        e=>{
          if(joined){
            onLeft({
              mode:"jaas",
              event:e
            });
          }

          joined=false;
        }
      );

      api.addEventListener(
        "readyToClose",
        e=>{
          if(joined){
            onLeft({
              mode:"jaas",
              event:e
            });
          }

          joined=false;
        }
      );

      return {
        mode:"jaas",
        roomKey:key,

        dispose(){

          try{
            api.dispose();
          }catch{}

          if(joined){
            try{
              onLeft({
                mode:"jaas",
                reason:"dispose"
              });
            }catch{}
          }

          joined=false;

          container.innerHTML="";
        }
      };
    }

    if(
      String(cfg.type)
        .toLowerCase()
        ==="iframe"
    ){

      const url=
        replaceAllTemplate(
          cfg.embedUrlTemplate,
          {
            room:key,

            name:
              user.name ||
              user.email ||
              "Rased User",

            email:
              user.email||"",

            role,

            userId:
              user.id ||
              user.email ||
              "",

            classId:
              context.classId||"",

            courseId:
              context.courseId||""
          }
        );

      const iframe=
        document.createElement(
          "iframe"
        );

      iframe.src=url;

      iframe.allow=
        "camera; microphone; fullscreen; display-capture; autoplay";

      iframe.referrerPolicy=
        "strict-origin-when-cross-origin";

      iframe.style.cssText=
        "width:100%;height:100%;border:0;display:block;background:#000";

      let joined=false;

      iframe.onload=()=>{
        joined=true;

        onJoined({
          mode:
            "iframe-estimated",

          event:null
        });
      };

      iframe.onerror=e=>{
        onError(e);
      };

      container.appendChild(
        iframe
      );

      return {
        mode:
          "iframe-estimated",

        roomKey:key,

        dispose(){

          if(joined){
            try{
              onLeft({
                mode:
                  "iframe-estimated",

                reason:
                  "dispose"
              });
            }catch{}
          }

          joined=false;

          iframe.remove();

          container.innerHTML="";
        }
      };
    }

    throw new Error(
      "نوع مزود القاعة غير مدعوم."
    );
  }

  window.RasedLiveProvider={
    SETTINGS_COLLECTION,
    SETTINGS_DOC,
    roomKey,
    loadConfig,
    clearConfigCache,
    configStatus,
    mount
  };

})();
