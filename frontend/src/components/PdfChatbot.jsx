import { useState, useRef, useEffect, useCallback } from 'react';
import { MessageCircle, Send, Loader2, Bot, User, AlertCircle } from 'lucide-react';

function normalizeMarkdown(rawText) {
  const normalized = String(rawText || '')
    // Convert malformed fences like "```csharp using ..." into proper fenced blocks.
    .replace(/^```([A-Za-z0-9_+-]+)\s+([^\n]+)$/gm, '```$1\n$2')
    .replace(/\r\n/g, '\n');

  const fenceCount = (normalized.match(/```/g) || []).length;
  if (fenceCount % 2 === 1) {
    return `${normalized}\n\n\`\`\``;
  }
  return normalized;
}

function renderInline(text) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={index}>{part.slice(1, -1)}</code>;
    }
    return part;
  });
}

function FormattedMessage({ text }) {
  const lines = normalizeMarkdown(text).split('\n');
  const blocks = [];
  let paragraph = [];
  let listType = null;
  let listItems = [];
  let inCode = false;
  let codeLanguage = '';
  let codeLines = [];

  const flushCode = () => {
    if (!codeLines.length && !codeLanguage) return;
    blocks.push({ type: 'code', language: codeLanguage, text: codeLines.join('\n') });
    codeLines = [];
    codeLanguage = '';
  };

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push({ type: 'paragraph', text: paragraph.join(' ') });
    paragraph = [];
  };

  const flushList = () => {
    if (!listItems.length) return;
    blocks.push({ type: listType, items: [...listItems] });
    listItems = [];
    listType = null;
  };

  lines.forEach((rawLine) => {
    const fenceMatch = rawLine.match(/^```\s*([A-Za-z0-9_+-]+)?\s*$/);
    if (fenceMatch) {
      flushParagraph();
      flushList();

      if (inCode) {
        flushCode();
        inCode = false;
      } else {
        inCode = true;
        codeLanguage = (fenceMatch[1] || '').toLowerCase();
      }
      return;
    }

    if (inCode) {
      codeLines.push(rawLine);
      return;
    }

    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      return;
    }

    if (/^-{3,}$/.test(line)) {
      flushParagraph();
      flushList();
      blocks.push({ type: 'hr' });
      return;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length,
        text: headingMatch[2],
      });
      return;
    }

    const unorderedMatch = line.match(/^[-*]\s+(.+)/);
    if (unorderedMatch) {
      flushParagraph();
      if (listType && listType !== 'ul') flushList();
      listType = 'ul';
      listItems.push(unorderedMatch[1]);
      return;
    }

    const orderedMatch = line.match(/^\d+\.\s+(.+)/);
    if (orderedMatch) {
      flushParagraph();
      if (listType && listType !== 'ol') flushList();
      listType = 'ol';
      listItems.push(orderedMatch[1]);
      return;
    }

    flushList();
    paragraph.push(line);
  });

  if (inCode) {
    flushCode();
  }

  flushParagraph();
  flushList();

  return (
    <div className="pdf-chat-msg__formatted">
      {blocks.map((block, index) => {
        if (block.type === 'code') {
          return (
            <div key={index} className="pdf-chat-msg__code-wrap">
              {block.language && <div className="pdf-chat-msg__code-lang">{block.language}</div>}
              <pre className="pdf-chat-msg__code-block">
                <code>{block.text}</code>
              </pre>
            </div>
          );
        }

        if (block.type === 'hr') {
          return <hr key={index} className="pdf-chat-msg__rule" />;
        }

        if (block.type === 'heading') {
          const headingClass = `pdf-chat-msg__heading pdf-chat-msg__heading--h${Math.min(block.level, 6)}`;
          return <p key={index} className={headingClass}>{renderInline(block.text)}</p>;
        }

        if (block.type === 'paragraph') {
          return <p key={index}>{renderInline(block.text)}</p>;
        }

        if (block.type === 'ol') {
          return (
            <ol key={index}>
              {block.items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item)}</li>)}
            </ol>
          );
        }

        return (
          <ul key={index}>
            {block.items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item)}</li>)}
          </ul>
        );
      })}
    </div>
  );
}

function getInitialMessage() {
  return [{ role: 'bot', text: 'How can I help you?' }];
}

/**
 * PdfChatbot — embedded chatbot panel for PDF file preview.
 *
 * Props:
 *   fileName       – the PDF filename (used to trigger /chatbot/process-pdf)
 *   fileId         – Firestore document id for the file
 *   authorizedFetch – the makeAuthorizedFetch(idToken) wrapper from useFiles
 *   visible        – whether the panel is currently shown
 */
export default function PdfChatbot({ fileName, fileId, authorizedFetch, visible }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);       // bot is typing
  const [processing, setProcessing] = useState(false);  // PDF being indexed
  const [ready, setReady] = useState(false);             // index built
  const [error, setError] = useState(null);

  const messagesEndRef = useRef(null);
  const prevFileRef = useRef(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // ── Process PDF whenever fileName changes ──
  const processPdf = useCallback(async () => {
    if (!fileName || !fileId || !authorizedFetch) return;

    setProcessing(true);
    setReady(false);
    setError(null);
    setMessages([]);

    try {
      const res = await authorizedFetch('/chatbot/process-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_name: fileName }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to process PDF for chatbot.');
      }

      const data = await res.json();
      const history = Array.isArray(data.history) && data.history.length
        ? data.history.map((message) => ({
            role: message.role,
            text: message.text,
            timestamp: message.timestamp,
          }))
        : getInitialMessage();

      setReady(true);
      setMessages(history);
    } catch (err) {
      setError(err.message);
    } finally {
      setProcessing(false);
    }
  }, [fileId, fileName, authorizedFetch]);

  useEffect(() => {
    if (visible && fileName && fileName !== prevFileRef.current) {
      prevFileRef.current = fileName;
      processPdf();
    }
  }, [visible, fileName, processPdf]);

  // ── Ask a question ──
  const handleAsk = useCallback(async () => {
    const question = input.trim();
    if (!question || loading || !ready) return;

    setMessages(prev => [...prev, { role: 'user', text: question }]);
    setInput('');
    setLoading(true);

    try {
      const res = await authorizedFetch('/chatbot/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to get answer.');
      }

      const data = await res.json();
      setMessages(prev => [...prev, { role: 'bot', text: data.answer }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'bot', text: `Error: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, ready, authorizedFetch]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAsk();
    }
  };

  if (!visible) return null;

  // ── Processing state ──
  if (processing) {
    return (
      <div className="pdf-chatbot-panel">
        <div className="pdf-chatbot-panel__header">
          <Bot size={18} />
          <h4>PDF Assistant</h4>
        </div>
        <div className="pdf-chatbot-panel__loading">
          <Loader2 size={32} className="spin-icon" />
          <p>Analyzing PDF content...</p>
          <small>Extracting text, building index & embeddings</small>
        </div>
      </div>
    );
  }

  // ── Error state ──
  if (error) {
    return (
      <div className="pdf-chatbot-panel">
        <div className="pdf-chatbot-panel__header">
          <Bot size={18} />
          <h4>PDF Assistant</h4>
        </div>
        <div className="pdf-chatbot-panel__error">
          <AlertCircle size={28} />
          <p>{error}</p>
          <button className="primary-btn" onClick={processPdf}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="pdf-chatbot-panel">
      {/* Header */}
      <div className="pdf-chatbot-panel__header">
        <Bot size={18} />
        <h4>PDF Assistant</h4>
      </div>

      {/* Messages */}
      <div className="pdf-chatbot-panel__messages">
        {messages.length === 0 && !loading ? (
          <div className="pdf-chatbot-panel__welcome">
            <MessageCircle size={28} />
            <p>Ask anything about this document</p>
          </div>
        ) : (
          <>
            {messages.map((msg, i) => (
              <div key={i} className={`pdf-chat-msg pdf-chat-msg--${msg.role}`}>
                <div className="pdf-chat-msg__avatar">
                  {msg.role === 'user' ? <User size={14} /> : <Bot size={14} />}
                </div>
                <div className="pdf-chat-msg__bubble">
                  <FormattedMessage text={msg.text} />
                </div>
              </div>
            ))}
            {loading && (
              <div className="pdf-chat-msg pdf-chat-msg--bot">
                <div className="pdf-chat-msg__avatar"><Bot size={14} /></div>
                <div className="pdf-chat-msg__bubble">
                  <span className="pdf-chatbot-typing">
                    <span /><span /><span />
                  </span>
                </div>
              </div>
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="pdf-chatbot-panel__input">
        <input
          type="text"
          placeholder={ready ? 'Ask about this PDF...' : 'Loading...'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading || !ready}
        />
        <button
          className="pdf-chatbot-send-btn"
          onClick={handleAsk}
          disabled={loading || !input.trim() || !ready}
          title="Send"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
