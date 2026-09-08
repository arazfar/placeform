export type ContextGalleryItem = {
  id: string;
  collection: 'presidio' | 'infrastructure';
  imageUrl: string;
  title: string;
  alt: string;
  caption: string;
  sourceUrl: string;
  credit?: string | null;
  note?: string;
};
// Prepared from the supplied collections on 2026-09-08. No runtime scraping.
export const contextGallery: ContextGalleryItem[] = [
  {
    id: 'arena-50250947',
    collection: 'presidio',
    imageUrl:
      'https://images.are.na/eyJidWNrZXQiOiJhcmVuYV9pbWFnZXMiLCJrZXkiOiI1MDI1MDk0Ny9vcmlnaW5hbF8yZGViNTY1NDFkOTM5ZGRjYzU1MzU5ODMwOGMyZTAxZC53ZWJwIiwiZWRpdHMiOnsicmVzaXplIjp7IndpZHRoIjoxMjAwLCJoZWlnaHQiOjEyMDAsImZpdCI6Imluc2lkZSIsIndpdGhvdXRFbmxhcmdlbWVudCI6dHJ1ZX0sIndlYnAiOnsicXVhbGl0eSI6NzV9LCJqcGVnIjp7InF1YWxpdHkiOjc1fSwicm90YXRlIjpudWxsfX0=?bc=0',
    title: '02 — Let repeated porches hold a large common ground',
    alt: 'Infantry row',
    caption:
      'Repeated porches and planted gaps make a large common ground legible.',
    sourceUrl: 'https://www.nps.gov/prsf/planyourvisit/infantry-row.htm',
    credit: 'Individual photographer uncredited on NPS page.',
    note: 'Presidio context; not the drawn project parcel.',
  },
  {
    id: 'arena-50250846',
    collection: 'presidio',
    imageUrl:
      'https://images.are.na/eyJidWNrZXQiOiJhcmVuYV9pbWFnZXMiLCJrZXkiOiI1MDI1MDg0Ni9vcmlnaW5hbF9mZmNiYjU1ZDIzNDZkZTBlYjA2NDU5YWFiYTM2NDhlYS5qcGVnIiwiZWRpdHMiOnsicmVzaXplIjp7IndpZHRoIjoxMjAwLCJoZWlnaHQiOjEyMDAsImZpdCI6Imluc2lkZSIsIndpdGhvdXRFbmxhcmdlbWVudCI6dHJ1ZX0sIndlYnAiOnsicXVhbGl0eSI6NzV9LCJqcGVnIjp7InF1YWxpdHkiOjc1fSwicm90YXRlIjpudWxsfX0=?bc=0',
    title: '04 — Presidio wood can support a contemporary screen',
    alt: 'Peter & Jan’s House',
    caption:
      'Timber louvers create depth and a graduated boundary around an enclosure.',
    sourceUrl: 'https://www.craigsteely.com/project/peters-house/',
    credit: 'Bruce Damonte, courtesy of Craig Steely Architecture.',
    note: 'Nearby-city precedent, outside the Presidio.',
  },
  {
    id: 'arena-50250849',
    collection: 'presidio',
    imageUrl:
      'https://images.are.na/eyJidWNrZXQiOiJhcmVuYV9pbWFnZXMiLCJrZXkiOiI1MDI1MDg0OS9vcmlnaW5hbF8xZGViNjc0NTRiNGUzNjYwMDIzMGFiZjJkZGZkMDhiYi5qcGVnIiwiZWRpdHMiOnsicmVzaXplIjp7IndpZHRoIjoxMjAwLCJoZWlnaHQiOjEyMDAsImZpdCI6Imluc2lkZSIsIndpdGhvdXRFbmxhcmdlbWVudCI6dHJ1ZX0sIndlYnAiOnsicXVhbGl0eSI6NzV9LCJqcGVnIjp7InF1YWxpdHkiOjc1fSwicm90YXRlIjpudWxsfX0=?bc=0',
    title: '04 — A planted roof still has an engineered edge',
    alt: 'California Academy of Sciences — project archive',
    caption: 'Distinguish planted surfaces, canopy edges and roof openings.',
    sourceUrl:
      'https://www.fondazionerenzopiano.org/en/project/california-academy-of-sciences/',
    credit: 'Renzo Piano Building Workshop; © Renzo Piano Building Workshop.',
    note: 'Nearby-city precedent, outside the Presidio.',
  },
  {
    id: 'arena-50250855',
    collection: 'presidio',
    imageUrl:
      'https://images.are.na/eyJidWNrZXQiOiJhcmVuYV9pbWFnZXMiLCJrZXkiOiI1MDI1MDg1NS9vcmlnaW5hbF85NzU4ODI4MzJkM2VjNDg4MTY4YjY3OWI1YmMwZGNlYy5qcGVnIiwiZWRpdHMiOnsicmVzaXplIjp7IndpZHRoIjoxMjAwLCJoZWlnaHQiOjEyMDAsImZpdCI6Imluc2lkZSIsIndpdGhvdXRFbmxhcmdlbWVudCI6dHJ1ZX0sIndlYnAiOnsicXVhbGl0eSI6NzV9LCJqcGVnIjp7InF1YWxpdHkiOjc1fSwicm90YXRlIjpudWxsfX0=?bc=0',
    title: '03 — A small outdoor room sits beside restored water',
    alt: 'El Polín Spring',
    caption: 'Seating and paths form a modest outdoor room beside water.',
    sourceUrl: 'https://presidio.gov/explore/attractions/el-polin-spring',
    credit: 'Marlin Lum.',
    note: 'Presidio context; not the drawn project parcel.',
  },
  {
    id: 'arena-50250859',
    collection: 'presidio',
    imageUrl:
      'https://images.are.na/eyJidWNrZXQiOiJhcmVuYV9pbWFnZXMiLCJrZXkiOiI1MDI1MDg1OS9vcmlnaW5hbF9mZmUxNzRhNGExNGQzOTk0MzExMDU5NDZmZDQ5ZDRmNy5qcGVnIiwiZWRpdHMiOnsicmVzaXplIjp7IndpZHRoIjoxMjAwLCJoZWlnaHQiOjEyMDAsImZpdCI6Imluc2lkZSIsIndpdGhvdXRFbmxhcmdlbWVudCI6dHJ1ZX0sIndlYnAiOnsicXVhbGl0eSI6NzV9LCJqcGVnIjp7InF1YWxpdHkiOjc1fSwicm90YXRlIjpudWxsfX0=?bc=0',
    title: '03 — A resting place belongs to a complete public route',
    alt: 'Battery Bluff',
    caption: 'Connect places to pause with continuous public routes.',
    sourceUrl: 'https://presidio.gov/explore/attractions/battery-bluff',
    credit:
      "Myleen Hollero, identified in the page's image accessibility text.",
    note: 'Presidio context; not the drawn project parcel.',
  },
  {
    id: 'arena-50250864',
    collection: 'presidio',
    imageUrl:
      'https://images.are.na/eyJidWNrZXQiOiJhcmVuYV9pbWFnZXMiLCJrZXkiOiI1MDI1MDg2NC9vcmlnaW5hbF81OTNkNGIyZTZhMjI5ZTc3MTkxZDc3MDRjZmI5ZDdhNi5qcGVnIiwiZWRpdHMiOnsicmVzaXplIjp7IndpZHRoIjoxMjAwLCJoZWlnaHQiOjEyMDAsImZpdCI6Imluc2lkZSIsIndpdGhvdXRFbmxhcmdlbWVudCI6dHJ1ZX0sIndlYnAiOnsicXVhbGl0eSI6NzV9LCJqcGVnIjp7InF1YWxpdHkiOjc1fSwicm90YXRlIjpudWxsfX0=?bc=0',
    title: '03 — A civic park preserves more than one historical layer',
    alt: 'Crissy Field',
    caption:
      'Keep water, open ground and inherited structures legible as distinct layers.',
    sourceUrl: 'https://www.hargreaves.com/work/crissy-field/',
    credit:
      'Hargreaves Jones project presentation; individual photographer not identified.',
    note: 'Presidio context; not the drawn project parcel.',
  },
  {
    id: 'equinix-am4',
    collection: 'infrastructure',
    imageUrl:
      'https://infrastructure-forms.ohong2.chatgpt.site/images/equinix-am4.webp',
    title: 'Equinix AM4',
    alt: 'Equinix AM4 — Ribbed facade, Monolith, Repetition.',
    caption:
      'Repeated facade ribs give a technical volume depth and a recognizable rhythm.',
    sourceUrl:
      'https://infrastructure-forms.ohong2.chatgpt.site/precedent/equinix-am4/#image-equinix-am4-cover',
    credit: 'Architecture: Benthem Crouwel Architects',
    note: 'Architectural precedent; not a supported model geometry.',
  },
  {
    id: 'naver-gak-sejong',
    collection: 'infrastructure',
    imageUrl:
      'https://infrastructure-forms.ohong2.chatgpt.site/images/naver-gak-sejong.webp',
    title: 'NAVER Data Center GAK Sejong',
    alt: 'NAVER Data Center GAK Sejong — Landform, Repetition, Courtyard, Screen.',
    caption:
      'Study how repeated halls, screens and circulation meet the landscape.',
    sourceUrl:
      'https://infrastructure-forms.ohong2.chatgpt.site/precedent/naver-gak-sejong/#image-naver-gak-sejong-cover',
    credit:
      'Architecture: Junglim Architecture with HDR, ONE O ONE Architects and Mass Studies',
    note: 'Architectural precedent; not a supported model geometry.',
  },
  {
    id: 'vartaverket-kvv8',
    collection: 'infrastructure',
    imageUrl:
      'https://infrastructure-forms.ohong2.chatgpt.site/images/vartaverket-kvv8.webp',
    title: 'Värtaverket KVV8',
    alt: 'Värtaverket KVV8 — Ribbed facade, Rounded mass, Stepped mass.',
    caption:
      'A ribbed enclosure breaks down the scale of working infrastructure.',
    sourceUrl:
      'https://infrastructure-forms.ohong2.chatgpt.site/precedent/vartaverket-kvv8/#image-vartaverket-kvv8-cover',
    credit: 'Architecture: Urban Design with Gottlieb Paludan Architects',
    note: 'Architectural precedent; not a supported model geometry.',
  },
  {
    id: 'beeah-headquarters',
    collection: 'infrastructure',
    imageUrl:
      'https://infrastructure-forms.ohong2.chatgpt.site/images/beeah-headquarters.webp',
    title: 'BEEAH Headquarters',
    alt: 'BEEAH Headquarters — Interlocking dunes, Low curved shells, Sheltered courtyard.',
    caption:
      'Low roof profiles and sheltered courts establish a relationship to the ground.',
    sourceUrl:
      'https://infrastructure-forms.ohong2.chatgpt.site/precedent/beeah-headquarters/#image-beeah-headquarters-cover',
    credit: 'Architecture: Zaha Hadid Architects',
    note: 'Architectural precedent; not a supported model geometry.',
  },
  {
    id: 'kapsarc',
    collection: 'infrastructure',
    imageUrl:
      'https://infrastructure-forms.ohong2.chatgpt.site/images/kapsarc.webp',
    title: 'KAPSARC',
    alt: 'KAPSARC — Hexagonal cells, Crystalline roofscape, Sheltered courtyards.',
    caption: 'Repeated cells frame shaded routes and sheltered courtyards.',
    sourceUrl:
      'https://infrastructure-forms.ohong2.chatgpt.site/precedent/kapsarc/#image-kapsarc-cover',
    credit: 'Architecture: Zaha Hadid Architects',
    note: 'Architectural precedent; not a supported model geometry.',
  },
  {
    id: 'teshima',
    collection: 'infrastructure',
    imageUrl:
      'https://infrastructure-forms.ohong2.chatgpt.site/images/teshima.webp',
    title: 'Teshima Art Museum',
    alt: 'Teshima Art Museum — Fluid form, Landform, Monolith.',
    caption:
      'A low shell and restrained openings place the landscape in the foreground.',
    sourceUrl:
      'https://infrastructure-forms.ohong2.chatgpt.site/precedent/teshima/#image-teshima-cover',
    credit: 'Architecture: Ryue Nishizawa',
    note: 'Architectural precedent; not a supported model geometry.',
  },
];
