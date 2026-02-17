import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  Mic, MicOff, Search, Sparkles, FileText, Share2, User,
  Calendar, Loader2, X, ArrowRight, Volume2, AudioLines, ExternalLink
} from 'lucide-react';
import { API_BASE_URL } from '../utils/api';

const EXAMPLE_QUERIES = [
  "Which files did I upload in February?",
  "Who did I share my files with?",
  "What was the last file I shared?",
  "Show me files larger than 1MB",
  "Which files expire this month?",
  "Show files shared with me",
];

function getSpeechRecognition() {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export default function SmartSearch() {
  const { idToken, filesState } = useOutletContext();
  const [query, setQuery] = useState('');
  const [listening, setListening] = useState(false);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [description, setDescription] = useState('');
  const [interimText, setInterimText] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);
  const recognitionRef = useRef(null);
  const inputRef = useRef(null);
  const audioIntervalRef = useRef(null);

  const SpeechRecognitionClass = getSpeechRecognition();
  const speechSupported = Boolean(SpeechRecognitionClass);

  const startListening = useCallback(() => {
    if (!SpeechRecognitionClass) {
      setError('Voice search is not supported in this browser. Please use Chrome or Edge.');
      return;
    }

    const recognition = new SpeechRecognitionClass();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setListening(true);
      // Simulate audio level animation
      audioIntervalRef.current = setInterval(() => {
        setAudioLevel(Math.random() * 100);
      }, 120);
    };

    recognition.onresult = (e) => {
      let interim = '';
      let final = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const transcript = e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          final += transcript;
        } else {
          interim += transcript;
        }
      }
      if (final) {
        setQuery(final);
        setInterimText('');
      } else {
        setInterimText(interim);
      }
    };

    recognition.onerror = (e) => {
      console.error('Speech recognition error:', e.error);
      setListening(false);
      setInterimText('');
      clearInterval(audioIntervalRef.current);
      setAudioLevel(0);
      if (e.error === 'not-allowed') {
        setError('Microphone access denied. Please allow microphone permission and try again.');
      } else if (e.error !== 'aborted') {
        setError('Voice recognition failed. Please try again or type your query.');
      }
    };

    recognition.onend = () => {
      setListening(false);
      setInterimText('');
      clearInterval(audioIntervalRef.current);
      setAudioLevel(0);
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [SpeechRecognitionClass]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    clearInterval(audioIntervalRef.current);
    setAudioLevel(0);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
      clearInterval(audioIntervalRef.current);
    };
  }, []);

  // ── Search handler ────────────────────────────
  const handleSearch = useCallback(async (searchQuery) => {
    const q = (searchQuery || query).trim();
    if (!q) return;

    setLoading(true);
    setError('');
    setResults(null);
    setDescription('');

    try {
      const resp = await fetch(`${API_BASE_URL}/smart-search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ query: q }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || `Server error (${resp.status})`);
      }

      const data = await resp.json();
      setResults(data.results || []);
      setDescription(data.description || '');
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }, [query, idToken]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSearch();
    }
  };

  const handleExampleClick = (example) => {
    setQuery(example);
    handleSearch(example);
  };

  // ── Format result cards ───────────────────────
  const formatTimestamp = (val) => {
    if (!val) return '—';
    try {
      const d = new Date(val);
      return d.toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    } catch {
      return String(val);
    }
  };

  const handleOpenFile = useCallback((item) => {
    if (!filesState?.handleFileSelect) return;
    // Build a file object compatible with handleFileSelect
    const fileObj = {
      ...item,
      file_name: item.file_name || item.file_id?.split(':').pop() || 'Unknown',
      id: item._doc_id || item.file_id,
    };
    filesState.handleFileSelect(fileObj);
  }, [filesState]);

  const renderResultCard = (item, idx) => {
    const fileName = item.file_name || item.file_id?.split(':').pop() || 'Unknown';
    const isShared = !!item.shared_user_id || !!item.owner_id_name;
    const icon = isShared ? Share2 : FileText;
    const IconComp = icon;

    return (
      <div
        key={item._doc_id || idx}
        className="smart-result-card clickable"
        onClick={() => handleOpenFile(item)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter') handleOpenFile(item); }}
      >
        <div className="smart-result-icon">
          <IconComp size={20} />
        </div>
        <div className="smart-result-info">
          <h4 className="smart-result-name">{fileName}</h4>
          <div className="smart-result-meta">
            {item.uploaded_at && (
              <span><Calendar size={13} /> {formatTimestamp(item.uploaded_at)}</span>
            )}
            {item.createdAt && !item.uploaded_at && (
              <span><Calendar size={13} /> {formatTimestamp(item.createdAt)}</span>
            )}
            {item.size && (
              <span><FileText size={13} /> {(item.size / 1024).toFixed(1)} KB</span>
            )}
            {item.permissions && (
              <span className="smart-result-badge">{item.permissions}</span>
            )}
          </div>
          {item.shared_user_id_name && (
            <div className="smart-result-user">
              <User size={13} /> Shared with: {item.shared_user_id_name}
              {item.shared_user_id_email && <span className="smart-result-email"> ({item.shared_user_id_email})</span>}
            </div>
          )}
          {item.owner_id_name && (
            <div className="smart-result-user">
              <User size={13} /> Owner: {item.owner_id_name}
              {item.owner_id_email && <span className="smart-result-email"> ({item.owner_id_email})</span>}
            </div>
          )}
          {item.tag_id && (
            <div className="smart-result-tag">Tag: {item.tag_id}</div>
          )}
        </div>
        <div className="smart-result-open">
          <ExternalLink size={16} />
          <span>Open</span>
        </div>
      </div>
    );
  };

  return (
    <main className="main-content smart-search-page">
      <header className="main-header">
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Sparkles size={28} className="smart-search-sparkle" />
            Smart Search
          </h1>
          <p>Ask anything about your files using voice or text — powered by AI.</p>
        </div>
      </header>

      {/* ── Search Input Area ── */}
      <div className="smart-search-container">
        <div className={`smart-search-box ${listening ? 'listening' : ''} ${loading ? 'searching' : ''}`}>
          <div className="smart-search-input-row">
            {/* Mic button — always visible */}
            <button
              className={`smart-mic-btn ${listening ? 'active' : ''}`}
              onClick={listening ? stopListening : startListening}
              title={listening ? 'Stop listening' : 'Start voice search'}
              type="button"
              disabled={loading}
            >
              <div className="mic-icon-wrapper">
                {listening ? <MicOff size={20} /> : <Mic size={20} />}
              </div>
              {listening && (
                <>
                  <span className="mic-ring ring-1" />
                  <span className="mic-ring ring-2" />
                  <span className="mic-ring ring-3" />
                </>
              )}
            </button>

            {/* Text input */}
            <div className="smart-input-wrapper">
              <input
                ref={inputRef}
                type="text"
                placeholder={listening ? 'Listening…' : 'Ask about your files…'}
                value={listening ? (interimText || query) : query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={loading || listening}
                className="smart-search-input"
              />
              {query && !loading && !listening && (
                <button
                  className="smart-clear-btn"
                  onClick={() => { setQuery(''); setResults(null); setDescription(''); setError(''); }}
                  type="button"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            {/* Search button */}
            <button
              className="smart-submit-btn"
              onClick={() => handleSearch()}
              disabled={loading || !query.trim()}
              type="button"
            >
              {loading ? <Loader2 size={20} className="spin" /> : <ArrowRight size={20} />}
            </button>
          </div>

          {/* Listening indicator with audio bars */}
          {listening && (
            <div className="smart-listening-bar">
              <div className="smart-listening-left">
                <div className="smart-audio-visualizer">
                  {Array.from({ length: 12 }).map((_, i) => (
                    <span
                      key={i}
                      className="smart-audio-bar"
                      style={{
                        height: `${Math.max(4, Math.sin((audioLevel + i * 30) * Math.PI / 180) * 20 + Math.random() * 10)}px`,
                        animationDelay: `${i * 0.08}s`,
                      }}
                    />
                  ))}
                </div>
                <span className="smart-listening-text">
                  <AudioLines size={16} className="pulse-icon" />
                  Listening… speak your question
                </span>
              </div>
              <button
                className="smart-stop-btn"
                onClick={stopListening}
                type="button"
              >
                Stop
              </button>
            </div>
          )}
        </div>

        {/* ── Example queries ── */}
        {!results && !loading && !error && (
          <div className="smart-examples">
            <p className="smart-examples-label">Try asking:</p>
            <div className="smart-examples-grid">
              {EXAMPLE_QUERIES.map((eq) => (
                <button
                  key={eq}
                  className="smart-example-chip"
                  onClick={() => handleExampleClick(eq)}
                  type="button"
                >
                  <Search size={14} />
                  {eq}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Error ── */}
        {error && (
          <div className="smart-error">
            <span>{error}</span>
            <button onClick={() => setError('')} type="button"><X size={16} /></button>
          </div>
        )}

        {/* ── Results ── */}
        {loading && (
          <div className="smart-loading">
            <div className="smart-loading-dots">
              <span />
              <span />
              <span />
            </div>
            <p>AI is analyzing your query…</p>
          </div>
        )}

        {results && !loading && (
          <div className="smart-results">
            <div className="smart-results-header">
              <Sparkles size={16} />
              <span className="smart-results-desc">{description}</span>
              <span className="smart-results-count">{results.length} result{results.length !== 1 ? 's' : ''}</span>
            </div>
            {results.length === 0 ? (
              <div className="smart-no-results">
                <FileText size={40} strokeWidth={1} />
                <p>No matching files found for your query.</p>
              </div>
            ) : (
              <div className="smart-results-list">
                {results.map((item, idx) => renderResultCard(item, idx))}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
