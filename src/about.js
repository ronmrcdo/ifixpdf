import {version} from '../package.json';
import eula from '../EULA.txt?raw';
import license from '../LICENSE?raw';
import {brandMark} from './brand.js';

const thirdParty=import.meta.glob('../licenses/*',{query:'?raw',import:'default',eager:true});
const esc=s=>s.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const licenseBlock=(name,text)=>`<details><summary>${esc(name)}</summary><pre>${esc(text)}</pre></details>`;
const third=Object.entries(thirdParty).map(([path,text])=>licenseBlock(path.split('/').pop().replace(/\.[^.]+$/,'').replace(/-LICENSE$/,''),text)).join('');

export const aboutMarkup=()=>`<div class="about"><h2>About</h2><div class="settings-row"><div class="about-id">${brandMark()}<div>iFixPDF<p>Version ${version}</p><p>Developer: Ron Mercado</p></div></div><button class="secondary" data-external="https://github.com/ronmrcdo/ifixpdf">GitHub</button></div><div class="settings-row" id="updates"></div><div class="settings-row"><div>Privacy<p class="about-privacy">${esc(eula.split(/\r?\n\r?\n/)[0])}</p></div></div><div class="settings-row about-legal"><div>License${licenseBlock('MIT License',license)}</div></div><div class="settings-row about-legal"><div class="about-licenses">Open-source licenses${third}</div></div></div>`;
