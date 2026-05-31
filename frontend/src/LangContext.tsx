import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import WebApp from '@twa-dev/sdk';
import { T } from './i18n';
import type { Lang, Translations } from './i18n';

interface LangCtx {
  lang:    Lang;
  setLang: (l: Lang) => void;
  t:       Translations;
}

const Ctx = createContext<LangCtx>({ lang: 'ru', setLang: () => {}, t: T.ru });

function detectLang(): Lang {
  const saved = localStorage.getItem('syn_lang') as Lang | null;
  if (saved === 'ru' || saved === 'en') return saved;
  const tgLang = (WebApp.initDataUnsafe as any)?.user?.language_code ?? '';
  return String(tgLang).startsWith('en') ? 'en' : 'ru';
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectLang);

  const setLang = (l: Lang) => {
    setLangState(l);
    localStorage.setItem('syn_lang', l);
  };

  return (
    <Ctx.Provider value={{ lang, setLang, t: T[lang] }}>
      {children}
    </Ctx.Provider>
  );
}

export function useLang(): LangCtx {
  return useContext(Ctx);
}
