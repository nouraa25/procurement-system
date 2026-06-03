import { ar } from '../lang/ar.js';
import { en } from '../lang/en.js';

const translations = { ar, en };

let currentLang = localStorage.getItem('language') || 'ar';

export function t(key) {
  const keys = key.split('.');
  let value = translations[currentLang];

  for (const k of keys) {
    value = value?.[k];
  }

  return value || key;
}

export function setLanguage(lang) {
  currentLang = lang;
  localStorage.setItem('language', lang);

  const html = document.documentElement;
  html.lang = lang;
  html.dir = lang === 'ar' ? 'rtl' : 'ltr';

  const bootstrapLink = document.getElementById('bootstrap-css');
  if (lang === 'ar') {
    bootstrapLink.href = 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.rtl.min.css';
  } else {
    bootstrapLink.href = 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css';
  }
}

export function getCurrentLanguage() {
  return currentLang;
}

export function toggleLanguage() {
  const newLang = currentLang === 'ar' ? 'en' : 'ar';
  setLanguage(newLang);
  window.location.reload();
}
