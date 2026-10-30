import {version} from '../package.json';

const native=!!window.__TAURI_INTERNALS__;
const ui={status:native?'idle':'browser',update:null,received:0,total:0};
const updater=()=>import('@tauri-apps/plugin-updater');
const button=(action,label,primary)=>`<button class="${primary?'primary':'secondary'}" data-update="${action}">${label}</button>`;
const check=button('check','Check for updates');
const views={
  browser:()=>['Updates are available in the installed desktop app. This browser preview cannot update itself.',''],
  idle:()=>['Check whether a newer version is available.',check],
  checking:()=>['Checking for updates…',''],
  current:()=>['iFixPDF is up to date.',check],
  unconfigured:()=>['The update service is not configured in this development build. Install new versions manually.',check],
  offline:()=>["You're offline. Connect to the internet and try again.",button('check','Retry')],
  error:()=>["Couldn't check for updates. Try again later.",button('check','Retry')],
  available:()=>[`iFixPDF ${ui.update.version} is available.`,button('download','Download update',true)],
  downloading:()=>[`Downloading iFixPDF ${ui.update.version}…`,''],
  'download-error':()=>['Download failed. Check your connection and try again.',button('download','Retry')],
  ready:()=>[`iFixPDF ${ui.update.version} is ready. Your workspace is saved before restarting.`,button('install','Restart and install',true)],
  'save-error':()=>["iFixPDF couldn't save your workspace, so the update was not installed. Save your PDF, then try again.",button('install','Restart and install',true)],
  installing:()=>['Installing update…',''],
  'install-error':()=>["The update couldn't be installed. Try again, or install the new version manually.",button('install','Retry')],
  restart:()=>['Update installed. Restart iFixPDF to finish.','']
};

export function renderUpdates(){
  const el=document.querySelector('#updates');if(!el)return;
  const hadFocus=el.contains(document.activeElement);
  if(!el.firstChild)el.innerHTML=`<div>Updates<p>Installed version ${version}</p><p class="update-status" aria-live="polite"></p><div class="update-detail"></div></div><div class="update-action"></div>`;
  const [status,action]=views[ui.status]();
  el.querySelector('.update-status').textContent=status;
  const detail=el.querySelector('.update-detail');detail.replaceChildren();
  if(ui.update?.body&&['available','download-error','ready','save-error'].includes(ui.status)){const notes=document.createElement('p');notes.className='update-notes';notes.textContent=ui.update.body;detail.append(notes)}
  if(ui.status==='downloading')detail.innerHTML=ui.total?`<div class="progress-wrap"><progress max="${ui.total}" value="${ui.received}"></progress><span>${Math.round(ui.received/ui.total*100)}%</span></div>`:`<div class="progress-wrap"><progress></progress><span>${(ui.received/1048576).toFixed(1)} MB</span></div>`;
  el.querySelector('.update-action').innerHTML=action;
  if(hadFocus)(el.querySelector('.update-action button')||el).focus?.();
}
function set(status){ui.status=status;renderUpdates()}

async function checkNow(){
  set('checking');
  try{ui.update=await (await updater()).check();set(ui.update?'available':'current')}
  catch(e){set(/endpoints set/.test(String(e))?'unconfigured':navigator.onLine?'error':'offline')}
}
async function download(){
  ui.received=0;ui.total=0;set('downloading');
  try{await ui.update.download(e=>{if(e.event==='Started')ui.total=e.data.contentLength||0;if(e.event==='Progress')ui.received+=e.data.chunkLength;renderUpdates()});set('ready')}
  catch{set('download-error')}
}
// On Windows, install() hands off to the NSIS installer and exits the app, which then restarts.
async function install({persist,isWorking,toast}){
  if(isWorking())return toast('Install the update after your export finishes.');
  try{await persist()}catch{return set('save-error')}
  set('installing');
  try{await ui.update.install();set('restart')}catch{set('install-error')}
}

export function updateAction(action,ctx){
  if(action==='check')return checkNow();
  if(action==='download')return download();
  if(action==='install')return install(ctx);
}
