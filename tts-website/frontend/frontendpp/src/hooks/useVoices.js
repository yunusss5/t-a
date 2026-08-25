import { useState, useEffect } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE || 'https://tts-backend-33xv.onrender.com';

export function useVoices() {
  const [allVoices, setAllVoices] = useState([]);
  const [languageOptions, setLanguageOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchVoices() {
      try {
        const res = await fetch(`${API_BASE}/voices`);
        if (!res.ok) throw new Error('Failed to fetch voices');
        const data = await res.json();
        setAllVoices(data);
        const langs = [...new Set(data.map(v => v.locale))].sort();
        setLanguageOptions(langs);
        setLoading(false);
      } catch (err) {
        setError(err.message);
        setLoading(false);
      }
    }
    fetchVoices();
  }, []);

  // Helper to get voices for a specific language
  function getVoicesForLanguage(locale) {
    return allVoices.filter(v => v.locale === locale);
  }

  return { allVoices, languageOptions, getVoicesForLanguage, loading, error };
}