/** Local price shortcuts only. Basket and receipt lines contain quantity/price. */
export type Preset = { size: string; price: number };
export type PresetBrand = { name: string; options: readonly Preset[] };
export type PresetMenu = 'ghee' | 'oil';
export type PresetCategory = { name: string } & (
  { brands: readonly PresetBrand[]; options?: never } |
  { options: readonly Preset[]; brands?: never }
);
export const gheeBrands: readonly PresetBrand[] = [
  { name: 'Gopal ghee', options: [{ size: '150 ml', price: 13000 }, { size: '400 ml', price: 26000 }, { size: '800 ml', price: 47500 }] },
  { name: 'Cow ghee', options: [{ size: '150 g', price: 11000 }, { size: '400 g', price: 25000 }, { size: '800 g', price: 47500 }] },
  { name: 'RKG ghee', options: [{ size: '200 ml', price: 14500 }, { size: '500 ml', price: 29500 }, { size: '1 L', price: 52500 }, { size: '5 L', price: 265000 }, { size: '400 g', price: 26000 }, { size: '800 g', price: 47500 }, { size: '1600 g', price: 91500 }] },
  { name: 'Agni ghee', options: [{ size: '500 ml', price: 15000 }, { size: '1 L', price: 25000 }] },
  { name: 'Patanjali ghee', options: [{ size: '452 g', price: 27500 }, { size: '905 g', price: 48500 }] },
  { name: 'Vita ghee', options: [{ size: '250 g', price: 6500 }, { size: '500 g', price: 13000 }, { size: '1 kg', price: 23000 }, { size: '2.5 kg', price: 49500 }] },
  { name: 'QBB ghee', options: [{ size: '150 g', price: 13000 }, { size: '400 g', price: 33500 }, { size: '800 g', price: 65000 }, { size: '1.6 kg', price: 120000 }] },
  { name: 'Gavardhan ghee', options: [{ size: '200 ml', price: 15000 }, { size: '500 ml', price: 30000 }, { size: '1 L', price: 55000 }] },
  { name: 'Stanwood ghee', options: [{ size: '200 ml', price: 9000 }, { size: '500 ml', price: 16000 }, { size: '1 L', price: 28500 }] },
  { name: 'Trishul ghee', options: [{ size: '100 ml', price: 5000 }, { size: '200 ml', price: 8000 }, { size: '500 ml', price: 13500 }, { size: '1 L', price: 23500 }] },
];

export const oilTypes: readonly PresetCategory[] = [
  { name: 'Coconut oil', brands: [
    { name: 'Badaye', options: [{ size: '100 ml', price: 4000 }] },
    { name: 'Tristar', options: [{ size: '500 ml', price: 15000 }, { size: '1 L', price: 26000 }] },
    { name: 'RKG', options: [{ size: '500 ml', price: 16000 }, { size: '1 L', price: 29000 }] },
  ] },
  { name: 'Mustard oil', brands: [
    { name: 'Badye', options: [{ size: '100 ml', price: 3500 }, { size: '500 ml', price: 8000 }] },
    { name: 'Vishal', options: [{ size: '200 ml', price: 5500 }, { size: '500 ml', price: 10000 }, { size: '1 L', price: 20000 }] },
    { name: 'Patanjali', options: [{ size: '1 L', price: 23000 }] },
    { name: 'RKG', options: [{ size: '200 ml', price: 6500 }, { size: '500 ml', price: 13000 }, { size: '1 L', price: 20000 }] },
    { name: 'Dabur', options: [{ size: '1 L', price: 20000 }] },
    { name: 'Mughal', options: [{ size: '250 ml', price: 6500 }, { size: '500 ml', price: 11000 }, { size: '1 L', price: 20000 }] },
  ] },
  { name: 'Sesame oil', brands: [
    { name: 'Badye', options: [{ size: '100 ml', price: 3500 }, { size: '500 ml', price: 8000 }] },
    { name: 'Vishal', options: [{ size: '200 ml', price: 5500 }, { size: '500 ml', price: 10000 }, { size: '1 L', price: 20000 }] },
    { name: 'RKG', options: [{ size: '200 ml', price: 7500 }, { size: '500 ml', price: 14500 }] },
    { name: 'Patanjali', options: [{ size: '1 L', price: 26000 }] },
  ] },
  { name: 'Chameli oil', options: [{ size: '100 ml', price: 7500 }, { size: '200 ml', price: 14000 }, { size: '500 ml', price: 27500 }] },
];
