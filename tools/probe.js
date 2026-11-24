const vm=require('vm'),fs=require('fs');
let src=fs.readFileSync('data.js','utf8');
let pre='';
for(let i=0;i<40;i++){
  const code=pre+src+`
;globalThis.OUT={unitSpecialDescriptions:window.unitSpecialDescriptions,allWeaponProfiles,weaponSpecialDescriptions,ARMOURY_DEFS,armyRulesText,LEADER_DEFS,COVENANT_DOCTRINES,BANISHED_DOCTRINES,UNSC_DOCTRINES,UNSC_UNITS,UNSC_VEHICLES,COVENANT_UNITS,COVENANT_VEHICLES,BANISHED_UNITS,BANISHED_VEHICLES,FORERUNNER_UNITS,FORERUNNER_VEHICLES,FLOOD_UNITS,FLOOD_VEHICLES};`;
  const ctx={window:{},document:{},console};vm.createContext(ctx);
  try{vm.runInContext(code,ctx);
    const O=ctx.OUT;
    for(const k in O){const v=O[k];console.log(k,Array.isArray(v)?v.length:Object.keys(v).length)}
    fs.writeFileSync('out.json',JSON.stringify(O,(k,v)=>typeof v==='function'?'[fn]':v));
    break;
  }catch(e){const m=/(\w+) is not defined/.exec(e.message);if(!m){console.log('ERR',e.message);break}
    pre+=`var ${m[1]}=()=>true;\n`;}
}
