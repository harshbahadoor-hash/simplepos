/** Local price shortcuts only. Basket and receipt lines contain quantity/price. */
export type Preset = { size: string; price: number };
export type PresetBrand = { name: string; options: readonly Preset[] };
export const gheeBrands: readonly PresetBrand[] = [
  { name: 'Gopal ghee', options: [{ size: '150 ml', price: 13000 }, { size: '400 ml', price: 26000 }, { size: '800 ml', price: 47500 }] },
  { name: 'Cow ghee', options: [{ size: '150 g', price: 11000 }, { size: '400 g', price: 25000 }, { size: '800 g', price: 47500 }] },
  { name: 'RKG ghee', options: [{ size: '200 ml', price: 14500 }, { size: '500 ml', price: 29500 }, { size: '1 L', price: 52500 }, { size: '5 L', price: 265000 }, { size: '400 g', price: 26000 }, { size: '800 g', price: 47500 }, { size: '1600 g', price: 91500 }] },
  { name: 'Agni ghee', options: [{ size: '500 ml', price: 15000 }, { size: '1 L', price: 25000 }] },
  { name: 'Patanjali ghee', options: [{ size: '452 g', price: 27500 }, { size: '905 g', price: 48500 }] },
  { name: 'Vita ghee', options: [{ size: '250 g', price: 6500 }, { size: '500 g', price: 13000 }, { size: '1 kg', price: 23000 }, { size: '2.5 kg', price: 49500 }] },
  { name: 'QBB ghee', options: [{ size: '150 g', price: 13000 }, { size: '400 g', price: 33500 }, { size: '800 g', price: 65000 }, { size: '1.6 kg', price: 120000 }] },
  { name: 'Stanwood ghee', options: [{ size: '', price: 6000 }, { size: '', price: 9000 }, { size: '', price: 16000 }] },
  { name: 'Trishul ghee', options: [{ size: '', price: 5000 }, { size: '', price: 8000 }, { size: '', price: 13500 }, { size: '', price: 23500 }] },
];
