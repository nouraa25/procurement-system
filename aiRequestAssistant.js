/**
 * AI Procurement Intelligence Engine
 *
 * Architecture:
 *  1. categoryClassifier   — keyword scoring, printing-first priority
 *  2. pricingEngine        — realistic AED bands, budget < standard < premium enforced
 *  3. urgencyCalculator    — priority / delivery / urgency factor
 *  4. supplierFilterEngine — strict category-only supplier pool
 *  5. supplierRanker       — weighted scoring: category match dominates
 *  6. procurementScorer    — complexity, approval probability, efficiency
 *  7. insightGenerator     — dynamic per-category/supplier insights
 *  8. summaryGenerator     — executive one-liner
 *  9. approvalPredictor    — workflow prediction
 */

import { supabase } from '../config/supabase.js';
import { getCurrentLanguage, t } from './i18n.js';

// Language-keyed helper — reads language at call time (live switching)
function L(map) {
  return map[getCurrentLanguage()] ?? map.ar ?? map.en ?? '';
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. PRICING ENGINE
//    All prices in AED — enterprise UAE realistic
//    Printing = per 100 items (batch pricing)
//    Software  = per seat / license
//    Others    = per unit
// ─────────────────────────────────────────────────────────────────────────────

const UNIT_PRICING = {
  electronics: {
    laptop:    { budget: 1500, standard: 2800, premium:  5000 },
    computer:  { budget: 1200, standard: 2200, premium:  4000 },
    monitor:   { budget:  500, standard: 1000, premium:  1800 },
    tablet:    { budget:  800, standard: 1600, premium:  3200 },
    printer:   { budget:  400, standard: 1200, premium:  2500 },
    scanner:   { budget:  350, standard:  900, premium:  2000 },
    phone:     { budget:  800, standard: 1800, premium:  3500 },
    projector: { budget: 1000, standard: 2500, premium:  5500 },
    router:    { budget:  300, standard:  800, premium:  2000 },
    server:    { budget: 5000, standard:12000, premium: 28000 },
    headset:   { budget:  150, standard:  400, premium:  1200 },
    camera:    { budget:  500, standard: 1500, premium:  4000 },
    default:   { budget: 1000, standard: 2500, premium:  5000 },
  },
  printing: {
    // Per 100 items (realistic batch print run)
    brochure:  { budget:  200, standard:  500, premium:   900 },
    flyer:     { budget:  100, standard:  250, premium:   500 },
    banner:    { budget:  300, standard:  700, premium:  1400 },
    poster:    { budget:  150, standard:  380, premium:   750 },
    catalog:   { budget:  500, standard: 1200, premium:  2500 },
    booklet:   { budget:  400, standard: 1000, premium:  2000 },
    sticker:   { budget:   80, standard:  200, premium:   420 },
    card:      { budget:   80, standard:  200, premium:   400 },
    default:   { budget:  150, standard:  380, premium:   750 },
  },
  furniture: {
    chair:     { budget:  300, standard:  700, premium:  1800 },
    desk:      { budget:  600, standard: 1200, premium:  3000 },
    table:     { budget:  500, standard: 1100, premium:  2600 },
    cabinet:   { budget:  700, standard: 1500, premium:  3500 },
    shelf:     { budget:  250, standard:  600, premium:  1400 },
    sofa:      { budget: 1000, standard: 2400, premium:  5500 },
    locker:    { budget:  400, standard:  900, premium:  2000 },
    default:   { budget:  400, standard:  900, premium:  2200 },
  },
  stationery: {
    pen:       { budget:    5, standard:   15, premium:    45 },
    notebook:  { budget:   12, standard:   30, premium:    90 },
    folder:    { budget:    8, standard:   22, premium:    65 },
    default:   { budget:   20, standard:   55, premium:   130 },
  },
  software: {
    // Per user / seat license (annual)
    erp:       { budget:  600, standard: 2000, premium:  6000 },
    crm:       { budget:  400, standard: 1200, premium:  3500 },
    antivirus: { budget:   80, standard:  220, premium:   550 },
    default:   { budget:  300, standard:  900, premium:  2800 },
  },
  other: {
    default:   { budget:  200, standard:  500, premium:  1200 },
  },
};

// Printing prices are per 100 items; all other categories per unit
const BATCH_SIZE = { printing: 100 };

function getUnitPrices(category, itemKey) {
  const cat = UNIT_PRICING[category] || UNIT_PRICING.other;
  return cat[itemKey] || cat.default;
}

function r100(n) { return Math.round(n / 100) * 100 || 100; }

function computeBudgetTiers(category, quantity, itemKey, urgencyFactor) {
  const unit      = getUnitPrices(category, itemKey);
  const batchSize = BATCH_SIZE[category] || 1;
  const qty       = Math.max(quantity / batchSize, 1);
  const b = r100(unit.budget   * qty * urgencyFactor);
  const s = r100(unit.standard * qty * urgencyFactor);
  const p = r100(unit.premium  * qty * urgencyFactor);
  return {
    budget:   { price: Math.min(b, s - 100) },
    standard: { price: s },
    premium:  { price: Math.max(p, s + 100) },
    unit: 'AED',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. CATEGORY CLASSIFIER
//    Printing keywords listed FIRST so "office printer for brochures" → printing
// ─────────────────────────────────────────────────────────────────────────────

const CATEGORY_KEYWORDS = {
  printing: [
    'print','printing','brochure','flyer','banner','business card','poster',
    'catalog','leaflet','booklet','sticker','label','toner','ink','card printing',
    'marketing material','flyers','banners','brochures','cards','pamphlet',
    'طباعة','بروشور','بروشورات','بنر','بنرات','كارت','بطاقات','ملصق','ملصقات',
    'حبر','مطبوعات','فلاير','فلايرات','بوستر','كتيب','كتالوج',
  ],
  electronics: [
    'laptop','computer','monitor','screen','keyboard','mouse','tablet','ipad',
    'phone','mobile','printer','scanner','projector','camera','headset','speaker',
    'router','switch','server','ssd','ram','usb','cable','charger','desktop',
    'workstation','device','hardware','equipment',
    'لابتوب','حاسوب','كمبيوتر','شاشة','طابعة','ماسح','جهاز','هاتف','تابلت',
  ],
  furniture: [
    'chair','desk','table','cabinet','shelf','rack','sofa','couch','wardrobe',
    'bookcase','locker','drawer','stand','bench','partition','cubicle','furniture',
    'workstation desk','office chair','executive chair','meeting table',
    'كرسي','مكتب','طاولة','خزانة','رف','أريكة','أثاث',
  ],
  stationery: [
    'pen','pencil','notebook','folder','binder','stapler','scissors','tape',
    'marker','highlighter','envelope','clip','eraser','stationery','office supply',
    'قلم','دفتر','مجلد','قرطاسية','أقلام',
  ],
  software: [
    'software','app','application','license','subscription','saas','crm','erp',
    'antivirus','tool','platform','plugin','system','برنامج','تطبيق','ترخيص',
    'اشتراك','نظام','منصة',
  ],
};

export function detectCategory(text) {
  const lower = text.toLowerCase();
  let best = 'other', bestScore = 0;
  for (const [cat, kws] of Object.entries(CATEGORY_KEYWORDS)) {
    const score = kws.filter(k => lower.includes(k)).length;
    if (score > bestScore) { bestScore = score; best = cat; }
  }
  return best;
}

// Arabic keyword → UNIT_PRICING item key
const ARABIC_ITEM_ALIASES = {
  'لابتوب':'laptop','حاسوب':'computer','كمبيوتر':'computer','شاشة':'monitor',
  'تابلت':'tablet','هاتف':'phone','بروجكتر':'projector','راوتر':'router',
  'سيرفر':'server','سماعات':'headset','كاميرا':'camera','ماسح':'scanner',
  'طابعة':'printer',
  'كرسي':'chair','مكتب':'desk','طاولة':'table','خزانة':'cabinet',
  'رف':'shelf','أريكة':'sofa',
  'أقلام':'pen','قلم':'pen','دفتر':'notebook','دفاتر':'notebook',
  'ملفات':'folder','مجلد':'folder',
  'بروشور':'brochure','بروشورات':'brochure',
  'فلاير':'flyer','فلايرات':'flyer',
  'بنر':'banner','بنرات':'banner',
  'بوستر':'poster','بوسترات':'poster',
  'كتالوج':'catalog','كتالوجات':'catalog',
  'كتيب':'booklet','كتيبات':'booklet',
  'ملصق':'sticker','ملصقات':'sticker',
  'بطاقات':'card','كارت':'card',
};

function detectItemKey(text, category) {
  for (const [ar, key] of Object.entries(ARABIC_ITEM_ALIASES)) {
    if (text.includes(ar) && UNIT_PRICING[category]?.[key]) return key;
  }
  const lower = text.toLowerCase();
  const catPricing = UNIT_PRICING[category] || UNIT_PRICING.other;
  for (const key of Object.keys(catPricing)) {
    if (key !== 'default' && lower.includes(key)) return key;
  }
  return 'default';
}

export function detectQuantity(text) {
  const matches = text.match(/\b(\d+)\b/g) || [];
  for (const m of matches) {
    const n = parseInt(m);
    if (n > 0 && n < 10000) return n;
  }
  return 1;
}

const ITEM_MAP = {
  laptop:    () => L({ ar:'لابتوب',       en:'Laptop'        }),
  computer:  () => L({ ar:'حاسوب',        en:'Computer'      }),
  monitor:   () => L({ ar:'شاشة',         en:'Monitor'       }),
  printer:   () => L({ ar:'طابعة',        en:'Printer'       }),
  scanner:   () => L({ ar:'ماسح ضوئي',    en:'Scanner'       }),
  tablet:    () => L({ ar:'تابلت',        en:'Tablet'        }),
  phone:     () => L({ ar:'هاتف',         en:'Phone'         }),
  projector: () => L({ ar:'بروجكتر',      en:'Projector'     }),
  router:    () => L({ ar:'راوتر',        en:'Router'        }),
  server:    () => L({ ar:'سيرفر',        en:'Server'        }),
  headset:   () => L({ ar:'سماعات',       en:'Headset'       }),
  camera:    () => L({ ar:'كاميرا',       en:'Camera'        }),
  chair:     () => L({ ar:'كرسي',         en:'Chair'         }),
  desk:      () => L({ ar:'مكتب',         en:'Desk'          }),
  table:     () => L({ ar:'طاولة',        en:'Table'         }),
  cabinet:   () => L({ ar:'خزانة',        en:'Cabinet'       }),
  shelf:     () => L({ ar:'رف',           en:'Shelf'         }),
  sofa:      () => L({ ar:'أريكة',        en:'Sofa'          }),
  locker:    () => L({ ar:'خزانة',        en:'Locker'        }),
  pen:       () => L({ ar:'أقلام',        en:'Pens'          }),
  notebook:  () => L({ ar:'دفاتر',        en:'Notebooks'     }),
  folder:    () => L({ ar:'ملفات',        en:'Folders'       }),
  brochure:  () => L({ ar:'بروشورات',     en:'Brochures'     }),
  flyer:     () => L({ ar:'فلايرات',      en:'Flyers'        }),
  banner:    () => L({ ar:'بنرات',        en:'Banners'       }),
  poster:    () => L({ ar:'بوسترات',      en:'Posters'       }),
  catalog:   () => L({ ar:'كتالوجات',     en:'Catalogs'      }),
  booklet:   () => L({ ar:'كتيبات',       en:'Booklets'      }),
  sticker:   () => L({ ar:'ملصقات',       en:'Stickers'      }),
  card:      () => L({ ar:'بطاقات عمل',   en:'Business Cards' }),
  erp:       () => L({ ar:'نظام ERP',     en:'ERP System'    }),
  crm:       () => L({ ar:'نظام CRM',     en:'CRM System'    }),
  antivirus: () => L({ ar:'برنامج حماية', en:'Antivirus'     }),
};

const CATEGORY_DEFAULTS = {
  electronics: () => L({ ar:'أجهزة إلكترونية', en:'Electronic Devices' }),
  printing:    () => L({ ar:'مواد مطبوعة',     en:'Printed Materials'  }),
  furniture:   () => L({ ar:'أثاث مكتبي',      en:'Office Furniture'   }),
  stationery:  () => L({ ar:'قرطاسية',          en:'Stationery'         }),
  software:    () => L({ ar:'برمجيات',          en:'Software'           }),
  other:       () => L({ ar:'مستلزمات',         en:'Supplies'           }),
};

function extractMainItem(text, category, itemKey) {
  if (itemKey !== 'default') {
    const fn = ITEM_MAP[itemKey];
    return fn ? fn() : itemKey;
  }
  const lower = text.toLowerCase();
  const allKws = Object.values(CATEGORY_KEYWORDS).flat();
  const found  = allKws.find(k => lower.includes(k));
  const fn     = found ? ITEM_MAP[found.toLowerCase()] : null;
  const defFn  = CATEGORY_DEFAULTS[category];
  return fn ? fn() : (defFn ? defFn() : category);
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. URGENCY CALCULATOR
// ─────────────────────────────────────────────────────────────────────────────

const PRIORITY_KEYWORDS = {
  urgent: ['urgent','asap','immediately','emergency','critical','rush','today','عاجل','فوري','طارئ','سريع','اليوم'],
  high:   ['important','soon','priority','needed','quickly','مهم','أولوية','قريب','بسرعة'],
  low:    ['whenever','no rush','low priority','eventually','غير عاجل','وقت الفراغ'],
};

export function detectPriority(text) {
  const lower = text.toLowerCase();
  for (const [p, kws] of Object.entries(PRIORITY_KEYWORDS)) {
    if (kws.some(k => lower.includes(k))) return p;
  }
  return 'medium';
}

const DELIVERY_CONFIG = {
  urgent: { label: () => L({ ar:'خلال 24–48 ساعة',   en:'Within 24–48 hours' }), days:2,  urgencyFactor:1.20, costIncreasePct:'15–25' },
  high:   { label: () => L({ ar:'خلال 3–5 أيام',     en:'Within 3–5 days'    }), days:5,  urgencyFactor:1.10, costIncreasePct:'8–12'  },
  medium: { label: () => L({ ar:'أسبوع إلى أسبوعين', en:'1–2 weeks'          }), days:10, urgencyFactor:1.00, costIncreasePct:null    },
  low:    { label: () => L({ ar:'خلال شهر',           en:'Within a month'     }), days:30, urgencyFactor:0.96, costIncreasePct:null    },
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. FALLBACK SUPPLIER POOL — strictly category-matched, enterprise UAE names
// ─────────────────────────────────────────────────────────────────────────────

const FALLBACK_SUPPLIERS = [
  // Electronics
  { id:'f-e1',  name:'Tech Solutions Inc',         category:'electronics', rating:4.8, delivery:'fast',    reliability:98 },
  { id:'f-e2',  name:'Global Electronics UAE',     category:'electronics', rating:4.7, delivery:'fast',    reliability:95 },
  { id:'f-e3',  name:'Tech Hardware Hub',          category:'electronics', rating:4.6, delivery:'medium',  reliability:92 },
  { id:'f-e4',  name:'Smart Devices UAE',          category:'electronics', rating:4.5, delivery:'medium',  reliability:90 },
  { id:'f-e5',  name:'Digital World Technologies', category:'electronics', rating:4.4, delivery:'slow',    reliability:87 },
  // Printing
  { id:'f-p1',  name:'PrintMaster Pro',            category:'printing',    rating:4.8, delivery:'fast',    reliability:97 },
  { id:'f-p2',  name:'Premium Print Services',     category:'printing',    rating:4.6, delivery:'fast',    reliability:94 },
  { id:'f-p3',  name:'Quick Print Shop',           category:'printing',    rating:4.4, delivery:'medium',  reliability:89 },
  { id:'f-p4',  name:'FastPrint UAE',              category:'printing',    rating:4.3, delivery:'medium',  reliability:86 },
  // Furniture
  { id:'f-fu1', name:'Office Furniture Plus',      category:'furniture',   rating:4.7, delivery:'medium',  reliability:96 },
  { id:'f-fu2', name:'Modern Office Supply',       category:'furniture',   rating:4.6, delivery:'medium',  reliability:93 },
  { id:'f-fu3', name:'Workspace Interiors',        category:'furniture',   rating:4.5, delivery:'slow',    reliability:91 },
  { id:'f-fu4', name:'Elite Office Furnishing',    category:'furniture',   rating:4.3, delivery:'slow',    reliability:86 },
  // Stationery / Office Supplies
  { id:'f-s1',  name:'Office Essentials UAE',      category:'stationery',  rating:4.6, delivery:'fast',    reliability:94 },
  { id:'f-s2',  name:'Smart Stationery Hub',       category:'stationery',  rating:4.4, delivery:'fast',    reliability:90 },
  // Software
  { id:'f-sw1', name:'UAE Software Systems',       category:'software',    rating:4.9, delivery:'instant', reliability:99 },
  { id:'f-sw2', name:'TechSoft Solutions',         category:'software',    rating:4.6, delivery:'instant', reliability:95 },
  // Other
  { id:'f-o1',  name:'Gulf General Supplies',      category:'other',       rating:4.4, delivery:'medium',  reliability:88 },
  { id:'f-o2',  name:'Emirates Business Services', category:'other',       rating:4.2, delivery:'medium',  reliability:84 },
];

async function fetchSuppliers() {
  try {
    const { data } = await supabase
      .from('suppliers')
      .select('*')
      .order('rating', { ascending: false });
    if (data && data.length > 0) return data.filter(s => s.user_id !== null);
  } catch { /* fall through to fallback */ }
  return FALLBACK_SUPPLIERS;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. SUPPLIER FILTER & RANKER
//    Category match is highest-weight factor — cross-category suppliers excluded
// ─────────────────────────────────────────────────────────────────────────────

function scoreSupplier(supplier, category, priority) {
  const rating    = parseFloat(supplier.rating) || 3.0;
  const catMatch  = supplier.category === category;

  // Category mismatch → hard excluded upstream; only category-matched reach scoring
  let s = 60; // base for category-matched supplier
  s += Math.round((rating / 5) * 25);
  // Reliability bonus
  const rel = supplier.reliability || 80;
  s += Math.round((rel / 100) * 10);
  // Delivery performance
  const delvBonus = { instant:5, fast:4, medium:2, slow:0 };
  s += delvBonus[supplier.delivery] || 2;
  // Priority-specific urgency capability
  if (priority === 'urgent' && (supplier.delivery === 'fast' || supplier.delivery === 'instant')) s += 8;
  if (priority === 'urgent' && supplier.delivery === 'slow') s -= 10;
  if (priority === 'high'   && rating >= 4.0) s += 3;
  if (rating >= 4.8) s += 5; else if (rating >= 4.5) s += 3;

  return Math.min(s, 99);
}

function mapScoreToDisplay(rawScore, rank) {
  // rank 0 → 92–98%, rank 1 → 80–90%, rank 2 → 65–79%
  const ranges = [{ min:92, max:98 }, { min:80, max:90 }, { min:65, max:79 }];
  const range  = ranges[rank] || { min:55, max:64 };
  const norm   = Math.min(rawScore / 99, 1);
  return Math.round(range.min + norm * (range.max - range.min));
}

export const CATEGORY_ICONS = {
  electronics: 'bi-cpu-fill',
  printing:    'bi-printer-fill',
  furniture:   'bi-house-door-fill',
  stationery:  'bi-pencil-fill',
  software:    'bi-code-slash',
  other:       'bi-building',
};

export const SUPPLIER_TAGS_DATA = {
  trusted:  { label: () => L({ ar:'موثوق',         en:'Trusted'       }), color:'#0d6efd' },
  fast:     { label: () => L({ ar:'توصيل سريع',    en:'Fast Delivery'  }), color:'#20c997' },
  budget:   { label: () => L({ ar:'اقتصادي',       en:'Budget'         }), color:'#fd7e14' },
  premium:  { label: () => L({ ar:'جودة عالية',    en:'Premium'        }), color:'#6f42c1' },
  toprated: { label: () => L({ ar:'أعلى تقييم',    en:'Top Rated'      }), color:'#f59e0b' },
  reliable: { label: () => L({ ar:'موثوقية عالية', en:'Reliable'       }), color:'#198754' },
  urgent:   { label: () => L({ ar:'يتعامل مع العاجل', en:'Handles Urgent' }), color:'#dc3545' },
};
export { SUPPLIER_TAGS_DATA as SUPPLIER_TAGS_BY_SCORE };

function assignTags(supplier, rawScore, rank, priority) {
  const rating = parseFloat(supplier.rating) || 0;
  const tags   = [];
  if (rating >= 4.7) tags.push('toprated');
  if (rating >= 4.5) tags.push('trusted');
  if ((supplier.reliability || 80) >= 93) tags.push('reliable');
  if (rank === 0) tags.push('fast');
  if (rank === 2) tags.push('budget');
  if (rating >= 4.8) tags.push('premium');
  if (priority === 'urgent' && (supplier.delivery === 'fast' || supplier.delivery === 'instant')) tags.push('urgent');
  return [...new Set(tags)].slice(0, 3);
}

// Category-specific reasons — called at render time via getter
const REASON_POOL = {
  electronics: [
    () => L({ ar:'أعلى تقييم في تجهيزات الإلكترونيات مع ضمان شامل وسجل تسليم ممتاز.',   en:'Top-rated electronics supplier with full warranty coverage and excellent delivery record.' }),
    () => L({ ar:'خبرة واسعة في توريد الأجهزة المؤسسية مع دعم فني متكامل بعد البيع.',    en:'Extensive enterprise hardware supply experience with comprehensive post-sale technical support.' }),
    () => L({ ar:'أسعار تنافسية وسرعة تسليم مع خدمة صيانة احترافية على مدار الساعة.',   en:'Competitive pricing with fast delivery and professional 24/7 maintenance service.' }),
  ],
  printing: [
    () => L({ ar:'جودة طباعة مؤسسية عالية مع دقة ألوان ممتازة وسرعة تنفيذ للطلبات الكبيرة.', en:'Enterprise print quality with excellent colour accuracy and fast turnaround for large orders.' }),
    () => L({ ar:'تجهيزات طباعة حديثة وخبرة في الطباعة التجارية والتسويقية الكبرى.',         en:'Modern printing equipment with proven expertise in commercial and marketing print production.' }),
    () => L({ ar:'التزام تام بالمواعيد المتفق عليها مع عروض أسعار تنافسية للطباعة بالجملة.',  en:'Strict deadline adherence with competitive bulk pricing and proof approval service.' }),
  ],
  furniture: [
    () => L({ ar:'تصاميم مريحة وعصرية مع مواد عالية الجودة وخدمة تركيب وتجميع شاملة.',      en:'Ergonomic modern designs with premium materials and full installation and assembly service.' }),
    () => L({ ar:'تشكيلة واسعة من الأثاث المكتبي المعتمد مع ضمان طويل الأمد وصيانة مجانية.', en:'Wide certified office furniture range with long-term warranty and complimentary maintenance.' }),
    () => L({ ar:'شريك موثوق لكبرى المؤسسات والجهات الحكومية في توريد الأثاث المكتبي.',       en:'Trusted partner to major enterprises and government entities for office furniture supply.' }),
  ],
  stationery: [
    () => L({ ar:'توفر مستمر للمخزون وتسليم سريع للطلبات المتكررة بأسعار الجملة المؤسسية.',  en:'Consistent stock availability with fast dispatch for recurring orders at corporate bulk rates.' }),
    () => L({ ar:'جودة منتجات عالية مع إمكانية التخصيص والطباعة الخاصة للشعار المؤسسي.',    en:'High product quality with custom branding and corporate logo printing capabilities.' }),
  ],
  software: [
    () => L({ ar:'شريك برمجي معتمد مع دعم فني متخصص على مدار الساعة وضمان التحديثات.',      en:'Certified software partner with 24/7 specialist technical support and guaranteed updates.' }),
    () => L({ ar:'تراخيص أصلية مع الامتثال القانوني الكامل وخدمات تدريب شاملة للموظفين.',    en:'Genuine licenses with full legal compliance and comprehensive employee training services.' }),
  ],
  other: [
    () => L({ ar:'سمعة ممتازة وتقييم عالٍ من مئات العملاء الموثقين والمؤسسات الكبرى.',        en:'Excellent reputation with high ratings from hundreds of verified clients and enterprises.' }),
    () => L({ ar:'موثوقية عالية في الالتزام بالمواعيد مع جودة منتج وخدمة ما بعد البيع.',      en:'Reliable on-time delivery with consistent product quality and excellent after-sales service.' }),
  ],
};

// Rejection reasons for lower-ranked suppliers
export const RANK_REJECTION = {
  1: () => L({
    ar:'تقييمه أقل من المورد الأول وسرعة توصيله أبطأ في الطلبات العاجلة.',
    en:'Rated lower than the top supplier with slower delivery performance on urgent orders.',
  }),
  2: () => L({
    ar:'تكلفة الوحدة أعلى وأوقات التسليم أطول مقارنةً بالمورد الأول.',
    en:'Higher unit cost and longer delivery lead times compared to the top-ranked supplier.',
  }),
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. PROCUREMENT SCORER
// ─────────────────────────────────────────────────────────────────────────────

function computeComplexity(priority, quantity, category, totalBudget) {
  let s = 0;
  s += { urgent:3, high:2, medium:1, low:0 }[priority] || 0;
  if (quantity > 100) s += 3; else if (quantity > 30) s += 2; else if (quantity > 10) s += 1;
  if (totalBudget > 100000) s += 2; else if (totalBudget > 30000) s += 1;
  if (category === 'electronics' || category === 'software') s += 1;
  if (s >= 7) return { level:'critical', label: () => t('requests.ai_complexity_critical'), color:'#dc3545' };
  if (s >= 5) return { level:'high',     label: () => t('requests.ai_complexity_high'),     color:'#e67e22' };
  if (s >= 3) return { level:'medium',   label: () => t('requests.ai_complexity_medium'),   color:'#ffc107' };
  return             { level:'low',      label: () => t('requests.ai_complexity_low'),       color:'#198754' };
}

export function computeApprovalProbability(totalBudget, priority, topRating, quantity) {
  let s = 70;
  s += topRating >= 4.7 ? 12 : topRating >= 4.3 ? 7 : -5;
  if (priority === 'urgent') s -= 8;
  if (priority === 'low')    s += 5;
  if (totalBudget > 100000)  s -= 10;
  else if (totalBudget > 50000) s -= 5;
  else if (totalBudget < 10000) s += 5;
  if (quantity > 100) s -= 5;
  return Math.min(Math.max(s, 40), 97);
}

export function computeEfficiencyScore(topRating, priority, complexity, approvalProb) {
  let s = 50;
  s += Math.round((topRating / 5) * 22);
  s += { urgent:0, high:5, medium:10, low:14 }[priority] || 10;
  s -= { critical:10, high:6, medium:3, low:0 }[complexity.level] || 0;
  s += Math.round(approvalProb * 0.12);
  return Math.min(Math.max(s, 42), 99);
}

function computeConfidence(category, quantity, priority, supplierCount) {
  let c = 58;
  if (category !== 'other') c += 14;
  if (quantity > 0 && quantity < 500) c += 10;
  if (priority !== 'medium') c += 7;
  if (supplierCount >= 2) c += 8;
  if (supplierCount >= 3) c += 3;
  return Math.min(c, 97);
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. RISK ENGINE
// ─────────────────────────────────────────────────────────────────────────────

export function generateRisks(quantity, priority, topRating, totalBudget, category) {
  const risks = [];

  if (quantity > 50 && priority === 'urgent')
    risks.push({ severity:'danger', text: L({ ar:'طلب عاجل بكمية كبيرة — نقص المخزون محتمل لدى معظم الموردين.', en:'Urgent order with large quantity — stock shortage likely with most suppliers.' }) });
  else if (quantity > 200)
    risks.push({ severity:'danger', text: L({ ar:'الكمية مرتفعة جداً — يُنصح بتقسيم الطلب على دفعات متعددة.', en:'Very large quantity — recommend splitting the order into multiple batches.' }) });

  if (priority === 'urgent')
    risks.push({ severity:'warning', text: L({ ar:'التسليم العاجل يرفع التكلفة 15–25% ويقلل خيارات الموردين المتاحة.', en:'Urgent delivery increases cost by 15–25% and reduces available supplier options.' }) });
  else if (priority === 'high')
    risks.push({ severity:'warning', text: L({ ar:'أولوية مرتفعة — يُنصح بالتنسيق المسبق مع المورد لضمان التوفر.', en:'High priority — recommend advance coordination with the supplier to ensure availability.' }) });

  if (topRating < 4.0)
    risks.push({ severity:'warning', text: L({ ar:'تقييم المورد منخفض نسبياً — يُنصح بمقارنة بدائل أعلى موثوقية.', en:'Supplier rating is relatively low — recommend comparing higher-reliability alternatives.' }) });

  if (category === 'printing' && quantity > 500)
    risks.push({ severity:'info', text: L({ ar:'الطباعة الكبيرة قد تتطلب تسليماً على مراحل — اطلب جدول تسليم تفصيلياً.', en:'Large print run may require phased delivery — request a detailed delivery schedule.' }) });
  if (category === 'electronics' && priority === 'urgent')
    risks.push({ severity:'info', text: L({ ar:'تأكد من ضمان المنتج وتوفر قطع الغيار قبل التسليم العاجل.', en:'Confirm product warranty and spare parts availability before urgent delivery.' }) });
  if (category === 'furniture')
    risks.push({ severity:'info', text: L({ ar:'تأكد من تضمين خدمة التركيب في عرض السعر لتجنب تكاليف إضافية.', en:'Ensure installation and assembly service is included in the quote to avoid extra costs.' }) });

  if (totalBudget > 200000)
    risks.push({ severity:'danger',  text: L({ ar:'الميزانية تتجاوز 200,000 AED — يستلزم موافقة المدير المالي قبل المتابعة.', en:'Budget exceeds 200,000 AED — requires CFO approval before proceeding.' }) });
  else if (totalBudget > 80000)
    risks.push({ severity:'warning', text: L({ ar:'ميزانية مرتفعة — يُنصح بالحصول على موافقة الإدارة العليا مسبقاً.', en:'High budget — recommend obtaining senior management approval in advance.' }) });
  else if (totalBudget > 30000)
    risks.push({ severity:'info',    text: L({ ar:'تجاوز حد الشراء المباشر — قد يتطلب مراجعة مالية أو عرض أسعار إضافي.', en:'Exceeds direct purchase limit — may require finance review or additional quotes.' }) });

  return risks;
}

export function risksAsStrings(risks) {
  return risks.map(r => (typeof r === 'string' ? r : r.text));
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. INSIGHT GENERATOR — dynamic, category & supplier specific
// ─────────────────────────────────────────────────────────────────────────────

function generateInsights(priority, quantity, category, complexity, delivery, tiers) {
  const msgs = [];

  msgs.push({ type:'success', icon:'bi-stars',
    text: L({ ar:'المورد الموصى به الأعلى تطابقاً مع متطلبات هذا الطلب المؤسسي.', en:'The recommended supplier best matches this enterprise procurement request.' }) });

  if (category === 'electronics')
    msgs.push({ type:'info', icon:'bi-shield-check',
      text: L({ ar:'اطلب ضماناً لا يقل عن سنة مع دعم فني متخصص بعد البيع.', en:'Request minimum 1-year warranty with dedicated post-sale technical support.' }) });
  if (category === 'furniture')
    msgs.push({ type:'info', icon:'bi-tools',
      text: L({ ar:'أضف خدمة التركيب والتجميع لتجنب أي تكاليف إضافية غير متوقعة.', en:'Include installation and assembly service to avoid unexpected additional costs.' }) });
  if (category === 'software')
    msgs.push({ type:'info', icon:'bi-lock-fill',
      text: L({ ar:'تأكد من تغطية الترخيص لجميع المستخدمين المطلوبين مع الامتثال القانوني.', en:'Ensure the license covers all required users with full legal compliance.' }) });
  if (category === 'printing')
    msgs.push({ type:'info', icon:'bi-printer-fill',
      text: L({ ar:'اطلب عينة موافقة قبل بدء الطباعة الكاملة للتحقق من الجودة والألوان.', en:'Request a proof sample before full print run to verify quality and colour accuracy.' }) });
  if (category === 'stationery' && quantity > 100)
    msgs.push({ type:'info', icon:'bi-box-seam',
      text: L({ ar:'الكميات الكبيرة من القرطاسية تحصل عادةً على خصم جملة إضافي.', en:'Large stationery quantities typically qualify for additional bulk discount pricing.' }) });

  if (priority === 'urgent')
    msgs.push({ type:'warning', icon:'bi-exclamation-triangle-fill',
      text: L({ ar:`التسليم العاجل قد يرفع التكلفة الإجمالية ${delivery.costIncreasePct}%.`, en:`Urgent delivery may increase total cost by ${delivery.costIncreasePct}%.` }) });

  if (quantity > 50)
    msgs.push({ type:'warning', icon:'bi-boxes',
      text: L({ ar:'كمية كبيرة — يُنصح بالحصول على عروض أسعار من 3 موردين على الأقل.', en:'Large quantity — recommend obtaining quotes from at least 3 suppliers.' }) });
  else if (quantity === 1)
    msgs.push({ type:'info', icon:'bi-lightbulb',
      text: L({ ar:'رفع الكمية قد يقلل تكلفة الوحدة بشكل ملحوظ.', en:'Increasing the quantity may significantly reduce the per-unit cost.' }) });

  if (complexity.level === 'critical')
    msgs.push({ type:'danger', icon:'bi-exclamation-octagon-fill',
      text: L({ ar:'تعقيد شراء حرج — يتطلب موافقة إدارية ومراجعة قانونية قبل الإرسال.', en:'Critical procurement complexity — requires management approval and legal review before submission.' }) });

  return msgs.slice(0, 5);
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. DYNAMIC INSIGHT for selected supplier
// ─────────────────────────────────────────────────────────────────────────────

export function generateSupplierInsight(supplier, aiTopSupplier, priority, category) {
  const rating    = parseFloat(supplier.rating) || 3;
  const topRating = parseFloat(aiTopSupplier?.rating) || rating;
  const isTop     = supplier.id === aiTopSupplier?.id;
  const n         = supplier.name;

  if (isTop)
    return { type:'success', icon:'bi-stars',
      text: L({ ar:`"${n}" هو الاختيار الأمثل للذكاء الاصطناعي — أعلى تطابق مع متطلبات الطلب.`, en:`"${n}" is the optimal AI selection — highest match score for this procurement request.` }) };
  if (rating > topRating)
    return { type:'success', icon:'bi-gem',
      text: L({ ar:`"${n}" يوفر جودة بريميوم أعلى وضماناً موسّعاً وإن كانت التكلفة أعلى.`, en:`"${n}" offers superior premium quality with extended warranty, though at a higher cost.` }) };
  if (rating < topRating - 0.5)
    return { type:'warning', icon:'bi-exclamation-triangle-fill',
      text: L({ ar:`"${n}" تقييمه أقل — قد يكون أرخص ولكن أبطأ في التسليم وأقل موثوقية.`, en:`"${n}" is rated lower — may be cheaper but slower on delivery and less reliable.` }) };
  if (category === 'printing')
    return { type:'info', icon:'bi-printer-fill',
      text: L({ ar:`"${n}" متخصص في الطباعة التجارية — مناسب للطلبات المتوسطة الحجم.`, en:`"${n}" specialises in commercial printing — suitable for medium-volume orders.` }) };
  if (category === 'electronics' && priority === 'urgent')
    return { type:'warning', icon:'bi-clock-history',
      text: L({ ar:`"${n}" مناسب للإلكترونيات — لكن التسليم العاجل يحتاج تنسيقاً إضافياً.`, en:`"${n}" is suitable for electronics — but urgent delivery requires additional coordination.` }) };
  if (priority === 'urgent')
    return { type:'warning', icon:'bi-clock-history',
      text: L({ ar:`"${n}" مناسب لكن التسليم العاجل قد يحتاج تأكيداً مسبقاً على التوفر.`, en:`"${n}" is suitable but urgent delivery may require prior confirmation of availability.` }) };
  return { type:'info', icon:'bi-lightbulb',
    text: L({ ar:`"${n}" خيار جيد بتقييم ${rating}/5 ومعدل توصيل موثوق.`, en:`"${n}" is a solid choice rated ${rating}/5 with reliable delivery performance.` }) };
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. RE-COMPUTE patch for live supplier switching
// ─────────────────────────────────────────────────────────────────────────────

export function recomputeForSupplier(supplier, baseResult) {
  const rating      = parseFloat(supplier.rating) || 3.5;
  const efficiency  = computeEfficiencyScore(rating, baseResult.priority, baseResult.complexity, baseResult.approvalProb);
  const approvalProb = computeApprovalProbability(
    baseResult.tiers.standard.price, baseResult.priority, rating, baseResult.quantity
  );
  const risks   = generateRisks(baseResult.quantity, baseResult.priority, rating, baseResult.tiers.standard.price, baseResult.category);
  const summary = generateSummary(supplier, baseResult.category, baseResult.priority, efficiency, approvalProb, baseResult.tiers.standard.price);
  const insight = generateSupplierInsight(supplier, baseResult.suppliers[0], baseResult.priority, baseResult.category);
  return { efficiency, approvalProb, risks, summary, insight };
}

// ─────────────────────────────────────────────────────────────────────────────
// 11. TITLE & DESCRIPTION TEMPLATES
// ─────────────────────────────────────────────────────────────────────────────

const TITLE_TPL = {
  electronics: (q, item) => L({ ar:`توفير ${q} وحدة ${item} لمتطلبات العمل المؤسسي`,   en:`Procure ${q} units of ${item} for enterprise business needs` }),
  printing:    (q, item) => L({ ar:`طباعة ${q} نسخة ${item} للاستخدام المؤسسي`,         en:`Print ${q} copies of ${item} for organisational use` }),
  furniture:   (q, item) => L({ ar:`شراء ${q} قطعة ${item} لمكاتب الموظفين`,            en:`Purchase ${q} units of ${item} for staff offices` }),
  stationery:  (q, item) => L({ ar:`توريد ${q} من ${item} للقسم الإداري`,               en:`Supply ${q} units of ${item} for the administrative department` }),
  software:    (q, item) => L({ ar:`ترخيص ${q} نسخة من ${item} للاستخدام المؤسسي`,     en:`License ${q} copies of ${item} for enterprise use` }),
  other:       (q, item) => L({ ar:`طلب توريد ${q} وحدة من ${item}`,                    en:`Request supply of ${q} units of ${item}` }),
};

const DESC_TPL = {
  electronics: (q, item, p) => L({
    ar:`توفير ${q} وحدة ${item} بمواصفات احترافية وضمان لا يقل عن سنة مع دعم فني.${p==='urgent'?' مطلوب بشكل عاجل.':''}`,
    en:`Supply ${q} units of ${item} with professional specifications and minimum 1-year warranty with technical support.${p==='urgent'?' Required urgently.':''}`,
  }),
  printing: (q, item, p) => L({
    ar:`طباعة ${q} نسخة ${item} بجودة ألوان عالية للتوزيع الرسمي مع نموذج موافقة مسبق.${p==='urgent'?' تسليم عاجل مطلوب.':''}`,
    en:`Print ${q} copies of ${item} in high-quality colour for official distribution with prior proof approval.${p==='urgent'?' Urgent delivery required.':''}`,
  }),
  furniture: (q, item) => L({
    ar:`شراء ${q} قطعة ${item} بمقاييس راحة مناسبة للاستخدام اليومي مع خدمة تركيب شاملة.`,
    en:`Purchase ${q} units of ${item} with ergonomic specifications for intensive daily use, including full installation service.`,
  }),
  stationery: (q, item) => L({
    ar:`توريد ${q} من ${item} للأقسام الإدارية بجودة موثوقة وتسليم منتظم.`,
    en:`Supply ${q} units of ${item} to administrative departments with reliable quality and regular delivery schedule.`,
  }),
  software: (q, item) => L({
    ar:`${q} ترخيص ${item} يشمل الدعم الفني والتحديثات والامتثال القانوني لمدة سنة كاملة.`,
    en:`${q} ${item} licenses including technical support, updates, and full legal compliance for one year.`,
  }),
  other: (q, item) => L({
    ar:`توريد ${q} وحدة من ${item} لاحتياجات المؤسسة بالمواصفات المطلوبة.`,
    en:`Supply ${q} units of ${item} for organisational needs to the required specifications.`,
  }),
};

// ─────────────────────────────────────────────────────────────────────────────
// 12. APPROVAL WORKFLOW PREDICTOR
// ─────────────────────────────────────────────────────────────────────────────

export function approvalWorkflowLabel(approvalProb, totalBudget) {
  if (totalBudget > 200000 || approvalProb < 60) return t('requests.ai_workflow_management');
  if (totalBudget > 80000  || approvalProb < 75) return t('requests.ai_workflow_finance');
  if (approvalProb >= 85)                        return t('requests.ai_workflow_fast');
  return t('requests.ai_workflow_normal');
}

// ─────────────────────────────────────────────────────────────────────────────
// 13. AI SUMMARY GENERATOR — executive one-liner
// ─────────────────────────────────────────────────────────────────────────────

export function generateSummary(supplier, category, priority, efficiency, approvalProb, totalBudget) {
  const urgTag = {
    urgent: L({ ar:'تسليم عاجل',      en:'Urgent delivery'    }),
    high:   L({ ar:'أولوية عالية',    en:'High priority'      }),
    medium: L({ ar:'توصيل اعتيادي',   en:'Standard delivery'  }),
    low:    L({ ar:'توصيل مرن',       en:'Flexible delivery'  }),
  }[priority] || '';

  const catExplain = {
    electronics: L({ ar:'تخصص قوي في الإلكترونيات المؤسسية',         en:'strong electronics specialisation' }),
    printing:    L({ ar:'خبرة في الطباعة التجارية والمؤسسية',          en:'commercial and enterprise printing expertise' }),
    furniture:   L({ ar:'تشكيلة أثاث مكتبي واسعة مع خدمة تركيب',     en:'wide office furniture range with installation service' }),
    stationery:  L({ ar:'توفر مخزون مستمر وأسعار جملة تنافسية',       en:'consistent stock availability and competitive bulk pricing' }),
    software:    L({ ar:'تراخيص معتمدة ودعم فني متخصص',               en:'certified licenses and specialist technical support' }),
    other:       L({ ar:'موثوقية عالية وتقييم ممتاز',                  en:'high reliability and excellent rating' }),
  }[category] || '';

  const workflow = approvalWorkflowLabel(approvalProb, totalBudget || 0);

  return L({
    ar: `يوصى بـ "${supplier.name}" بسبب ${catExplain}، تقييم ${supplier.rating}/5، كفاءة شراء ${efficiency}%، موافقة ${approvalProb}% · ${workflow} · ${urgTag}.`,
    en: `"${supplier.name}" is recommended due to ${catExplain}, rating ${supplier.rating}/5, procurement efficiency ${efficiency}%, approval ${approvalProb}% · ${workflow} · ${urgTag}.`,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXPORT — analyzeRequest
// ─────────────────────────────────────────────────────────────────────────────

export async function analyzeRequest(text) {
  const category = detectCategory(text);
  const quantity = detectQuantity(text);
  const priority = detectPriority(text);
  const itemKey  = detectItemKey(text, category);
  const mainItem = extractMainItem(text, category, itemKey);
  const delivery = DELIVERY_CONFIG[priority] || DELIVERY_CONFIG.medium;
  const tiers    = computeBudgetTiers(category, quantity, itemKey, delivery.urgencyFactor);

  const allSuppliers = await fetchSuppliers();
  const reasons      = REASON_POOL[category] || REASON_POOL.other;

  // STRICT CATEGORY FILTER — only show suppliers matching the detected category
  const categorySuppliers = allSuppliers.filter(s => s.category === category);
  // Fall back to 'other' suppliers only if truly no category match exists
  const pool = categorySuppliers.length > 0 ? categorySuppliers : allSuppliers.filter(s => s.category === 'other');

  const scored = pool
    .map(s => ({ ...s, _raw: scoreSupplier(s, category, priority) }))
    .sort((a, b) => b._raw - a._raw)
    .slice(0, 3);

  const ranked = scored.map((s, i) => {
    const reasonFn = reasons[i % reasons.length];
    const whyNotFn = i > 0
      ? (RANK_REJECTION[i] || (() => L({ ar:'أداء توصيل أقل من المورد الأول.', en:'Lower delivery performance than the top-ranked supplier.' })))
      : null;
    return {
      ...s,
      matchScore: mapScoreToDisplay(s._raw, i),
      get reason()  { return typeof reasonFn === 'function' ? reasonFn()  : reasonFn; },
      get whyNot()  { return typeof whyNotFn === 'function' ? whyNotFn()  : whyNotFn; },
      tags:         assignTags(s, s._raw, i, priority),
      estimatedPrice: i === 0 ? tiers.standard.price
                    : i === 1 ? tiers.budget.price
                    :            tiers.premium.price,
    };
  });

  const topRating    = parseFloat(ranked[0]?.rating) || 3.5;
  const complexity   = computeComplexity(priority, quantity, category, tiers.standard.price);
  const approvalProb = computeApprovalProbability(tiers.standard.price, priority, topRating, quantity);
  const efficiency   = computeEfficiencyScore(topRating, priority, complexity, approvalProb);
  const confidence   = computeConfidence(category, quantity, priority, ranked.length);
  const insights     = generateInsights(priority, quantity, category, complexity, delivery, tiers);
  const risks        = generateRisks(quantity, priority, topRating, tiers.standard.price, category);
  const summary      = ranked[0] ? generateSummary(ranked[0], category, priority, efficiency, approvalProb, tiers.standard.price) : '';

  return {
    category,
    quantity,
    priority,
    priorityLabel: t(`requests.ai_priority_${priority}`) || priority,
    title:         (TITLE_TPL[category] || TITLE_TPL.other)(quantity, mainItem),
    description:   (DESC_TPL[category]  || DESC_TPL.other)(quantity, mainItem, priority),
    tiers,
    suppliers:     ranked,
    delivery,
    confidence,
    efficiency,
    approvalProb,
    complexity,
    insights,
    risks,
    summary,
    mainItem,
  };
}
