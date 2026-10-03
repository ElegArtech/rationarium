const path=require('node:path');const dossier=process.argv[2];const env=Object.fromEntries(require('node:fs').readFileSync(path.join(dossier,'kit/.env'),'utf8').split('\n').filter(l=>l&&!l.startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')),l.slice(l.indexOf('=')+1)]));const url=env.RATIONARIUM_URL_PUBLIQUE;
const {createRequire}=require('node:module');
const r=createRequire(path.resolve(__dirname,'../apps/web/package.json'));
const {chromium,expect}=r('@playwright/test');
const AxeBuilder=r('@axe-core/playwright').default;
const fs=require('node:fs');
(async()=>{
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({locale:'fr-FR',storageState:path.join(dossier,'session.json'),viewport:{width:1600,height:1000}});
const page=await context.newPage(), errors=[],responses=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('response',r=>{if(r.url().includes('/api/')&&r.status()>=400)responses.push({url:r.url(),status:r.status()});});
await page.goto(url);
await expect(page.getByRole('heading',{name:'Bonjour Administration',exact:true})).toBeVisible();
await page.getByRole('textbox',{name:'Nouvelle to-do',exact:true}).fill('Témoin audit stable');
await page.getByRole('button',{name:'Ajouter la to-do',exact:true}).click();
await expect(page.getByText('Témoin audit stable',{exact:true})).toBeVisible();
await page.reload();
await expect(page.getByText('Témoin audit stable',{exact:true})).toBeVisible();
const routes=['/','/planning','/planning/mois','/planning/activite','/projets','/taches','/evenements','/conges','/teletravail','/temps','/competences','/tiers','/clients','/utilisateurs','/departements','/rapports','/parametres','/roles','/audit','/taches-predefinies','/profil'];
const results=[];
for(const route of routes){
 await page.goto(url+route);
 await page.waitForLoadState('networkidle');
 const text=await page.locator('main').innerText();
 if(!text.trim()||/Le chargement a échoué/.test(text))throw Error(route+': '+text);
 results.push({route,headings:await page.locator('main h1').allTextContents()});
}
for(const width of [1600,1024])for(const theme of ['clair','sombre']){
 await page.setViewportSize({width,height:1000});
 await page.evaluate(t=>localStorage.setItem('rationarium.theme',t),theme);
 for(const route of ['/','/planning']){
  await page.goto(url+route);await page.waitForLoadState('networkidle');
  const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  if(axe.violations.length)throw Error(JSON.stringify(axe.violations.map(v=>v.id)));
  results.push({route,width,theme,violations:axe.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.length}))});
  await page.screenshot({path:`${dossier}/${route==='/'?'tableau':'planning'}-${theme}-${width}.png`,fullPage:true});
 }
}
await page.getByRole('button',{name:'EN',exact:true}).click();
await expect(page.getByRole('navigation',{name:'Main navigation',exact:true})).toBeVisible();
fs.writeFileSync(path.join(dossier,'parcours.json'),JSON.stringify({results,errors,responses,english:true},null,2));
if(errors.length||responses.length)throw Error(JSON.stringify({errors,responses}));
console.log(JSON.stringify({routes:routes.length,errors,responses}));
await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
