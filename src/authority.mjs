import { createHash } from 'node:crypto';

export function canonicalJson(value){
  if(value===null||value===undefined)return JSON.stringify(value??null);
  if(Array.isArray(value))return`[${value.map(canonicalJson).join(',')}]`;
  if(typeof value==='object')return`{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
export function authorityHash(value){return createHash('sha256').update(canonicalJson(value)).digest('hex');}
export function sealAthenaFireCommand(core={}){const clean=structuredClone(core);delete clean.commandHash;return Object.freeze({...clean,commandHash:authorityHash(clean)});}
export function verifyAthenaFireCommandHash(command={}){if(!command||typeof command!=='object'||!command.commandHash)return false;const clean=structuredClone(command);const provided=String(clean.commandHash);delete clean.commandHash;return authorityHash(clean)===provided;}
