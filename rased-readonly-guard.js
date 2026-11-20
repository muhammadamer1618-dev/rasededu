/* Rased executive read-only guard. Loaded only for an explicitly selected supervisor view. */
(function(w){
 'use strict';
 const s=w.sessionStorage;
 const enabled=()=>s.getItem('rasedExecutiveReadOnly')==='1';
 if(!enabled())return;
 const blocked=()=>Promise.reject(Object.assign(new Error('وضع المدير العام للعرض فقط: التعديل والحفظ والحذف غير متاح.'),{code:'permission-denied'}));
 function patch(proto,name,replacement){try{if(proto&&typeof proto[name]==='function'&&!proto[name].__rasedReadOnly){const original=proto[name];const wrapped=replacement(original);wrapped.__rasedReadOnly=true;proto[name]=wrapped;}}catch(e){}}
 function installFirestoreGuard(){
  const fs=w.firebase&&w.firebase.firestore;
  if(!fs)return;
  patch(fs.DocumentReference&&fs.DocumentReference.prototype,'set',()=>function(){return blocked();});
  patch(fs.DocumentReference&&fs.DocumentReference.prototype,'update',()=>function(){return blocked();});
  patch(fs.DocumentReference&&fs.DocumentReference.prototype,'delete',()=>function(){return blocked();});
  patch(fs.CollectionReference&&fs.CollectionReference.prototype,'add',()=>function(){return blocked();});
  patch(fs.WriteBatch&&fs.WriteBatch.prototype,'commit',()=>function(){return blocked();});
  patch(fs.Transaction&&fs.Transaction.prototype,'set',()=>function(){throw new Error('Read-only executive view');});
  patch(fs.Transaction&&fs.Transaction.prototype,'update',()=>function(){throw new Error('Read-only executive view');});
  patch(fs.Transaction&&fs.Transaction.prototype,'delete',()=>function(){throw new Error('Read-only executive view');});
 }
 installFirestoreGuard();
 const originalFetch=w.fetch;
 if(originalFetch)w.fetch=function(input,init){
  const url=String(typeof input==='string'?input:input&&input.url||'');
  const method=String(init&&init.method||input&&input.method||'GET').toUpperCase();
  if(enabled()&&method!=='GET'&&method!=='HEAD'&&(/supabase\.co\/rest\/v1|supabase\.co\/storage\/v1|firebasestorage\.googleapis\.com|firebasestorage\.app|storage\.googleapis\.com|identitytoolkit\.googleapis\.com.*accounts:update|firestore\.googleapis\.com.*(?:Write|commit|batchWrite)/i.test(url)))return blocked();
  return originalFetch.apply(this,arguments);
 };
 const XHR=w.XMLHttpRequest;
 if(XHR&&XHR.prototype){
  const open=XHR.prototype.open,send=XHR.prototype.send;
  XHR.prototype.open=function(method,url){this.__rasedReadonlyMethod=String(method||'GET').toUpperCase();this.__rasedReadonlyUrl=String(url||'');return open.apply(this,arguments);};
  XHR.prototype.send=function(){
   if(enabled()&&this.__rasedReadonlyMethod!=='GET'&&this.__rasedReadonlyMethod!=='HEAD'&&(/supabase\.co\/rest\/v1|supabase\.co\/storage\/v1|firebasestorage\.googleapis\.com|firebasestorage\.app|storage\.googleapis\.com|identitytoolkit\.googleapis\.com.*accounts:update|firestore\.googleapis\.com.*(?:Write|commit|batchWrite)/i.test(this.__rasedReadonlyUrl))) {
    try{this.abort();}catch(e){}
    throw new Error('وضع المدير العام للعرض فقط: تم منع عملية الكتابة.');
   }
   return send.apply(this,arguments);
  };
 }
 const rawStorageGet=w.Storage&&w.Storage.prototype.getItem;
 if(rawStorageGet){
  w.__RASED_RAW_SESSION_GET__=key=>rawStorageGet.call(s,key);
  w.Storage.prototype.getItem=function(key){
   if(enabled()&&(this===s||this===w.localStorage)){
    const k=String(key);
    if(k==='currentUser'||k==='currentUserEmail')return rawStorageGet.call(s,'rasedExecutiveTarget')||rawStorageGet.call(this,k);
    if(k==='currentUserName')return rawStorageGet.call(s,'rasedExecutiveTargetName')||rawStorageGet.call(this,k);
    if(k==='currentUserRole')return 'supervisor';
    if(k==='currentUserType'||k==='currentUserPermissions')return rawStorageGet.call(s,k)||rawStorageGet.call(this,k);
   }
   return rawStorageGet.call(this,key);
  };
 }
 const authKeys=/^(currentUser(?:Role|Email|Name|Type|Permissions)?|alfalah\.gate\.session\.v1)$/;
 try{
  const set=w.localStorage.setItem.bind(w.localStorage),remove=w.localStorage.removeItem.bind(w.localStorage);
  w.localStorage.setItem=function(k,v){if(enabled()&&authKeys.test(String(k)))return;return set(k,v);};
  w.localStorage.removeItem=function(k){if(enabled()&&authKeys.test(String(k)))return;return remove(k);};
 }catch(e){}
 const forbidden=/^(حفظ|حفظ التعديلات|إضافة|إضافة جديد|تعديل|حذف|اعتماد|نشر|إرسال|رفع|إنشاء|تغيير كلمة المرور|تأكيد|إلغاء النشر)/i;
 function protectNode(node){
  if(!node||node.nodeType!==1)return;
  if(node.matches('button,input[type=submit],input[type=button]')){
   const label=(node.innerText||node.value||node.getAttribute('aria-label')||'').trim();
   if(forbidden.test(label)||node.dataset.writeAction==='true'){node.disabled=true;node.setAttribute('aria-disabled','true');node.title='المشاهدة والطباعة فقط';}
  }
  if(node.matches('a[href*="change-password"],a[href*="admin"],a[href*="edit"],a[href*="create"]')){node.setAttribute('aria-disabled','true');node.style.pointerEvents='none';node.style.opacity='.45';}
  node.querySelectorAll?.('button,input[type=submit],input[type=button],a[href*="change-password"],a[href*="edit"],a[href*="create"]').forEach(protectNode);
 }
 function scan(){if(!enabled())return;protectNode(w.document.body);}
 if(w.document.readyState==='loading')w.document.addEventListener('DOMContentLoaded',scan,{once:true});else scan();
 try{new MutationObserver(scan).observe(w.document.documentElement,{childList:true,subtree:true});}catch(e){}
 w.document.addEventListener('submit',e=>{if(enabled()){e.preventDefault();e.stopImmediatePropagation();}},true);
 w.document.addEventListener('click',e=>{if(!enabled())return;const b=e.target.closest('button,input[type=submit],input[type=button]');if(b&&b.disabled){e.preventDefault();e.stopImmediatePropagation();}},true);
 w.__RASED_EXECUTIVE_READ_ONLY__=true;
})(window);