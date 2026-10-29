const DB='ifixpdf-local-documents';
function db(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>r.result.createObjectStore('recent',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
export async function saveRecent(file){const d=await db();return new Promise((resolve,reject)=>{const t=d.transaction('recent','readwrite');t.objectStore('recent').put({...file,modified:Date.now()});t.oncomplete=()=>{d.close();resolve()};t.onerror=()=>{d.close();reject(t.error)}})}
export async function listRecent(){const d=await db();return new Promise((resolve,reject)=>{const t=d.transaction('recent');const r=t.objectStore('recent').getAll();r.onsuccess=()=>{d.close();resolve(r.result.sort((a,b)=>b.modified-a.modified))};r.onerror=()=>reject(r.error)})}
export async function getRecent(id){return (await listRecent()).find(f=>f.id===id)}
export async function removeRecent(id){const d=await db();return new Promise((resolve,reject)=>{const t=d.transaction('recent','readwrite');t.objectStore('recent').delete(id);t.oncomplete=()=>{d.close();resolve()};t.onerror=()=>reject(t.error)})}
