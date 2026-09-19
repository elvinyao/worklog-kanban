import {browserLanguages,detectLocale,localeTags,messages,translate,type MessageKey} from '../web/i18n/core';

let status:MessageKey|undefined;
const params={kind:document.querySelector<HTMLElement>('main')?.dataset.kind??'',public:'a'.repeat(26),private:'b'.repeat(26)};
function render(){
 const locale=detectLocale(browserLanguages());
 document.documentElement.lang=localeTags[locale];
 document.title=translate(locale,'dummy.environment',params);
 document.querySelectorAll<HTMLElement>('[data-i18n]').forEach(element=>{
  const key=element.dataset.i18n;if(key&&Object.hasOwn(messages,key))element.textContent=translate(locale,key as MessageKey,params);
 });
 const output=document.querySelector<HTMLOutputElement>('#status');if(output&&status)output.textContent=translate(locale,status);
}
addEventListener('languagechange',render);
render();

const base=new URL(/* @vite-ignore */ './',import.meta.url);
async function send(route:string,body:unknown){const response=await fetch(new URL(route,base),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});if(!response.ok)throw new Error('control_failed');}
document.querySelectorAll<HTMLButtonElement>('[data-identity]').forEach(button=>button.addEventListener('click',async()=>{
 try{await send('session',{identity:button.dataset.identity});location.reload();}catch{status='dummy.failed';render();}
}));
document.querySelector('#apply-fault')?.addEventListener('click',async()=>{
 try{await send('fault',{fault:document.querySelector<HTMLSelectElement>('#fault')?.value});status='dummy.applied';}catch{status='dummy.failed';}render();
});
