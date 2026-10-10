import { gheeBrands, oilTypes } from '../src/domain/presets.ts';
import { writeFile } from 'node:fs/promises';
const key = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const items = (options, prefix) => options.map((option, i) => ({key:`${prefix}-${i}`,kind:'item',label:option.size,visible:true,priceCents:option.price}));
const brand = (value, prefix) => ({key:`${prefix}-${key(value.name)}`,kind:'group',label:value.name,visible:true,children:items(value.options,`${prefix}-${key(value.name)}`)});
const document = {schemaVersion:1,revision:0,updatedAt:'2026-10-10T00:00:00.000Z',roots:[
  {key:'ghee',kind:'group',label:'Ghee',visible:true,children:gheeBrands.map(value=>brand(value,'ghee'))},
  {key:'oil',kind:'group',label:'Oil',visible:true,children:oilTypes.map(type=>({key:`oil-${key(type.name)}`,kind:'group',label:type.name,visible:true,children:type.brands?type.brands.map(value=>brand(value,`oil-${key(type.name)}`)):items(type.options,`oil-${key(type.name)}`)}))}
]};
await writeFile(new URL('../src/presets/defaults.json',import.meta.url),JSON.stringify(document,null,2)+'\n');
