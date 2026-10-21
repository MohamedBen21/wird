import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { findChapters, parseReference, type Reference } from '../core/reference';
import type { ChapterMeta, ChapterView, Lang, SearchHit, VerseView } from '../core/types';
import { sendToBackground } from '../shared/messages';
import { readerPosItem, updateSettings } from '../shared/storage';
import type { UiContext } from './hooks';
import type { T } from '../shared/i18n';
import { copyText, displayArabic, presentLangs, toArabicIndic } from './util';

interface Props {
  ui: UiContext;
  initial: { surah?: number; ayah?: number };
  onClose: () => void;
}

interface Current {
  surah: number;
  /** Verse to scroll to and highlight. */
  ayah?: number;
  /** End of a highlighted range. */
  to?: number;
}

interface Loaded {
  view: ChapterView;
  basmala: string | null;
}

interface SearchState {
  ref?: Reference;
  matches: ChapterMeta[];
  hits: SearchHit[];
  truncated: boolean;
}

const surahMain = (m: ChapterMeta, lang: Lang) => (lang === 'ar' ? m.ar : m.tr);
const surahSub = (m: ChapterMeta, lang: Lang) => (lang === 'ar' ? m.tr : lang === 'fr' ? m.fr : m.en);

function verseToText(v: VerseView, meta: ChapterMeta, lang: Lang): string {
  const body = presentLangs(v.texts)
    .map((l) => v.texts[l])
    .join('\n\n');
  return `${body}\n\n— ${surahMain(meta, lang)} ${v.surah}:${v.ayah}`;
}

// ------------------------------------------------------------------------------------ verse

interface VerseItemProps {
  verse: VerseView;
  fontSize: number;
  highlighted: boolean;
  copied: boolean;
  t: T;
  onCopy: (v: VerseView) => void;
}

const VerseItem = memo(function VerseItem({ verse, fontSize, highlighted, copied, t, onCopy }: VerseItemProps) {
  const langs = presentLangs(verse.texts);
  return (
    <div className={`verse${highlighted ? ' is-target' : ''}`} data-ayah={verse.ayah}>
      <div className="verse-head">
        <span className="verse-ref">
          {verse.surah}:{verse.ayah}
        </span>
        <button className="btn btn-ghost" onClick={() => onCopy(verse)}>
          {copied ? t('copied') : t('copy')}
        </button>
      </div>
      {langs.map((l) =>
        l === 'ar' ? (
          <p key={l} className="t-ar" lang="ar" dir="rtl" style={{ fontSize }}>
            {displayArabic(verse.texts.ar ?? '')} <span className="end-mark">﴿{toArabicIndic(verse.ayah)}﴾</span>
          </p>
        ) : (
          <p key={l} className="t-tr" lang={l} dir="ltr">
            {verse.texts[l]}
          </p>
        ),
      )}
    </div>
  );
});

// ------------------------------------------------------------------------------------ reader

export function Reader({ ui, initial, onClose }: Props) {
  const { settings, t, lang, dir } = ui;
  const langKey = settings.languages.join(',');

  const [chapters, setChapters] = useState<ChapterMeta[] | null>(null);
  const [current, setCurrent] = useState<Current | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState<SearchState | null>(null);
  const [error, setError] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const bodyRef = useRef<HTMLDivElement>(null);
  const scrollTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const searching = query.trim().length > 0;

  // Chapter list, then the starting position: the requested verse, or where the user stopped last time.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const list = await sendToBackground('repo:chapters');
        if (!alive) return;
        setChapters(list);
        if (initial.surah) {
          setCurrent({ surah: initial.surah, ayah: initial.ayah });
        } else {
          const pos = await readerPosItem.getValue();
          if (alive) setCurrent({ surah: pos.surah, ayah: pos.ayah > 1 ? pos.ayah : undefined });
        }
      } catch {
        if (alive) setError(true);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load the current surah (again when the displayed languages change).
  const surah = current?.surah;
  useEffect(() => {
    if (!surah) return;
    let alive = true;
    setError(false);
    sendToBackground('repo:chapter', { surah })
      .then((res) => alive && res && setLoaded(res))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [surah, langKey]);

  // Scroll to the requested verse (or the top) once the chapter is on screen.
  const ready = loaded?.view.meta.n === surah;
  const targetAyah = current?.ayah;
  useEffect(() => {
    if (!ready || searching) return;
    const body = bodyRef.current;
    if (!body) return;
    const go = () => {
      if (targetAyah) body.querySelector(`[data-ayah="${targetAyah}"]`)?.scrollIntoView({ block: 'start' });
      else body.scrollTo({ top: 0 });
    };
    const raf = requestAnimationFrame(go);
    const later = setTimeout(go, 150); // content-visibility can shift heights after first paint
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(later);
    };
  }, [ready, surah, targetAyah, searching]);

  useEffect(() => {
    if (surah) void readerPosItem.setValue({ surah, ayah: targetAyah ?? 1 });
  }, [surah, targetAyah]);

  // Debounced search: verse reference, surah name, then full text.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setSearch(null);
      return;
    }
    if (!chapters) return;
    let alive = true;
    const timer = setTimeout(async () => {
      const ref = parseReference(q, chapters) ?? undefined;
      const matches = ref ? [] : findChapters(q, chapters).slice(0, 6);
      let hits: SearchHit[] = [];
      let truncated = false;
      if (!ref && q.length >= 2) {
        try {
          const r = await sendToBackground('repo:search', { query: q });
          hits = r.hits;
          truncated = r.truncated;
        } catch {
          if (alive) setError(true);
        }
      }
      if (alive) setSearch({ ref, matches, hits, truncated });
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query, chapters, langKey]);

  // Esc: clear the search first, then close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (query) setQuery('');
      else onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [query, onClose]);

  useEffect(() => () => clearTimeout(scrollTimer.current), []);

  const open = useCallback((s: number, ayah?: number, to?: number) => {
    setQuery('');
    setCurrent({ surah: s, ayah, to });
  }, []);

  // Remember the verse at the top of the viewport (throttled).
  const onScroll = () => {
    if (scrollTimer.current) return;
    scrollTimer.current = setTimeout(() => {
      scrollTimer.current = undefined;
      const body = bodyRef.current;
      if (!body || !surah) return;
      const top = body.getBoundingClientRect().top + 56;
      for (const el of body.querySelectorAll<HTMLElement>('.verse')) {
        if (el.getBoundingClientRect().bottom > top) {
          void readerPosItem.setValue({ surah, ayah: Number(el.dataset.ayah) || 1 });
          break;
        }
      }
    }, 800);
  };

  const copyVerse = useCallback(
    async (v: VerseView) => {
      const meta = chapters?.[v.surah - 1];
      if (!meta) return;
      if (await copyText(verseToText(v, meta, lang))) {
        setCopiedKey(`${v.surah}:${v.ayah}`);
        setTimeout(() => setCopiedKey((k) => (k === `${v.surah}:${v.ayah}` ? null : k)), 1500);
      }
    },
    [chapters, lang],
  );

  const bump = (delta: number) => void updateSettings({ fontSize: settings.fontSize + delta });
  const prevGlyph = dir === 'rtl' ? '›' : '‹';
  const nextGlyph = dir === 'rtl' ? '‹' : '›';

  // -------------------------------------------------------------------------- views
  const renderSurahRow = (m: ChapterMeta) => (
    <button key={m.n} className="surah-row" onClick={() => open(m.n)}>
      <span className="surah-num">{m.n}</span>
      <span className="surah-names">
        <span className="surah-name-main">{surahMain(m, lang)}</span>
        <span className="surah-name-sub" style={{ display: 'block' }}>
          {surahSub(m, lang)} · {m.count} {t('verses')} · {m.type === 'meccan' ? t('meccan') : t('medinan')}
        </span>
      </span>
      {lang !== 'ar' && (
        <span className="surah-ar" lang="ar">
          {m.ar}
        </span>
      )}
    </button>
  );

  const renderSearch = () => {
    if (!search) return <div className="hint">{t('loading')}</div>;
    const { ref, matches, hits, truncated } = search;
    const nothing = !ref && matches.length === 0 && hits.length === 0;
    return (
      <>
        {ref && chapters && (
          <>
            <div className="section-label">{t('surahs')}</div>
            <button className="surah-row" onClick={() => open(ref.surah, ref.from, ref.to)}>
              <span className="surah-num">{ref.surah}</span>
              <span className="surah-names">
                <span className="surah-name-main">
                  {surahMain(chapters[ref.surah - 1], lang)}
                  {ref.from ? ` ${ref.surah}:${ref.from}${ref.to ? `–${ref.to}` : ''}` : ''}
                </span>
                <span className="surah-name-sub" style={{ display: 'block' }}>
                  {surahSub(chapters[ref.surah - 1], lang)}
                </span>
              </span>
            </button>
          </>
        )}
        {matches.length > 0 && (
          <>
            <div className="section-label">{t('surahs')}</div>
            {matches.map(renderSurahRow)}
          </>
        )}
        {hits.length > 0 && chapters && (
          <>
            <div className="section-label">{t('results')}</div>
            {hits.map((h) => (
              <div className="verse" key={`${h.surah}:${h.ayah}`}>
                <div className="verse-head">
                  <button className="btn btn-ghost verse-ref" onClick={() => open(h.surah, h.ayah)}>
                    {surahMain(chapters[h.surah - 1], lang)} {h.surah}:{h.ayah}
                  </button>
                  <button className="btn btn-ghost" onClick={() => open(h.surah, h.ayah)}>
                    {t('openReader')}
                  </button>
                </div>
                {presentLangs(h.texts).map((l) =>
                  l === 'ar' ? (
                    <p key={l} className="t-ar" lang="ar" dir="rtl" style={{ fontSize: settings.fontSize }}>
                      {displayArabic(h.texts.ar ?? '')}
                    </p>
                  ) : (
                    <p key={l} className="t-tr" lang={l} dir="ltr">
                      {h.texts[l]}
                    </p>
                  ),
                )}
              </div>
            ))}
            {truncated && <div className="more">{t('moreResults')}</div>}
          </>
        )}
        {nothing && <div className="hint">{t('noResults')}</div>}
      </>
    );
  };

  const renderChapter = () => {
    if (!current || !chapters) return null;
    const meta = chapters[current.surah - 1];
    if (!ready || !loaded) return <div className="hint">{t('loading')}</div>;
    const { view, basmala } = loaded;
    return (
      <>
        <div className="chapter-head">
          <button className="btn btn-icon" onClick={() => setCurrent(null)} title={t('back')} aria-label={t('back')}>
            ☰
          </button>
          <button
            className="btn btn-icon"
            disabled={current.surah <= 1}
            onClick={() => open(current.surah - 1)}
            title={t('prevSurah')}
            aria-label={t('prevSurah')}
          >
            {prevGlyph}
          </button>
          <div className="chapter-title">
            <b>
              {current.surah}. {surahMain(meta, lang)}
            </b>
            <span>
              {surahSub(meta, lang)} · {meta.count} {t('verses')}
            </span>
          </div>
          <button
            className="btn btn-icon"
            disabled={current.surah >= 114}
            onClick={() => open(current.surah + 1)}
            title={t('nextSurah')}
            aria-label={t('nextSurah')}
          >
            {nextGlyph}
          </button>
        </div>
        {basmala && (
          <p className="basmala" lang="ar" dir="rtl" style={{ fontSize: settings.fontSize + 2 }}>
            {basmala}
          </p>
        )}
        {view.verses.map((v) => (
          <VerseItem
            key={v.ayah}
            verse={v}
            fontSize={settings.fontSize}
            highlighted={
              current.ayah !== undefined && v.ayah >= current.ayah && v.ayah <= (current.to ?? current.ayah)
            }
            copied={copiedKey === `${v.surah}:${v.ayah}`}
            t={t}
            onCopy={copyVerse}
          />
        ))}
        <div className="nav-foot">
          <button className="btn" disabled={current.surah <= 1} onClick={() => open(current.surah - 1)}>
            {prevGlyph} {t('prevSurah')}
          </button>
          <button className="btn" disabled={current.surah >= 114} onClick={() => open(current.surah + 1)}>
            {t('nextSurah')} {nextGlyph}
          </button>
        </div>
      </>
    );
  };

  return (
    <aside className="reader" role="dialog" aria-label={t('reader')} dir={dir}>
      <div className="reader-head">
        <div className="reader-title">{t('reader')}</div>
        <button className="btn btn-icon" onClick={() => bump(-2)} title={t('fontSmaller')} aria-label={t('fontSmaller')}>
          A−
        </button>
        <button className="btn btn-icon" onClick={() => bump(2)} title={t('fontLarger')} aria-label={t('fontLarger')}>
          A+
        </button>
        <button className="btn btn-icon" onClick={onClose} title={t('close')} aria-label={t('close')}>
          ×
        </button>
      </div>

      <div className="search">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('searchPlaceholder')}
          aria-label={t('searchPlaceholder')}
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      <div className="reader-body" ref={bodyRef} onScroll={onScroll}>
        {error ? (
          <div className="hint">{t('loadError')}</div>
        ) : searching ? (
          renderSearch()
        ) : !chapters ? (
          <div className="hint">{t('loading')}</div>
        ) : current ? (
          renderChapter()
        ) : (
          <>
            <div className="section-label">{t('surahs')}</div>
            {chapters.map(renderSurahRow)}
          </>
        )}
      </div>
    </aside>
  );
}
