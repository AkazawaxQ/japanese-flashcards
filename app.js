const KEY="jkanji-saved-ids";
const LANG="jkanji-meaning-language";
const THEME="jkanji-theme";
const ACCENT_DARK="jkanji-accent-dark";
const ACCENT_LIGHT="jkanji-accent-light";
const DATA_PREFIX="jkanji-openjlpt-v1-";
const CDN="https://cdn.jsdelivr.net/gh/evanclan/OpenJLPT@main/data/json/kanji/";

const $=id=>document.getElementById(id);
const LEVELS=["N5","N4","N3","N2","N1"];
const validLangs=new Set(["en","jp","tr"]);

function readJSON(k,f){try{const v=localStorage.getItem(k);return v?JSON.parse(v):f}catch{return f}}
function readString(k,f){try{return localStorage.getItem(k)||f}catch{return f}}
function write(k,v){try{localStorage.setItem(k,v)}catch{}}

const saved0=readJSON(KEY,[]);
const state={
 tab:"practice",level:"All",index:0,flipped:false,
 saved:Array.isArray(saved0)?saved0.filter(x=>typeof x==="string"):[],
 lang:validLangs.has(readString(LANG,"en"))?readString(LANG,"en"):"en",
 theme:readString(THEME,"dark")==="light"?"light":"dark",
 accentDark:readString(ACCENT_DARK,"#b56bff"),accentLight:readString(ACCENT_LIGHT,"#7c3aed"),
 q:"",dq:"",cards:[],loading:true,error:"",shuffle:false,shuffleOrder:new Map(),transCache:{},translationRun:0
};

function ensureShuffle(){for(const c of state.cards)if(!state.shuffleOrder.has(c.id))state.shuffleOrder.set(c.id,Math.random())}
function deck(){
 let d=state.level==="All"?[...state.cards]:state.level==="Learned"?state.cards.filter(c=>state.saved.includes(c.id)):state.cards.filter(c=>c.level===state.level);
 if(state.shuffle){ensureShuffle();d.sort((a,b)=>state.shuffleOrder.get(a.id)-state.shuffleOrder.get(b.id))}
 return d;
}
const card=()=>deck()[state.index];
function meaning(c){return c?.[state.lang]||c?.en||c?.meanings?.[0]||""}
function readings(c){
 const on=(c?.onyomi||[]).join("、"); const kun=(c?.kunyomi||[]).join("、");
 if(on&&kun)return `音: ${on}　訓: ${kun}`;
 if(on)return `音: ${on}`;
 if(kun)return `訓: ${kun}`;
 return "";
}
function normalize(raw,level){
 const arr=Array.isArray(raw)?raw:[];
 return arr.map((x,i)=>({
   id:`${level.toLowerCase()}-${x.character}-${i}`,
   hanzi:x.character||"", pinyin:readings(x), level,
   en:Array.isArray(x.meanings)?x.meanings.join("; "):String(x.meanings||""),
   jp:"",tr:"", onyomi:x.onyomi||[],kunyomi:x.kunyomi||[],words:x.words||[],strokes:x.strokes||0
 })).filter(x=>x.hanzi);
}

async function loadLevel(level){
 const key=DATA_PREFIX+level.toLowerCase();
 try{const cached=localStorage.getItem(key);if(cached){const p=JSON.parse(cached);if(Array.isArray(p)&&p.length){return p}}}catch{}
 const r=await fetch(`${CDN}${level.toLowerCase()}.json`,{cache:"no-store"});
 if(!r.ok)throw new Error(`${level} dataset failed`);
 const data=normalize(await r.json(),level);
 write(key,JSON.stringify(data));
 return data;
}

async function loadDataset(){
 state.loading=true;state.error="";render();
 try{
   const chunks=await Promise.all(LEVELS.map(loadLevel));
   state.cards=chunks.flat();
   state.shuffleOrder=new Map();ensureShuffle();state.index=0;
 }catch(e){
   console.error(e);state.error="Kanji dataset could not be loaded. Check your internet connection and reload.";
 }
 state.loading=false;render();
}

function render(){
 $("practice-view").hidden=state.tab!=="practice";
 $("dictionary-view").hidden=state.tab!=="dictionary";
 $("saved-view").hidden=state.tab!=="saved";
 document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("is-active",x.dataset.tab===state.tab));
 document.querySelectorAll('.tab[data-tab="saved"]').forEach(x=>x.textContent=`Saved (${state.saved.length})`);
 document.querySelectorAll(".chip").forEach(x=>x.classList.toggle("is-active",x.dataset.level===state.level));
 $("shuffle-btn")?.classList.toggle("is-active",state.shuffle);
 $("shuffle-btn")?.setAttribute("aria-pressed",String(state.shuffle));
 if(state.tab==="practice")renderPractice(); else if(state.tab==="dictionary")renderDictionary(); else renderSaved();
}

function renderPractice(){
 const d=deck();if(state.index>=d.length)state.index=0;const c=card();
 $("progress").textContent=state.loading?"Loading JLPT kanji…":state.error?"":d.length?`${state.index+1} / ${d.length}`:"0 / 0";
 $("practice-hanzi").textContent=c?.hanzi||"";
 $("practice-reading").textContent=c?readings(c):"";
 $("practice-meaning").textContent=c?(state.lang!=="en"&&!c[state.lang]?"Loading…":meaning(c)):"";
 $("practice-level").textContent=c?.level||"";
 $("practice-reveal").classList.toggle("is-visible",state.flipped);
 $("practice-hint").textContent=state.flipped?"Tap to hide meaning":"Tap to reveal meaning";
 $("save-btn").textContent=c&&state.saved.includes(c.id)?"Saved":"Save";
 if(state.error)$("practice-meaning").textContent=state.error;
 if(c&&state.lang!=="en"&&!c[state.lang])translatePractice(c);
}

function speak(text){if(!window.speechSynthesis||!text)return;speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang="ja-JP";u.rate=.8;speechSynthesis.speak(u)}
async function translateText(text,lang){
 if(!text||lang==="en")return "";const key=`${lang}:${text}`;
 if(Object.prototype.hasOwnProperty.call(state.transCache,key))return state.transCache[key];
 try{const r=await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${lang}&dt=t&q=${encodeURIComponent(text)}`);if(!r.ok)throw 0;const j=await r.json();const v=(Array.isArray(j?.[0])?j[0]:[]).map(x=>x?.[0]||"").join("").trim();state.transCache[key]=v;return v}catch{state.transCache[key]="";return ""}
}
async function translatePractice(c){
 const run=state.translationRun,lang=state.lang,val=await translateText(c.en,lang);
 if(run!==state.translationRun||state.lang!==lang)return;
 if(val)c[lang]=val;if(state.tab==="practice"&&card()?.id===c.id)$("practice-meaning").textContent=val||c.en||"";
}

function renderDictionary(){
 const q=String(state.dq||"").trim().toLowerCase();
 if(state.loading){$("dictionary-list").innerHTML='<div class="empty"><p>Loading the JLPT kanji dictionary…</p></div>';return}
 if(state.error){$("dictionary-list").innerHTML=`<div class="empty"><p>${escapeHTML(state.error)}</p></div>`;return}
 const a=state.cards.filter(c=>!q||[c.hanzi,c.pinyin,c.en,c.jp,c.tr,c.level,...c.onyomi,...c.kunyomi,...c.words].some(v=>String(v||"").toLowerCase().includes(q)));
 const visible=a.slice(0,120);
 $("dictionary-list").innerHTML=visible.map(c=>`<article class="dictionary-row"><div class="dictionary-hanzi">${escapeHTML(c.hanzi)}</div><div><div class="dictionary-pinyin">${escapeHTML(readings(c))}</div><div class="dictionary-meta">${escapeHTML(c.level)}${c.strokes?` · ${c.strokes} strokes`:""}</div></div><div class="dictionary-meaning" data-meaning-id="${escapeAttr(c.id)}">${escapeHTML(state.lang!=="en"&&!c[state.lang]?"Loading…":meaning(c))}</div></article>`).join("")||'<div class="empty"><p>No matches.</p></div>';
 translateDictionary(visible);
}
async function translateDictionary(rows){
 if(state.lang==="en"||!rows.length)return;const run=state.translationRun,lang=state.lang;
 for(const c of rows){if(run!==state.translationRun||state.lang!==lang)return;if(c[lang])continue;const v=await translateText(c.en,lang);if(run!==state.translationRun||state.lang!==lang)return;if(v)c[lang]=v;const el=document.querySelector(`[data-meaning-id="${cssEscape(c.id)}"]`);if(el)el.textContent=v||c.en||""}
}

function renderSaved(){
 const q=state.q.toLowerCase();const a=state.cards.filter(c=>state.saved.includes(c.id)).filter(c=>!q||[c.hanzi,c.pinyin,c.en,c.jp,c.tr,c.level].some(v=>String(v||"").toLowerCase().includes(q)));
 $("empty-state").hidden=a.length>0;
 $("saved-grid").innerHTML=a.map(c=>`<article class="card card--compact"><button class="card-face" data-flip="${escapeAttr(c.id)}"><span class="card-hint">Tap to reveal</span><span class="hanzi">${escapeHTML(c.hanzi)}</span><span class="pinyin">${escapeHTML(readings(c))}</span><div class="reveal"><p class="meaning" data-saved-meaning-id="${escapeAttr(c.id)}">${escapeHTML(state.lang!=="en"&&!c[state.lang]?"Loading…":meaning(c))}</p></div><span class="level-chip">${escapeHTML(c.level)}</span></button><div class="card-actions"><button class="ghost" data-speak="${escapeAttr(c.id)}">🔊 Hear</button><button class="save is-saved" data-remove="${escapeAttr(c.id)}">Saved</button></div></article>`).join("");translateSaved(a);
}
async function translateSaved(rows){
 if(state.lang==="en"||!rows.length)return;const run=state.translationRun,lang=state.lang;
 for(const c of rows){if(run!==state.translationRun||state.lang!==lang)return;if(c[lang])continue;const v=await translateText(c.en,lang);if(run!==state.translationRun||state.lang!==lang)return;if(v)c[lang]=v;const el=document.querySelector(`[data-saved-meaning-id="${cssEscape(c.id)}"]`);if(el)el.textContent=v||c.en||""}
}
function escapeHTML(v){return String(v??"").replace(/[&<>'"]/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;","\"":"&quot;"}[ch]))}
function escapeAttr(v){return escapeHTML(v)}
function cssEscape(v){return window.CSS?.escape?CSS.escape(String(v)):String(v).replace(/[^a-zA-Z0-9_-]/g,"\\$&")}

function applyAccent(){const a=state.theme==="dark"?state.accentDark:state.accentLight;document.documentElement.style.setProperty("--accent",a);document.documentElement.style.setProperty("--accent-deep",a);document.documentElement.style.setProperty("--glow",`color-mix(in srgb, ${a} 18%, transparent)`);$("custom-color").value=a;document.querySelectorAll(".color-swatch").forEach(x=>x.classList.toggle("is-selected",x.dataset.color.toLowerCase()===a.toLowerCase()))}
function applyTheme(){document.documentElement.dataset.theme=state.theme;write(THEME,state.theme);$("theme-toggle").textContent=state.theme==="dark"?"Light":"Dark";applyAccent()}
function setLanguage(lang){if(!validLangs.has(lang))lang="en";state.translationRun++;state.lang=lang;write(LANG,lang);state.index=0;state.flipped=false;render()}

for(const x of document.querySelectorAll(".tab"))x.onclick=()=>{state.tab=x.dataset.tab;render()};
for(const x of document.querySelectorAll(".chip"))x.onclick=()=>{state.level=x.dataset.level;state.index=0;state.flipped=false;render()};
$("language-select").value=state.lang;$("language-select").onchange=e=>setLanguage(e.target.value);
$("theme-toggle").onclick=()=>{state.theme=state.theme==="dark"?"light":"dark";applyTheme()};
$("theme-color-btn").onclick=()=>$("theme-panel").hidden=!$("theme-panel").hidden;
function setAccent(c){if(!/^#[0-9a-f]{6}$/i.test(c))return;if(state.theme==="dark"){state.accentDark=c;write(ACCENT_DARK,c)}else{state.accentLight=c;write(ACCENT_LIGHT,c)}applyAccent()}
for(const b of document.querySelectorAll(".color-swatch"))b.onclick=()=>setAccent(b.dataset.color);$("custom-color").oninput=e=>setAccent(e.target.value);
document.addEventListener("click",e=>{const p=$("theme-panel"),t=$("theme-color-btn");if(p&&!p.hidden&&!p.contains(e.target)&&e.target!==t)p.hidden=true});

$("practice-face").onclick=()=>{state.flipped=!state.flipped;renderPractice()};
$("speak-btn").onclick=()=>{const c=card();if(c)speak(c.hanzi)};
$("shuffle-btn").onclick=()=>{state.shuffle=!state.shuffle;state.index=0;state.flipped=false;if(state.shuffle){state.shuffleOrder=new Map();ensureShuffle()}render()};
$("save-btn").onclick=()=>{const c=card();if(!c)return;state.saved=state.saved.includes(c.id)?state.saved.filter(x=>x!==c.id):[...state.saved,c.id];write(KEY,JSON.stringify(state.saved));render()};
$("prev-btn").onclick=()=>{const d=deck();if(!d.length)return;state.index=(state.index-1+d.length)%d.length;state.flipped=false;render()};
$("next-btn").onclick=()=>{const d=deck();if(!d.length)return;state.index=(state.index+1)%d.length;state.flipped=false;render()};
$("search").oninput=e=>{state.q=e.target.value;renderSaved()};
let dictionaryTimer;$("dictionary-search").oninput=e=>{state.dq=e.target.value;clearTimeout(dictionaryTimer);dictionaryTimer=setTimeout(renderDictionary,120)};
$("go-practice").onclick=()=>{state.tab="practice";render()};
$("saved-grid").onclick=e=>{const t=e.target;if(t.dataset.speak){const c=state.cards.find(x=>x.id===t.dataset.speak);if(c)speak(c.hanzi)}if(t.dataset.remove){state.saved=state.saved.filter(x=>x!==t.dataset.remove);write(KEY,JSON.stringify(state.saved));render()}};

let sx=0;$("practice-face").ontouchstart=e=>{sx=e.changedTouches[0].clientX};$("practice-face").ontouchend=e=>{const dx=e.changedTouches[0].clientX-sx;if(Math.abs(dx)>55){const d=deck();if(!d.length)return;state.index=(state.index+(dx<0?1:-1)+d.length)%d.length;state.flipped=false;render()}};

applyTheme();render();loadDataset();
if("serviceWorker" in navigator)navigator.serviceWorker.register("./sw.js").catch(()=>{});
