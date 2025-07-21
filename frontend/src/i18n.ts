import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import HttpBackend from 'i18next-http-backend';
import LanguageDetector from 'i18next-browser-languagedetector';

i18n
    // Load translation files using HTTP backend
    .use(HttpBackend)
    // Detect browser language
    .use(LanguageDetector)
    // Pass i18n instance to react-i18next
    .use(initReactI18next)
    .init({
        // Language detection options
        detection: {
            // Detection order: localStorage -> navigator -> default
            order: ['localStorage', 'navigator'],
            // Cache user choice to localStorage
            caches: ['localStorage'],
            // localStorage key name
            lookupLocalStorage: 'i18nextLng',
        },

        // Supported languages (BCP 47 standard)
        supportedLngs: ['en'],

        // Fallback language
        fallbackLng: 'en',

        // Default namespace
        defaultNS: 'translation',

        // Backend options
        backend: {
            // Path to translation files
            loadPath: '/locales/{{lng}}/{{ns}}.json',
        },

        // Debug mode (development only)
        debug: import.meta.env.DEV,

        // Interpolation options
        interpolation: {
            // React already does escaping
            escapeValue: false,
        },
    });

export default i18n; 